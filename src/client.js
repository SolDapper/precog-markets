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
} from "@solana/web3.js";

import { PROGRAM_ID, TokenDenomination, SYSTEM_PROGRAM_ID } from "./constants.js";

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

// ═══════════════════════════════════════════════════════════════════════
// Client
// ═══════════════════════════════════════════════════════════════════════

export class PrecogMarketsClient {
  /**
   * @param {Connection} connection
   * @param {PublicKey} [programId]
   */
  constructor(connection, programId = PROGRAM_ID) {
    /** @type {Connection} */ this.connection = connection;
    /** @type {PublicKey} */ this.programId = programId;
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
    const gpaFilters = [];

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
      filters: gpaFilters.length ? gpaFilters : undefined,
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
   * @param {import("@solana/web3.js").ConfirmOptions} [params.opts]
   */
  async createTokenMarket(params) {
    const authority = params.authority ?? params.payer.publicKey;
    const [market] = await this.findMarket(authority, params.marketId);
    const [vault] = await this.findVault(market);
    const [vaultAuthority] = await this.findVaultAuthority(market);
    const [protocolConfig] = await this.findProtocolConfig();

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

    const instruction = ix.placeBet(
      { market: params.market, vault, position, bettor: params.bettor.publicKey },
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
    const [vaultAuthority] = await this.findVaultAuthority(params.market);

    const instruction = ix.placeBet(
      {
        market: params.market,
        vault,
        position,
        bettor: params.bettor.publicKey,
        bettorTokenAccount: params.bettorTokenAccount,
        tokenVault: params.tokenVault,
        tokenMint: params.tokenMint,
        tokenProgram: params.tokenProgram,
        vaultAuthority,
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
   * @param {PublicKey} params.claimantTokenAccount
   * @param {PublicKey} params.treasuryTokenAccount
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
        claimantTokenAccount: params.claimantTokenAccount,
        treasuryTokenAccount: params.treasuryTokenAccount,
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
    const instruction = ix.executeProposal(
      { proposal, multisig, market },
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
}
