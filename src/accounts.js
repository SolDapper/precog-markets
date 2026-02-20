/**
 * @module accounts
 * Deserialization layouts for every on-chain account type.
 */

import { PublicKey } from "@solana/web3.js";
import { BorshReader } from "./serialization.js";
import {
  MAX_OUTCOMES,
  MAX_TITLE_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_OUTCOME_LABEL_LEN,
} from "./constants.js";

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/** Decode a fixed-length UTF-8 byte array using a companion length field. */
function decodeFixedString(buf, len) {
  return Buffer.from(buf).subarray(0, len).toString("utf-8");
}

/** Reverse-lookup enum value → name */
function enumName(enumObj, value) {
  for (const [k, v] of Object.entries(enumObj)) {
    if (v === value) return k;
  }
  return value;
}

const STATUS_MAP = { 0: "Open", 1: "Resolved", 2: "Finalized", 3: "Voided" };
const DENOM_MAP = { 0: "NativeSol", 1: "SplToken", 2: "Token2022" };

// ═══════════════════════════════════════════════════════════════════════
// Market
// ═══════════════════════════════════════════════════════════════════════

/**
 * Decoded Market account.
 * @typedef {Object} MarketAccount
 * @property {Buffer} discriminator
 * @property {number} bump
 * @property {bigint} marketId
 * @property {PublicKey} authority
 * @property {boolean} authorityIsMultisig
 * @property {number} status
 * @property {string} statusName
 * @property {bigint} resolutionDeadline
 * @property {bigint} resolvedAt
 * @property {number} winningOutcome
 * @property {number} feeBps
 * @property {bigint} feesCollected
 * @property {number} numOutcomes
 * @property {bigint[]} outcomePools
 * @property {bigint} totalPool
 * @property {bigint} totalPositions
 * @property {number} denomination
 * @property {string} denominationName
 * @property {PublicKey} tokenMint
 * @property {number} tokenDecimals
 * @property {boolean} hasTransferFee
 * @property {number} transferFeeBps
 * @property {bigint} maxTransferFee
 * @property {PublicKey} creator
 * @property {number} creatorFeeBps
 * @property {string} title
 * @property {string} description
 * @property {string[]} outcomeLabels
 */

/**
 * Decode a raw Market account buffer.
 * @param {Buffer|Uint8Array} data
 * @returns {MarketAccount}
 */
export function decodeMarket(data) {
  const r = new BorshReader(data);

  const discriminator = r.readFixedBytes(8);
  const bump = r.readU8();
  const marketId = r.readU64();
  const authority = r.readPubkey();
  const authorityIsMultisig = r.readBool();

  const status = r.readU8();
  const statusName = STATUS_MAP[status] ?? `Unknown(${status})`;

  const resolutionDeadline = r.readI64();
  const resolvedAt = r.readI64();
  const winningOutcome = r.readU8();
  const feeBps = r.readU16();
  const feesCollected = r.readU64();
  const numOutcomes = r.readU8();

  // outcomePools: [u64; 10]
  const outcomePools = [];
  for (let i = 0; i < MAX_OUTCOMES; i++) outcomePools.push(r.readU64());

  const totalPool = r.readU64();
  const totalPositions = r.readU64();

  const denomination = r.readU8();
  const denominationName = DENOM_MAP[denomination] ?? `Unknown(${denomination})`;

  const tokenMint = r.readPubkey();
  const tokenDecimals = r.readU8();
  const hasTransferFee = r.readBool();
  const transferFeeBps = r.readU16();
  const maxTransferFee = r.readU64();

  // ── v0.2.0 layout detection ──────────────────────────────────────
  // New layout: creator(32) + creatorFeeBps(2) + title[128] + titleLen(2) ...
  // Old layout: title[128] + titleLen(2) ...
  // We try new layout first. If titleLen == 0 but the old-layout position
  // has a non-zero titleLen, we fall back to old layout.
  const preCreatorOffset = r.offset;

  // Speculatively read creator fields
  const creatorBytes = r.readFixedBytes(32);
  const creatorFeeBpsVal = r.readU16();

  // Read title at new-layout position
  const titleBytesNew = r.readFixedBytes(MAX_TITLE_LEN);
  const titleLenNew = r.readU16();

  // Check if old layout would give us a valid title instead
  // Old layout: title starts at preCreatorOffset
  const oldTitleLenOffset = preCreatorOffset + MAX_TITLE_LEN;
  let useNewLayout = true;
  if (titleLenNew === 0 && oldTitleLenOffset + 2 <= data.length) {
    const buf = Buffer.from(data);
    const oldTitleLen = buf.readUInt16LE(oldTitleLenOffset);
    if (oldTitleLen > 0 && oldTitleLen <= MAX_TITLE_LEN) {
      useNewLayout = false;
    }
  }

  let creator, creatorFeeBps, title, description, outcomeLabels;

  if (useNewLayout) {
    creator = new PublicKey(creatorBytes);
    creatorFeeBps = creatorFeeBpsVal;
    title = decodeFixedString(titleBytesNew, titleLenNew);

    const descBytes = r.readFixedBytes(MAX_DESCRIPTION_LEN);
    const descLen = r.readU16();
    description = decodeFixedString(descBytes, descLen);

    const rawLabels = [];
    for (let i = 0; i < MAX_OUTCOMES; i++) rawLabels.push(r.readFixedBytes(MAX_OUTCOME_LABEL_LEN));
    const labelLens = [];
    for (let i = 0; i < MAX_OUTCOMES; i++) labelLens.push(r.readU16());
    outcomeLabels = [];
    for (let i = 0; i < numOutcomes; i++) outcomeLabels.push(decodeFixedString(rawLabels[i], labelLens[i]));
  } else {
    // Old layout — rewind to preCreatorOffset and read without creator fields
    r.offset = preCreatorOffset;
    creator = new PublicKey(Buffer.alloc(32));
    creatorFeeBps = 0;

    const titleBytes = r.readFixedBytes(MAX_TITLE_LEN);
    const titleLen = r.readU16();
    title = decodeFixedString(titleBytes, titleLen);

    const descBytes = r.readFixedBytes(MAX_DESCRIPTION_LEN);
    const descLen = r.readU16();
    description = decodeFixedString(descBytes, descLen);

    const rawLabels = [];
    for (let i = 0; i < MAX_OUTCOMES; i++) rawLabels.push(r.readFixedBytes(MAX_OUTCOME_LABEL_LEN));
    const labelLens = [];
    for (let i = 0; i < MAX_OUTCOMES; i++) labelLens.push(r.readU16());
    outcomeLabels = [];
    for (let i = 0; i < numOutcomes; i++) outcomeLabels.push(decodeFixedString(rawLabels[i], labelLens[i]));
  }

  return {
    discriminator,
    bump,
    marketId,
    authority,
    authorityIsMultisig,
    status,
    statusName,
    resolutionDeadline,
    resolvedAt,
    winningOutcome,
    feeBps,
    feesCollected,
    numOutcomes,
    outcomePools: outcomePools.slice(0, numOutcomes),
    totalPool,
    totalPositions,
    denomination,
    denominationName,
    tokenMint,
    tokenDecimals,
    hasTransferFee,
    transferFeeBps,
    maxTransferFee,
    creator,
    creatorFeeBps,
    title,
    description,
    outcomeLabels,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// UserPosition
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} UserPositionAccount
 * @property {Buffer} discriminator
 * @property {number} bump
 * @property {PublicKey} market
 * @property {PublicKey} owner
 * @property {number} outcomeIndex
 * @property {bigint} amount
 * @property {boolean} claimed
 * @property {bigint} lastDepositAt
 */

/**
 * Decode a raw UserPosition account buffer.
 * @param {Buffer|Uint8Array} data
 * @returns {UserPositionAccount}
 */
export function decodeUserPosition(data) {
  const r = new BorshReader(data);

  return {
    discriminator: r.readFixedBytes(8),
    bump: r.readU8(),
    market: r.readPubkey(),
    owner: r.readPubkey(),
    outcomeIndex: r.readU8(),
    amount: r.readU64(),
    claimed: r.readBool(),
    lastDepositAt: r.readI64(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// ProtocolConfig
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ProtocolConfigAccount
 * @property {Buffer} discriminator
 * @property {number} bump
 * @property {PublicKey} admin
 * @property {number} defaultFeeBps
 * @property {PublicKey} treasury
 * @property {boolean} paused
 * @property {bigint} totalMarketsCreated
 * @property {bigint} totalVolume
 */

/**
 * @param {Buffer|Uint8Array} data
 * @returns {ProtocolConfigAccount}
 */
export function decodeProtocolConfig(data) {
  const r = new BorshReader(data);

  return {
    discriminator: r.readFixedBytes(8),
    bump: r.readU8(),
    admin: r.readPubkey(),
    defaultFeeBps: r.readU16(),
    treasury: r.readPubkey(),
    paused: r.readBool(),
    totalMarketsCreated: r.readU64(),
    totalVolume: r.readU64(),
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MultisigAuthority
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} MultisigAuthorityAccount
 * @property {Buffer} discriminator
 * @property {number} bump
 * @property {bigint} nonce
 * @property {number} threshold
 * @property {number} numSigners
 * @property {PublicKey[]} signers
 * @property {bigint} proposalCount
 */

/**
 * @param {Buffer|Uint8Array} data
 * @returns {MultisigAuthorityAccount}
 */
export function decodeMultisigAuthority(data) {
  const r = new BorshReader(data);

  const discriminator = r.readFixedBytes(8);
  const bump = r.readU8();
  const nonce = r.readU64();
  const threshold = r.readU8();
  const numSigners = r.readU8();

  // signers: [Pubkey; 11]
  const allSigners = [];
  for (let i = 0; i < 11; i++) allSigners.push(r.readPubkey());

  const proposalCount = r.readU64();

  return {
    discriminator,
    bump,
    nonce,
    threshold,
    numSigners,
    signers: allSigners.slice(0, numSigners),
    proposalCount,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// MultisigProposal
// ═══════════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} ProposalAction
 * @property {number} tag
 * @property {string} name
 * @property {Object} [fields]
 */

/**
 * @typedef {Object} MultisigProposalAccount
 * @property {Buffer} discriminator
 * @property {number} bump
 * @property {PublicKey} multisig
 * @property {PublicKey} market
 * @property {bigint} proposalId
 * @property {ProposalAction} action
 * @property {PublicKey} proposer
 * @property {number} approvals
 * @property {number} approvalCount
 * @property {boolean} executed
 * @property {bigint} createdAt
 */

const PROPOSAL_ACTION_NAMES = [
  "ResolveMarket",
  "VoidMarket",
  "UpdateDeadline",
  "UpdateFeeBps",
  "AddSigner",
  "RemoveSigner",
  "ChangeThreshold",
];

/**
 * Decode the ProposalAction enum from a reader.
 * @param {BorshReader} r
 * @returns {ProposalAction}
 */
function decodeProposalAction(r) {
  const tag = r.readU8();
  const name = PROPOSAL_ACTION_NAMES[tag] ?? `Unknown(${tag})`;

  switch (tag) {
    case 0: // ResolveMarket { winning_outcome: u8 }
      return { tag, name, fields: { winningOutcome: r.readU8() } };
    case 1: // VoidMarket (no fields)
      return { tag, name, fields: {} };
    case 2: // UpdateDeadline { new_deadline: i64 }
      return { tag, name, fields: { newDeadline: r.readI64() } };
    case 3: // UpdateFeeBps { new_fee_bps: u16 }
      return { tag, name, fields: { newFeeBps: r.readU16() } };
    case 4: // AddSigner { new_signer: [u8;32] }
      return {
        tag,
        name,
        fields: { newSigner: new PublicKey(r.readFixedBytes(32)) },
      };
    case 5: // RemoveSigner { signer: [u8;32] }
      return {
        tag,
        name,
        fields: { signer: new PublicKey(r.readFixedBytes(32)) },
      };
    case 6: // ChangeThreshold { new_threshold: u8 }
      return { tag, name, fields: { newThreshold: r.readU8() } };
    default:
      throw new Error(`Unknown ProposalAction tag: ${tag}`);
  }
}

/**
 * @param {Buffer|Uint8Array} data
 * @returns {MultisigProposalAccount}
 */
export function decodeMultisigProposal(data) {
  const r = new BorshReader(data);

  return {
    discriminator: r.readFixedBytes(8),
    bump: r.readU8(),
    multisig: r.readPubkey(),
    market: r.readPubkey(),
    proposalId: r.readU64(),
    action: decodeProposalAction(r),
    proposer: r.readPubkey(),
    approvals: r.readU16(),
    approvalCount: r.readU8(),
    executed: r.readBool(),
    createdAt: r.readI64(),
  };
}