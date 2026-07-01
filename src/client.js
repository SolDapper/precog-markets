/**
 * @module client
 * High-level client that ties together PDA derivation, instruction building,
 * account fetching / deserialization, and transaction sending.
 */

import {
  Connection,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
  ComputeBudgetProgram,
} from "@solana/web3.js";

import { PROGRAM_ID, TokenDenomination, SYSTEM_PROGRAM_ID, ACCOUNT_DISCRIMINATORS } from "./constants.js";

import {
  findProtocolConfigAddress,
  findMarketAddress,
  findVaultAddress,
  findVaultAuthorityAddress,
  findPositionAddress,
  findMultisigAddress,
  findProposalAddress,
} from "./pda.js";

import {
  decodeMarket,
  decodeUserPosition,
  decodeProtocolConfig,
  decodeMultisigAuthority,
  decodeMultisigProposal,
} from "./accounts.js";

import * as ix from "./instructions.js";

import {
  validateMintForMarket,
  getTransferFeeConfig,
  parseMintExtensions,
} from "./token.js";

// ═══════════════════════════════════════════════════════════════════════
// Minimal base58 encoder for memcmp filter bytes
// ═══════════════════════════════════════════════════════════════════════
const BS58_ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function bs58Encode(buf) {
  const bytes = [...buf];
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) { carry += digits[j] * 256; digits[j] = carry % 58; carry = (carry / 58) | 0; }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  return BS58_ALPHA[0].repeat(zeros) + digits.reverse().map(d => BS58_ALPHA[d]).join('');
}

// ═══════════════════════════════════════════════════════════════════════
// Client
// ═══════════════════════════════════════════════════════════════════════

export class PrecogMarketsClient {
  /**
   * @param {Connection} connection
   * @param {PublicKey | {
   *   programId?: PublicKey,
   *   computeUnitMargin?: number,
   *   priorityLevel?: string,
   *   feeEstimator?: (connection: Connection, instructions: TransactionInstruction[], feePayer: PublicKey, opts: { priorityLevel: string }) => Promise<number>,
   * }} [optsOrProgramId] - Options object, or a PublicKey for backward compat
   */
  constructor(connection, optsOrProgramId) {
    /** @type {Connection} */ this.connection = connection;

    // Backward compat: second arg can be a PublicKey or an options object
    if (optsOrProgramId instanceof PublicKey) {
      /** @type {PublicKey} */ this.programId = optsOrProgramId;
      /** @type {number} */ this.computeUnitMargin = 1.1;
      /** @type {string} */ this.priorityLevel = "Medium";
      /** @type {Function|null} */ this.feeEstimator = null;
    } else {
      const opts = optsOrProgramId ?? {};
      this.programId = opts.programId ?? PROGRAM_ID;
      this.computeUnitMargin = opts.computeUnitMargin ?? 1.1;
      this.priorityLevel = opts.priorityLevel ?? "Medium";
      this.feeEstimator = opts.feeEstimator ?? null;
    }
  }

  // ── helpers ────────────────────────────────────────────────────────

  /**
   * Send a transaction containing one or more instructions.
   * @param {import("@solana/web3.js").TransactionInstruction[]} instructions
   * @param {import("@solana/web3.js").Signer[]} signers
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   * @returns {Promise<string>} tx signature
   */
  async sendTransaction(instructions, signers, opts) {
    const tx = new Transaction().add(...instructions);
    return sendAndConfirmTransaction(this.connection, tx, signers, opts);
  }

  /**
   * Build instructions only (for external wallet adapters / versioned txs).
   * Alias kept for discoverability.
   */
  buildInstructions = ix;

  // ── PDA convenience ────────────────────────────────────────────────

  findProtocolConfig() {
    return findProtocolConfigAddress(this.programId);
  }
  findMarket(authority, marketId) {
    return findMarketAddress(authority, marketId, this.programId);
  }
  findVault(market) {
    return findVaultAddress(market, this.programId);
  }
  findVaultAuthority(market) {
    return findVaultAuthorityAddress(market, this.programId);
  }
  findPosition(market, owner, outcomeIndex) {
    return findPositionAddress(market, owner, outcomeIndex, this.programId);
  }
  findMultisig(creator, nonce) {
    return findMultisigAddress(creator, nonce, this.programId);
  }
  findProposal(multisig, proposalId) {
    return findProposalAddress(multisig, proposalId, this.programId);
  }

  // ── account fetchers ──────────────────────────────────────────────

  /**
   * Generic fetch + decode.
   * @template T
   * @param {PublicKey} address
   * @param {(data: Buffer) => T} decoder
   * @returns {Promise<T|null>}
   */
  async _fetch(address, decoder) {
    const info = await this.connection.getAccountInfo(address);
    if (!info || !info.data) return null;
    return decoder(info.data);
  }

  /** @param {PublicKey} address */
  async fetchMarket(address) {
    return this._fetch(address, decodeMarket);
  }

  /** @param {PublicKey} address */
  async fetchUserPosition(address) {
    return this._fetch(address, decodeUserPosition);
  }

  /** @param {PublicKey} [address] - Derived automatically if omitted. */
  async fetchProtocolConfig(address) {
    if (!address) [address] = await this.findProtocolConfig();
    return this._fetch(address, decodeProtocolConfig);
  }

  /** @param {PublicKey} address */
  async fetchMultisigAuthority(address) {
    return this._fetch(address, decodeMultisigAuthority);
  }

  /** @param {PublicKey} address */
  async fetchMultisigProposal(address) {
    return this._fetch(address, decodeMultisigProposal);
  }

  // ── batch fetchers ────────────────────────────────────────────────

  /**
   * Fetch multiple accounts at once and decode.
   * @template T
   * @param {PublicKey[]} addresses
   * @param {(data: Buffer) => T} decoder
   * @returns {Promise<(T|null)[]>}
   */
  async _fetchMultiple(addresses, decoder) {
    const infos = await this.connection.getMultipleAccountsInfo(addresses);
    return infos.map((info) =>
      info && info.data ? decoder(info.data) : null
    );
  }

  /** @param {PublicKey[]} addresses */
  async fetchMarkets(addresses) {
    return this._fetchMultiple(addresses, decodeMarket);
  }

  /** @param {PublicKey[]} addresses */
  async fetchUserPositions(addresses) {
    return this._fetchMultiple(addresses, decodeUserPosition);
  }

  // ── gPA-based queries ─────────────────────────────────────────────

  /**
   * Fetch all Market accounts owned by this program.
   * Optionally filter by authority.
   * @param {{ authority?: PublicKey }} [filters]
   * @returns {Promise<Array<{ pubkey: PublicKey, account: import("./accounts.js").MarketAccount }>>}
   */
  async getAllMarkets(filters = {}) {
    const gpaFilters = [
      { memcmp: { offset: 0, bytes: bs58Encode(ACCOUNT_DISCRIMINATORS.MARKET) } },
    ];

    if (filters.authority) {
      // authority is at offset: 8 (disc) + 1 (bump) + 8 (marketId) = 17
      gpaFilters.push({
        memcmp: {
          offset: 17,
          bytes: filters.authority.toBase58(),
        },
      });
    }

    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: gpaFilters,
    });

    const results = [];
    for (const { pubkey, account } of accounts) {
      try {
        const decoded = decodeMarket(account.data);
        results.push({ pubkey, account: decoded });
      } catch {
        // Skip accounts that don't decode as Market (different account type)
      }
    }
    return results;
  }

  /**
   * Fetch all UserPosition accounts for a given owner.
   * @param {PublicKey} owner
   * @returns {Promise<Array<{ pubkey: PublicKey, account: import("./accounts.js").UserPositionAccount }>>}
   */
  async getPositionsByOwner(owner) {
    // owner is at offset: 8 (disc) + 1 (bump) + 32 (market) = 41
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58Encode(ACCOUNT_DISCRIMINATORS.USER_POSITION) } },
        { memcmp: { offset: 41, bytes: owner.toBase58() } },
      ],
    });

    const results = [];
    for (const { pubkey, account } of accounts) {
      try {
        const decoded = decodeUserPosition(account.data);
        results.push({ pubkey, account: decoded });
      } catch {
        // skip
      }
    }
    return results;
  }

  /**
   * Fetch all UserPosition accounts for a given market.
   * @param {PublicKey} market
   * @returns {Promise<Array<{ pubkey: PublicKey, account: import("./accounts.js").UserPositionAccount }>>}
   */
  async getPositionsByMarket(market) {
    // market is at offset: 8 (disc) + 1 (bump) = 9
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58Encode(ACCOUNT_DISCRIMINATORS.USER_POSITION) } },
        { memcmp: { offset: 9, bytes: market.toBase58() } },
      ],
    });

    const results = [];
    for (const { pubkey, account } of accounts) {
      try {
        const decoded = decodeUserPosition(account.data);
        results.push({ pubkey, account: decoded });
      } catch {
        // skip
      }
    }
    return results;
  }

  /**
   * Fetch all proposals for a given multisig.
   * @param {PublicKey} multisig
   * @returns {Promise<Array<{ pubkey: PublicKey, account: import("./accounts.js").MultisigProposalAccount }>>}
   */
  async getProposalsByMultisig(multisig) {
    // multisig is at offset: 8 (disc) + 1 (bump) = 9
    const accounts = await this.connection.getProgramAccounts(this.programId, {
      filters: [
        { memcmp: { offset: 0, bytes: bs58Encode(ACCOUNT_DISCRIMINATORS.MULTISIG_PROPOSAL) } },
        { memcmp: { offset: 9, bytes: multisig.toBase58() } },
      ],
    });

    const results = [];
    for (const { pubkey, account } of accounts) {
      try {
        const decoded = decodeMultisigProposal(account.data);
        results.push({ pubkey, account: decoded });
      } catch {
        // skip
      }
    }
    return results;
  }

  // ═════════════════════════════════════════════════════════════════════
  // HIGH-LEVEL TRANSACTIONAL METHODS
  // ═════════════════════════════════════════════════════════════════════

  /**
   * Initialize the protocol. Must be called once.
   * @param {import("@solana/web3.js").Signer} admin
   * @param {PublicKey} treasury
   * @param {number} defaultFeeBps
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   * @returns {Promise<{ signature: string, protocolConfig: PublicKey }>}
   */
  async initializeProtocol(admin, treasury, defaultFeeBps, opts) {
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.initializeProtocol(
      { protocolConfig, admin: admin.publicKey, treasury },
      { defaultFeeBps },
      this.programId
    );

    const signature = await this.sendTransaction([instruction], [admin], opts);
    return { signature, protocolConfig };
  }

  /**
   * Create a SOL-denominated prediction market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.payer - Pays rent (also authority for single-sig).
   * @param {PublicKey} [params.authority] - Market authority. Defaults to payer.publicKey.
   * @param {bigint|number} params.marketId
   * @param {string} params.title
   * @param {string} params.description
   * @param {string[]} params.outcomeLabels
   * @param {bigint|number} params.resolutionDeadline - Unix timestamp
   * @param {number|null} [params.feeBpsOverride]
   * @param {boolean} [params.authorityIsMultisig=false]
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   * @returns {Promise<{ signature: string, market: PublicKey, vault: PublicKey }>}
   */
  async createSolMarket(params) {
    const authority = params.authority ?? params.payer.publicKey;
    const [market] = await this.findMarket(authority, params.marketId);
    const [vault] = await this.findVault(market);
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.createMarket(
      { market, vault, authority, payer: params.payer.publicKey, protocolConfig },
      {
        marketId: params.marketId,
        title: params.title,
        description: params.description,
        outcomeLabels: params.outcomeLabels,
        resolutionDeadline: params.resolutionDeadline,
        feeBpsOverride: params.feeBpsOverride ?? null,
        denomination: TokenDenomination.NativeSol,
        authorityIsMultisig: params.authorityIsMultisig ?? false,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.payer],
      params.opts
    );
    return { signature, market, vault };
  }

  /**
   * Create an SPL Token or Token-2022 denominated market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.payer
   * @param {PublicKey} [params.authority]
   * @param {bigint|number} params.marketId
   * @param {string} params.title
   * @param {string} params.description
   * @param {string[]} params.outcomeLabels
   * @param {bigint|number} params.resolutionDeadline
   * @param {number|null} [params.feeBpsOverride]
   * @param {PublicKey} params.tokenMint
   * @param {PublicKey} params.tokenVault - Pre-created ATA owned by vaultAuthority PDA.
   * @param {PublicKey} params.tokenProgram - TOKEN_PROGRAM_ID or TOKEN_2022_PROGRAM_ID.
   * @param {number} params.denomination - 1=SplToken, 2=Token2022.
   * @param {boolean} [params.authorityIsMultisig=false]
   * @param {boolean} [params.validateMint=false] - If true, fetch the mint and
   *   reject unsupported Token-2022 extensions before sending the transaction.
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async createTokenMarket(params) {
    const authority = params.authority ?? params.payer.publicKey;
    const [market] = await this.findMarket(authority, params.marketId);
    const [vault] = await this.findVault(market);
    const [vaultAuthority] = await this.findVaultAuthority(market);
    const [protocolConfig] = await this.findProtocolConfig();

    // Optional client-side pre-flight: reject mints the program won't accept
    // before spending a transaction on them. Off by default to avoid an extra
    // RPC round-trip for callers who have already validated the mint.
    if (params.validateMint) {
      const v = await this.validateTokenMint(params.tokenMint);
      if (!v.ok) {
        const names = v.blocked.map((e) => e.name).join(", ");
        throw new Error(
          `mint ${params.tokenMint.toBase58()} has unsupported extension(s): ${names} ` +
            `(program error: ${v.error})`
        );
      }
    }

    const instruction = ix.createMarket(
      {
        market,
        vault,
        authority,
        payer: params.payer.publicKey,
        protocolConfig,
        tokenMint: params.tokenMint,
        vaultAuthority,
        tokenVault: params.tokenVault,
        tokenProgram: params.tokenProgram,
      },
      {
        marketId: params.marketId,
        title: params.title,
        description: params.description,
        outcomeLabels: params.outcomeLabels,
        resolutionDeadline: params.resolutionDeadline,
        feeBpsOverride: params.feeBpsOverride ?? null,
        denomination: params.denomination,
        authorityIsMultisig: params.authorityIsMultisig ?? false,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.payer],
      params.opts
    );
    return { signature, market, vault, vaultAuthority };
  }

  /**
   * Place a bet on a SOL market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.bettor
   * @param {PublicKey} params.market
   * @param {number} params.outcomeIndex
   * @param {bigint|number} params.amount - In lamports.
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async placeSolBet(params) {
    const [vault] = await this.findVault(params.market);
    const [position] = await this.findPosition(
      params.market,
      params.bettor.publicKey,
      params.outcomeIndex
    );
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.placeBet(
      { market: params.market, vault, position, bettor: params.bettor.publicKey, protocolConfig },
      { outcomeIndex: params.outcomeIndex, amount: params.amount },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.bettor],
      params.opts
    );
    return { signature, position };
  }

  /**
   * Place a bet on an SPL / Token-2022 market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.bettor
   * @param {PublicKey} params.market
   * @param {number} params.outcomeIndex
   * @param {bigint|number} params.amount
   * @param {PublicKey} params.bettorTokenAccount
   * @param {PublicKey} params.tokenVault
   * @param {PublicKey} params.tokenMint
   * @param {PublicKey} params.tokenProgram
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async placeTokenBet(params) {
    const [vault] = await this.findVault(params.market);
    const [position] = await this.findPosition(
      params.market,
      params.bettor.publicKey,
      params.outcomeIndex
    );
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.placeBet(
      {
        market: params.market,
        vault,
        position,
        bettor: params.bettor.publicKey,
        protocolConfig,
        bettorTokenAccount: params.bettorTokenAccount,
        tokenVault: params.tokenVault,
        tokenMint: params.tokenMint,
        tokenProgram: params.tokenProgram,
      },
      { outcomeIndex: params.outcomeIndex, amount: params.amount },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.bettor],
      params.opts
    );
    return { signature, position };
  }

  /**
   * Fetch a mint account and report whether the program would accept it for a
   * token market, mirroring the on-chain extension policy. Lets callers fail
   * fast with a descriptive reason instead of sending a doomed transaction.
   *
   * @param {PublicKey} tokenMint
   * @returns {Promise<import("./token.js").MintValidation>}
   */
  async validateTokenMint(tokenMint) {
    const info = await this.connection.getAccountInfo(tokenMint);
    if (!info) {
      throw new Error(`mint ${tokenMint.toBase58()} not found`);
    }
    return validateMintForMarket(info.data);
  }

  /**
   * Fetch a mint account and return its active (newer) transfer-fee schedule,
   * or null if the mint has no TransferFeeConfig extension.
   *
   * @param {PublicKey} tokenMint
   * @returns {Promise<import("./token.js").TransferFeeConfig | null>}
   */
  async fetchTransferFeeConfig(tokenMint) {
    const info = await this.connection.getAccountInfo(tokenMint);
    if (!info) {
      throw new Error(`mint ${tokenMint.toBase58()} not found`);
    }
    return getTransferFeeConfig(info.data);
  }

  /**
   * Fetch a mint account and list every Token-2022 extension present on it,
   * each tagged with whether the program allows it.
   *
   * @param {PublicKey} tokenMint
   * @returns {Promise<import("./token.js").ParsedExtension[]>}
   */
  async fetchMintExtensions(tokenMint) {
    const info = await this.connection.getAccountInfo(tokenMint);
    if (!info) {
      throw new Error(`mint ${tokenMint.toBase58()} not found`);
    }
    return parseMintExtensions(info.data);
  }

  /**
   * Resolve a market (single-sig authority only).
   * @param {import("@solana/web3.js").Signer} authority
   * @param {PublicKey} market
   * @param {number} winningOutcome
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async resolveMarket(authority, market, winningOutcome, opts) {
    const instruction = ix.resolveMarket(
      { market, authority: authority.publicKey },
      { winningOutcome },
      this.programId
    );
    const signature = await this.sendTransaction([instruction], [authority], opts);
    return { signature };
  }

  /**
   * Finalize a market (permissionless crank).
   * @param {import("@solana/web3.js").Signer} payer - Any signer to pay tx fees.
   * @param {PublicKey} market
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async finalizeMarket(payer, market, opts) {
    const instruction = ix.finalizeMarket({ market }, this.programId);
    const signature = await this.sendTransaction([instruction], [payer], opts);
    return { signature };
  }

  /**
   * Claim winnings from a finalized SOL market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.claimant
   * @param {PublicKey} params.market
   * @param {PublicKey} params.position
   * @param {PublicKey} params.treasury
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async claimSolWinnings(params) {
    const [vault] = await this.findVault(params.market);
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.claimWinnings(
      {
        market: params.market,
        vault,
        position: params.position,
        claimant: params.claimant.publicKey,
        protocolConfig,
        treasury: params.treasury,
        creator: params.creator,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.claimant],
      params.opts
    );
    return { signature };
  }

  /**
   * Claim winnings from a finalized SPL/Token-2022 market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.claimant
   * @param {PublicKey} params.market
   * @param {PublicKey} params.position
   * @param {PublicKey} params.treasury
   * @param {PublicKey} params.creator - Market creator wallet
   * @param {PublicKey} params.claimantTokenAccount
   * @param {PublicKey} params.treasuryTokenAccount
   * @param {PublicKey} params.creatorTokenAccount - Creator's token account
   * @param {PublicKey} params.tokenVault
   * @param {PublicKey} params.tokenMint
   * @param {PublicKey} params.tokenProgram
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async claimTokenWinnings(params) {
    const [vault] = await this.findVault(params.market);
    const [vaultAuthority] = await this.findVaultAuthority(params.market);
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.claimWinnings(
      {
        market: params.market,
        vault,
        position: params.position,
        claimant: params.claimant.publicKey,
        protocolConfig,
        treasury: params.treasury,
        creator: params.creator,
        claimantTokenAccount: params.claimantTokenAccount,
        treasuryTokenAccount: params.treasuryTokenAccount,
        creatorTokenAccount: params.creatorTokenAccount,
        tokenVault: params.tokenVault,
        vaultAuthority,
        tokenMint: params.tokenMint,
        tokenProgram: params.tokenProgram,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.claimant],
      params.opts
    );
    return { signature };
  }

  /**
   * Void a market (single-sig authority only).
   * @param {import("@solana/web3.js").Signer} authority
   * @param {PublicKey} market
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async voidMarket(authority, market, opts) {
    const instruction = ix.voidMarket(
      { market, authority: authority.publicKey },
      this.programId
    );
    const signature = await this.sendTransaction([instruction], [authority], opts);
    return { signature };
  }

  /**
   * Claim a refund from a voided SOL market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.claimant
   * @param {PublicKey} params.market
   * @param {PublicKey} params.position
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async claimSolRefund(params) {
    const [vault] = await this.findVault(params.market);

    const instruction = ix.claimRefund(
      {
        market: params.market,
        vault,
        position: params.position,
        claimant: params.claimant.publicKey,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.claimant],
      params.opts
    );
    return { signature };
  }

  /**
   * Claim a refund from a voided SPL/Token-2022 market.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.claimant
   * @param {PublicKey} params.market
   * @param {PublicKey} params.position
   * @param {PublicKey} params.claimantTokenAccount
   * @param {PublicKey} params.tokenVault
   * @param {PublicKey} params.tokenMint
   * @param {PublicKey} params.tokenProgram
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async claimTokenRefund(params) {
    const [vault] = await this.findVault(params.market);
    const [vaultAuthority] = await this.findVaultAuthority(params.market);

    const instruction = ix.claimRefund(
      {
        market: params.market,
        vault,
        position: params.position,
        claimant: params.claimant.publicKey,
        claimantTokenAccount: params.claimantTokenAccount,
        tokenVault: params.tokenVault,
        vaultAuthority,
        tokenMint: params.tokenMint,
        tokenProgram: params.tokenProgram,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.claimant],
      params.opts
    );
    return { signature };
  }

  /**
   * Update protocol config (admin only).
   * @param {import("@solana/web3.js").Signer} admin
   * @param {import("./instructions.js").UpdateProtocolConfigArgs} args
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async updateProtocolConfig(admin, args, opts) {
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.updateProtocolConfig(
      { protocolConfig, admin: admin.publicKey },
      args,
      this.programId
    );

    const signature = await this.sendTransaction([instruction], [admin], opts);
    return { signature };
  }

  /**
   * Create a multisig authority.
   * @param {import("@solana/web3.js").Signer} creator
   * @param {bigint|number} nonce
   * @param {number} threshold
   * @param {PublicKey[]} signers
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async createMultisig(creator, nonce, threshold, signers, opts) {
    const [multisig] = await this.findMultisig(creator.publicKey, nonce);

    const instruction = ix.createMultisig(
      { multisig, creator: creator.publicKey },
      { nonce, threshold, signers },
      this.programId
    );

    const signature = await this.sendTransaction([instruction], [creator], opts);
    return { signature, multisig };
  }

  /**
   * Create a multisig proposal.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.proposer
   * @param {PublicKey} params.multisig
   * @param {PublicKey} params.market - Target market (or system program for governance actions).
   * @param {import("./instructions.js").CreateProposalAction} params.action
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async createProposal(params) {
    const msAccount = await this.fetchMultisigAuthority(params.multisig);
    if (!msAccount) throw new Error("Multisig account not found");

    const proposalId = msAccount.proposalCount;
    const [proposal] = await this.findProposal(params.multisig, proposalId);

    const instruction = ix.createProposal(
      {
        proposal,
        multisig: params.multisig,
        market: params.market,
        proposer: params.proposer.publicKey,
      },
      { action: params.action },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.proposer],
      params.opts
    );
    return { signature, proposal, proposalId };
  }

  /**
   * Approve a multisig proposal.
   * @param {import("@solana/web3.js").Signer} signer
   * @param {PublicKey} proposal
   * @param {PublicKey} multisig
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async approveProposal(signer, proposal, multisig, opts) {
    const instruction = ix.approveProposal(
      { proposal, multisig, signer: signer.publicKey },
      this.programId
    );
    const signature = await this.sendTransaction([instruction], [signer], opts);
    return { signature };
  }

  /**
   * Execute a fully-approved multisig proposal (permissionless).
   * @param {import("@solana/web3.js").Signer} payer
   * @param {PublicKey} proposal
   * @param {PublicKey} multisig
   * @param {PublicKey} market
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   */
  async executeProposal(payer, proposal, multisig, market, opts) {
    const [protocolConfig] = await this.findProtocolConfig();

    const instruction = ix.executeProposal(
      { proposal, multisig, market, protocolConfig },
      this.programId
    );
    const signature = await this.sendTransaction([instruction], [payer], opts);
    return { signature };
  }

  /**
   * Harvest withheld Token-2022 transfer fees.
   * @param {Object} params
   * @param {import("@solana/web3.js").Signer} params.withdrawAuthority
   * @param {PublicKey} params.market
   * @param {PublicKey} params.tokenMint
   * @param {PublicKey} params.tokenVault
   * @param {PublicKey} params.destination
   * @param {PublicKey} params.tokenProgram
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async harvestWithheldTokens(params) {
    const instruction = ix.harvestWithheldTokens(
      {
        market: params.market,
        tokenMint: params.tokenMint,
        tokenVault: params.tokenVault,
        destination: params.destination,
        withdrawAuthority: params.withdrawAuthority.publicKey,
        tokenProgram: params.tokenProgram,
      },
      this.programId
    );

    const signature = await this.sendTransaction(
      [instruction],
      [params.withdrawAuthority],
      params.opts
    );
    return { signature };
  }

  // ── utility helpers ───────────────────────────────────────────────

  /**
   * Calculate the estimated payout for a position if it wins.
   * payout = (position / winningPool) * totalPool * (1 - feeBps/10000)
   * @param {bigint} positionAmount
   * @param {bigint} winningPool
   * @param {bigint} totalPool
   * @param {number} feeBps
   * @returns {{ gross: bigint, fee: bigint, net: bigint }}
   */
  static calculatePayout(positionAmount, winningPool, totalPool, feeBps) {
    if (winningPool === 0n) throw new Error("Division by zero: winning pool is empty");
    const gross = (positionAmount * totalPool) / winningPool;
    const fee = (gross * BigInt(feeBps)) / 10000n;
    const net = gross - fee;
    return { gross, fee, net };
  }

  /**
   * Get current implied probabilities from pool sizes.
   * @param {bigint[]} outcomePools
   * @param {bigint} totalPool
   * @returns {number[]} probabilities (0..1), summing to ~1
   */
  static getImpliedProbabilities(outcomePools, totalPool) {
    if (totalPool === 0n) return outcomePools.map(() => 0);
    return outcomePools.map(
      (pool) => Number((pool * 10000n) / totalPool) / 10000
    );
  }

  /**
   * Simulate a transaction to estimate compute unit usage, then return
   * a compute budget with a 1.1× safety margin.
   *
   * @param {import("@solana/web3.js").TransactionInstruction[]} instructions - The instructions to simulate
   * @param {PublicKey} feePayer - The fee payer for the transaction
   * @param {import("@solana/web3.js").ConfirmOptions} [opts]
   * @returns {Promise<{ estimatedUnits: number, instruction: import("@solana/web3.js").TransactionInstruction }>}
   *   estimatedUnits — the CU limit (simulated × 1.1, rounded up)
   *   instruction — a `ComputeBudgetProgram.setComputeUnitLimit` instruction ready to prepend
   */
  async estimateComputeUnits(instructions, feePayer, opts) {
    const tx = new Transaction().add(...instructions);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash(opts?.commitment)).blockhash;
    tx.feePayer = feePayer;

    const sim = await this.connection.simulateTransaction(tx);

    if (sim.value.err) {
      throw new Error(
        `Simulation failed: ${JSON.stringify(sim.value.err)}${sim.value.logs ? '\n' + sim.value.logs.join('\n') : ''}`
      );
    }

    const consumed = sim.value.unitsConsumed ?? 200_000;
    const margin = opts?.computeUnitMargin ?? this.computeUnitMargin;
    const estimatedUnits = Math.ceil(consumed * margin);

    return {
      estimatedUnits,
      instruction: ComputeBudgetProgram.setComputeUnitLimit({ units: estimatedUnits }),
    };
  }

  /**
   * Estimate the priority fee for a transaction.
   *
   * Uses the standard Solana RPC method `getRecentPrioritizationFees`
   * which is supported by all RPC providers. Extracts writable accounts
   * from the instructions for account-aware fee estimation.
   *
   * If a custom `feeEstimator` function was provided in the constructor,
   * it will be used instead. This allows plugging in provider-specific
   * APIs (e.g., Helius getPriorityFeeEstimate, Triton percentile API).
   *
   * @param {import("@solana/web3.js").TransactionInstruction[]} instructions - The instructions to estimate fees for
   * @param {PublicKey} feePayer - The fee payer for the transaction
   * @param {{ priorityLevel?: string, commitment?: string }} [opts]
   *   priorityLevel - one of "Min", "Low", "Medium", "High", "VeryHigh" (default: "Medium")
   * @returns {Promise<{ priorityFee: number, instruction: import("@solana/web3.js").TransactionInstruction }>}
   *   priorityFee - the estimated fee in microLamports per compute unit
   *   instruction - a `ComputeBudgetProgram.setComputeUnitPrice` instruction ready to prepend
   */
  async estimatePriorityFee(instructions, feePayer, opts) {
    const priorityLevel = opts?.priorityLevel ?? this.priorityLevel;

    // Use custom estimator if provided
    if (this.feeEstimator) {
      const fee = await this.feeEstimator(this.connection, instructions, feePayer, { priorityLevel });
      const priorityFee = Math.ceil(fee);
      return {
        priorityFee,
        instruction: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
      };
    }

    // Extract unique writable accounts for account-aware estimation
    const seen = new Set();
    const writableAccounts = [];
    for (const ix of instructions) {
      for (const key of ix.keys) {
        if (key.isWritable) {
          const addr = key.pubkey.toBase58();
          if (!seen.has(addr)) {
            seen.add(addr);
            writableAccounts.push(key.pubkey);
          }
        }
      }
    }
    // RPC allows max 128 accounts
    const accountsToQuery = writableAccounts.slice(0, 128);

    // Standard Solana RPC: getRecentPrioritizationFees
    const recentFees = await this.connection.getRecentPrioritizationFees({
      lockedWritableAccounts: accountsToQuery,
    });

    // Extract non-zero fees and sort ascending
    const nonZeroFees = recentFees
      .map(f => f.prioritizationFee)
      .filter(f => f > 0)
      .sort((a, b) => a - b);

    // Map priority levels to percentiles
    const PERCENTILES = {
      Min:      10,
      Low:      25,
      Medium:   50,
      High:     75,
      VeryHigh: 90,
    };

    // Minimum floor per level (microLamports) for when data is sparse
    const FLOORS = {
      Min:      100,
      Low:      1_000,
      Medium:   10_000,
      High:     100_000,
      VeryHigh: 500_000,
    };

    const percentile = PERCENTILES[priorityLevel] ?? 50;
    const floor = FLOORS[priorityLevel] ?? 10_000;

    let priorityFee;
    if (nonZeroFees.length === 0) {
      priorityFee = floor;
    } else {
      const index = Math.min(
        Math.max(Math.ceil((percentile / 100) * nonZeroFees.length) - 1, 0),
        nonZeroFees.length - 1
      );
      priorityFee = Math.max(nonZeroFees[index], floor);
    }

    return {
      priorityFee,
      instruction: ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFee }),
    };
  }

  /**
   * Estimate both compute units and priority fee, returning both instructions
   * ready to prepend to a transaction.
   *
   * Convenience method that combines estimateComputeUnits + estimatePriorityFee.
   *
   * @param {import("@solana/web3.js").TransactionInstruction[]} instructions
   * @param {PublicKey} feePayer
   * @param {{ priorityLevel?: string, commitment?: string }} [opts]
   * @returns {Promise<{
   *   estimatedUnits: number,
   *   priorityFee: number,
   *   computeUnitInstruction: import("@solana/web3.js").TransactionInstruction,
   *   priorityFeeInstruction: import("@solana/web3.js").TransactionInstruction,
   *   instructions: import("@solana/web3.js").TransactionInstruction[],
   * }>}
   *   instructions — array of [cuLimitIx, cuPriceIx, ...originalInstructions] ready for a Transaction
   */
  async estimateTransactionFees(instructions, feePayer, opts) {
    const [cuResult, feeResult] = await Promise.all([
      this.estimateComputeUnits(instructions, feePayer, opts),
      this.estimatePriorityFee(instructions, feePayer, opts),
    ]);

    return {
      estimatedUnits: cuResult.estimatedUnits,
      priorityFee: feeResult.priorityFee,
      computeUnitInstruction: cuResult.instruction,
      priorityFeeInstruction: feeResult.instruction,
      instructions: [cuResult.instruction, feeResult.instruction, ...instructions],
    };
  }

  /**
   * Send a signed transaction with optimized settings.
   * Uses skipPreflight: true (simulation already done) and maxRetries: 0
   * (caller handles retries) for best results with staked connections.
   *
   * @param {import("@solana/web3.js").Transaction} transaction - A fully signed transaction
   * @param {{ maxRetries?: number, skipPreflight?: boolean, preflightCommitment?: string }} [opts]
   * @returns {Promise<string>} transaction signature
   */
  async sendRawTransaction(transaction, opts) {
    const rawTx = transaction.serialize();
    return this.connection.sendRawTransaction(rawTx, {
      skipPreflight: opts?.skipPreflight ?? true,
      maxRetries: opts?.maxRetries ?? 0,
      preflightCommitment: opts?.preflightCommitment ?? "confirmed",
    });
  }

  /**
   * All-in-one: estimate CU + priority fee, build transaction, sign, and send
   * with optimized settings.
   *
   * @param {import("@solana/web3.js").TransactionInstruction[]} instructions
   * @param {import("@solana/web3.js").Signer[]} signers - First signer is the fee payer
   * @param {{ priorityLevel?: string, commitment?: string }} [opts]
   * @returns {Promise<{ signature: string, estimatedUnits: number, priorityFee: number }>}
   */
  async sendSmartTransaction(instructions, signers, opts) {
    const feePayer = signers[0].publicKey;

    // Estimate CU and priority fee in parallel
    const { estimatedUnits, priorityFee, instructions: fullIxs } =
      await this.estimateTransactionFees(instructions, feePayer, opts);

    // Build and sign
    const tx = new Transaction().add(...fullIxs);
    tx.recentBlockhash = (await this.connection.getLatestBlockhash(opts?.commitment ?? "confirmed")).blockhash;
    tx.feePayer = feePayer;
    tx.sign(...signers);

    // Send with optimized settings
    const signature = await this.sendRawTransaction(tx, opts);

    return { signature, estimatedUnits, priorityFee };
  }
}