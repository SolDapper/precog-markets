/**
 * @module instructions
 * Builders for every instruction in the prediction-market program.
 * Each function returns a `TransactionInstruction`.
 */

import {
  TransactionInstruction,
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from "@solana/web3.js";

import {
  PROGRAM_ID,
  DISCRIMINATORS,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
} from "./constants.js";
import { BorshWriter } from "./serialization.js";

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/** @param {boolean} isMut @param {boolean} isSigner @param {PublicKey} pubkey */
function meta(pubkey, isSigner = false, isMut = false) {
  return { pubkey, isSigner, isWritable: isMut };
}

/** Writable signer */
function ws(pubkey) {
  return meta(pubkey, true, true);
}
/** Read-only signer */
function rs(pubkey) {
  return meta(pubkey, true, false);
}
/** Writable non-signer */
function w(pubkey) {
  return meta(pubkey, false, true);
}
/** Read-only non-signer */
function ro(pubkey) {
  return meta(pubkey, false, false);
}

/**
 * Serialize a ProposalAction enum variant for `createProposal`.
 * @param {BorshWriter} wr
 * @param {Object} action
 * @param {string} action.type - One of: ResolveMarket, VoidMarket, UpdateDeadline, UpdateFeeBps, AddSigner, RemoveSigner, ChangeThreshold
 * @param {Object} [action.fields]
 */
function writeProposalAction(wr, action) {
  switch (action.type) {
    case "ResolveMarket":
      wr.writeU8(0);
      wr.writeU8(action.fields.winningOutcome);
      break;
    case "VoidMarket":
      wr.writeU8(1);
      break;
    case "UpdateDeadline":
      wr.writeU8(2);
      wr.writeI64(action.fields.newDeadline);
      break;
    case "UpdateFeeBps":
      wr.writeU8(3);
      wr.writeU16(action.fields.newFeeBps);
      break;
    case "AddSigner":
      wr.writeU8(4);
      wr.writeFixedBytes(
        action.fields.newSigner instanceof PublicKey
          ? action.fields.newSigner.toBuffer()
          : action.fields.newSigner
      );
      break;
    case "RemoveSigner":
      wr.writeU8(5);
      wr.writeFixedBytes(
        action.fields.signer instanceof PublicKey
          ? action.fields.signer.toBuffer()
          : action.fields.signer
      );
      break;
    case "ChangeThreshold":
      wr.writeU8(6);
      wr.writeU8(action.fields.newThreshold);
      break;
    default:
      throw new Error(`Unknown ProposalAction type: ${action.type}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 0 — initializeProtocol
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} InitializeProtocolAccounts
 * @property {PublicKey} protocolConfig
 * @property {PublicKey} admin
 * @property {PublicKey} treasury
 */

/**
 * @param {InitializeProtocolAccounts} accounts
 * @param {{ defaultFeeBps: number }} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function initializeProtocol(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.INITIALIZE_PROTOCOL);
  wr.writeU16(args.defaultFeeBps);

  return new TransactionInstruction({
    programId,
    keys: [
      w(accounts.protocolConfig),
      ws(accounts.admin),
      ro(accounts.treasury),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data: wr.toBuffer(),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 1 — createMarket
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CreateMarketAccounts
 * @property {PublicKey} market
 * @property {PublicKey} vault
 * @property {PublicKey} authority
 * @property {PublicKey} payer
 * @property {PublicKey} protocolConfig
 * @property {PublicKey} [tokenMint]
 * @property {PublicKey} [vaultAuthority]
 * @property {PublicKey} [tokenVault]
 * @property {PublicKey} [tokenProgram]
 * @property {PublicKey} [rent]
 */

/**
 * @typedef {Object} CreateMarketArgs
 * @property {bigint|number} marketId
 * @property {string} title
 * @property {string} description
 * @property {string[]} outcomeLabels
 * @property {bigint|number} resolutionDeadline
 * @property {number|null} [feeBpsOverride]
 * @property {number} denomination - 0=NativeSol, 1=SplToken, 2=Token2022
 * @property {boolean} authorityIsMultisig
 */

/**
 * @param {CreateMarketAccounts} accounts
 * @param {CreateMarketArgs} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function createMarket(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter(512);
  wr.writeFixedBytes(DISCRIMINATORS.CREATE_MARKET);
  wr.writeU64(args.marketId);
  wr.writeString(args.title);
  wr.writeString(args.description);
  wr.writeVec(args.outcomeLabels, (w, s) => w.writeString(s));
  wr.writeI64(args.resolutionDeadline);
  wr.writeOption(args.feeBpsOverride ?? null, (w, v) => w.writeU16(v));
  wr.writeU8(args.denomination);
  wr.writeBool(args.authorityIsMultisig);

  const keys = [
    w(accounts.market),
    w(accounts.vault),
    rs(accounts.authority),
    ws(accounts.payer),
    w(accounts.protocolConfig),
    ro(SYSTEM_PROGRAM_ID),
  ];

  // Optional SPL/Token-2022 accounts
  if (accounts.tokenMint) {
    keys.push(ro(accounts.tokenMint));
    keys.push(ro(accounts.vaultAuthority));
    keys.push(w(accounts.tokenVault));
    keys.push(ro(accounts.tokenProgram));
    keys.push(ro(accounts.rent ?? SYSVAR_RENT_PUBKEY));
  }

  return new TransactionInstruction({ programId, keys, data: wr.toBuffer() });
}

// ═══════════════════════════════════════════════════════════════════════
// 2 — placeBet
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PlaceBetAccounts
 * @property {PublicKey} market
 * @property {PublicKey} vault
 * @property {PublicKey} position
 * @property {PublicKey} bettor
 * @property {PublicKey} protocolConfig - Checked for paused flag; PDA [PROTOCOL_CONFIG_SEED]
 * @property {PublicKey} [bettorTokenAccount] - SPL/Token-2022 only
 * @property {PublicKey} [tokenVault]         - SPL/Token-2022 only
 * @property {PublicKey} [tokenMint]          - SPL/Token-2022 only
 * @property {PublicKey} [tokenProgram]       - SPL/Token-2022 only
 */

/**
 * @param {PlaceBetAccounts} accounts
 * @param {{ outcomeIndex: number, amount: bigint|number }} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function placeBet(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.PLACE_BET);
  wr.writeU8(args.outcomeIndex);
  wr.writeU64(args.amount);

  const keys = [
    w(accounts.market),
    w(accounts.vault),
    w(accounts.position),
    ws(accounts.bettor),
    ro(accounts.protocolConfig),
    ro(SYSTEM_PROGRAM_ID),
  ];

  if (accounts.bettorTokenAccount) {
    keys.push(w(accounts.bettorTokenAccount));
    keys.push(w(accounts.tokenVault));
    keys.push(ro(accounts.tokenMint));
    keys.push(ro(accounts.tokenProgram));
  }

  return new TransactionInstruction({ programId, keys, data: wr.toBuffer() });
}

// ═══════════════════════════════════════════════════════════════════════
// 3 — resolveMarket
// ═══════════════════════════════════════════════════════════════════════

/**
 * @param {{ market: PublicKey, authority: PublicKey }} accounts
 * @param {{ winningOutcome: number }} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function resolveMarket(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.RESOLVE_MARKET);
  wr.writeU8(args.winningOutcome);

  return new TransactionInstruction({
    programId,
    keys: [w(accounts.market), rs(accounts.authority)],
    data: wr.toBuffer(),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 4 — finalizeMarket
// ═══════════════════════════════════════════════════════════════════════

/**
 * Permissionless crank — anyone can call after dispute window.
 * @param {{ market: PublicKey }} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function finalizeMarket(accounts, programId = PROGRAM_ID) {
  return new TransactionInstruction({
    programId,
    keys: [w(accounts.market)],
    data: Buffer.from(DISCRIMINATORS.FINALIZE_MARKET),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 5 — claimWinnings
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ClaimWinningsAccounts
 * @property {PublicKey} market
 * @property {PublicKey} vault
 * @property {PublicKey} position
 * @property {PublicKey} claimant
 * @property {PublicKey} protocolConfig
 * @property {PublicKey} treasury
 * @property {PublicKey} creator - Market creator wallet; receives creator_fee_bps portion
 * @property {PublicKey} [claimantTokenAccount]
 * @property {PublicKey} [treasuryTokenAccount]
 * @property {PublicKey} [creatorTokenAccount] - Creator's token account (SPL/Token-2022 only)
 * @property {PublicKey} [tokenVault]
 * @property {PublicKey} [vaultAuthority]
 * @property {PublicKey} [tokenMint]
 * @property {PublicKey} [tokenProgram]
 */

/**
 * @param {ClaimWinningsAccounts} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function claimWinnings(accounts, programId = PROGRAM_ID) {
  const keys = [
    ro(accounts.market),
    w(accounts.vault),
    w(accounts.position),
    ws(accounts.claimant),
    ro(accounts.protocolConfig),
    w(accounts.treasury),
    w(accounts.creator),
    ro(SYSTEM_PROGRAM_ID),
  ];

  if (accounts.claimantTokenAccount) {
    keys.push(w(accounts.claimantTokenAccount));
    keys.push(w(accounts.treasuryTokenAccount));
    keys.push(w(accounts.creatorTokenAccount));
    keys.push(w(accounts.tokenVault));
    keys.push(ro(accounts.vaultAuthority));
    keys.push(ro(accounts.tokenMint));
    keys.push(ro(accounts.tokenProgram));
  }

  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(DISCRIMINATORS.CLAIM_WINNINGS),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 6 — voidMarket
// ═══════════════════════════════════════════════════════════════════════

/**
 * @param {{ market: PublicKey, authority: PublicKey }} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function voidMarket(accounts, programId = PROGRAM_ID) {
  return new TransactionInstruction({
    programId,
    keys: [w(accounts.market), rs(accounts.authority)],
    data: Buffer.from(DISCRIMINATORS.VOID_MARKET),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 7 — claimRefund
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ClaimRefundAccounts
 * @property {PublicKey} market
 * @property {PublicKey} vault
 * @property {PublicKey} position
 * @property {PublicKey} claimant
 * @property {PublicKey} [claimantTokenAccount]
 * @property {PublicKey} [tokenVault]
 * @property {PublicKey} [vaultAuthority]
 * @property {PublicKey} [tokenMint]
 * @property {PublicKey} [tokenProgram]
 */

/**
 * @param {ClaimRefundAccounts} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function claimRefund(accounts, programId = PROGRAM_ID) {
  const keys = [
    ro(accounts.market),
    w(accounts.vault),
    w(accounts.position),
    ws(accounts.claimant),
    ro(SYSTEM_PROGRAM_ID),
  ];

  if (accounts.claimantTokenAccount) {
    keys.push(w(accounts.claimantTokenAccount));
    keys.push(w(accounts.tokenVault));
    keys.push(ro(accounts.vaultAuthority));
    keys.push(ro(accounts.tokenMint));
    keys.push(ro(accounts.tokenProgram));
  }

  return new TransactionInstruction({
    programId,
    keys,
    data: Buffer.from(DISCRIMINATORS.CLAIM_REFUND),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 8 — updateProtocolConfig
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} UpdateProtocolConfigArgs
 * @property {number|null} [newDefaultFeeBps]
 * @property {PublicKey|null} [newTreasury]
 * @property {boolean|null} [paused]
 */

/**
 * @param {{ protocolConfig: PublicKey, admin: PublicKey }} accounts
 * @param {UpdateProtocolConfigArgs} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function updateProtocolConfig(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.UPDATE_PROTOCOL_CONFIG);

  wr.writeOption(args.newDefaultFeeBps ?? null, (w, v) => w.writeU16(v));
  wr.writeOption(args.newTreasury ?? null, (w, v) => {
    const bytes =
      v instanceof PublicKey ? v.toBuffer() : Buffer.from(v);
    w.writeFixedBytes(bytes);
  });
  wr.writeOption(args.paused ?? null, (w, v) => w.writeBool(v));

  return new TransactionInstruction({
    programId,
    keys: [w(accounts.protocolConfig), rs(accounts.admin)],
    data: wr.toBuffer(),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 9 — createMultisig
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CreateMultisigArgs
 * @property {bigint|number} nonce
 * @property {number} threshold
 * @property {PublicKey[]} signers
 */

/**
 * @param {{ multisig: PublicKey, creator: PublicKey }} accounts
 * @param {CreateMultisigArgs} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function createMultisig(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.CREATE_MULTISIG);
  wr.writeU64(args.nonce);
  wr.writeU8(args.threshold);
  wr.writeVec(args.signers, (w, pk) => {
    const bytes = pk instanceof PublicKey ? pk.toBuffer() : Buffer.from(pk);
    w.writeFixedBytes(bytes);
  });

  return new TransactionInstruction({
    programId,
    keys: [w(accounts.multisig), ws(accounts.creator), ro(SYSTEM_PROGRAM_ID)],
    data: wr.toBuffer(),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 10 — createProposal
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} CreateProposalAction
 * @property {string} type - ResolveMarket | VoidMarket | UpdateDeadline | UpdateFeeBps | AddSigner | RemoveSigner | ChangeThreshold
 * @property {Object} [fields]
 */

/**
 * @param {{ proposal: PublicKey, multisig: PublicKey, market: PublicKey, proposer: PublicKey }} accounts
 * @param {{ action: CreateProposalAction }} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function createProposal(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.CREATE_PROPOSAL);
  writeProposalAction(wr, args.action);

  return new TransactionInstruction({
    programId,
    keys: [
      w(accounts.proposal),
      w(accounts.multisig),
      ro(accounts.market),
      ws(accounts.proposer),
      ro(SYSTEM_PROGRAM_ID),
    ],
    data: wr.toBuffer(),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 11 — approveProposal
// ═══════════════════════════════════════════════════════════════════════

/**
 * @param {{ proposal: PublicKey, multisig: PublicKey, signer: PublicKey }} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function approveProposal(accounts, programId = PROGRAM_ID) {
  return new TransactionInstruction({
    programId,
    keys: [
      w(accounts.proposal),
      ro(accounts.multisig),
      rs(accounts.signer),
    ],
    data: Buffer.from(DISCRIMINATORS.APPROVE_PROPOSAL),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 12 — executeProposal
// ═══════════════════════════════════════════════════════════════════════

/**
 * Permissionless once threshold is met.
 * @param {{ proposal: PublicKey, multisig: PublicKey, market: PublicKey }} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function executeProposal(accounts, programId = PROGRAM_ID) {
  return new TransactionInstruction({
    programId,
    keys: [
      w(accounts.proposal),
      w(accounts.multisig),
      w(accounts.market),
    ],
    data: Buffer.from(DISCRIMINATORS.EXECUTE_PROPOSAL),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 13 — harvestWithheldTokens
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} HarvestWithheldTokensAccounts
 * @property {PublicKey} market
 * @property {PublicKey} tokenMint
 * @property {PublicKey} tokenVault
 * @property {PublicKey} destination
 * @property {PublicKey} withdrawAuthority
 * @property {PublicKey} tokenProgram
 */

/**
 * @param {HarvestWithheldTokensAccounts} accounts
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function harvestWithheldTokens(accounts, programId = PROGRAM_ID) {
  return new TransactionInstruction({
    programId,
    keys: [
      ro(accounts.market),
      w(accounts.tokenMint),
      w(accounts.tokenVault),
      w(accounts.destination),
      rs(accounts.withdrawAuthority),
      ro(accounts.tokenProgram),
    ],
    data: Buffer.from(DISCRIMINATORS.HARVEST_WITHHELD_TOKENS),
  });
}

// ═══════════════════════════════════════════════════════════════════════
// 14 — disputeResolve
// ═══════════════════════════════════════════════════════════════════════

/**
 * Re-resolve a market during its active 24-hour dispute window.
 * Only callable by the non-multisig market authority.
 * The winning outcome must differ from the current resolution.
 * Resets resolved_at, restarting the dispute window.
 *
 * @param {{ market: PublicKey, authority: PublicKey }} accounts
 * @param {{ winningOutcome: number }} args
 * @param {PublicKey} [programId]
 * @returns {TransactionInstruction}
 */
export function disputeResolve(accounts, args, programId = PROGRAM_ID) {
  const wr = new BorshWriter();
  wr.writeFixedBytes(DISCRIMINATORS.DISPUTE_RESOLVE);
  wr.writeU8(args.winningOutcome);

  return new TransactionInstruction({
    programId,
    keys: [w(accounts.market), rs(accounts.authority)],
    data: wr.toBuffer(),
  });
}