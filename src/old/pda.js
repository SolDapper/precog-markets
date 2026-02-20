/**
 * @module pda
 * PDA derivation utilities for every account type in the prediction-market program.
 */

import { PublicKey } from "@solana/web3.js";
import { PROGRAM_ID, SEEDS } from "./constants.js";

/**
 * Encode a u64 as an 8-byte little-endian Buffer.
 * @param {bigint|number} val
 * @returns {Buffer}
 */
export function u64ToLeBytes(val) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val));
  return buf;
}

/**
 * Encode a u8 as a 1-byte Buffer.
 * @param {number} val
 * @returns {Buffer}
 */
export function u8ToBytes(val) {
  return Buffer.from([val & 0xff]);
}

// ── Protocol Config ──────────────────────────────────────────────────

/**
 * Derive the singleton ProtocolConfig PDA.
 * Seeds: ["protocol_config"]
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findProtocolConfigAddress(programId = PROGRAM_ID) {
  return PublicKey.findProgramAddress([SEEDS.PROTOCOL_CONFIG], programId);
}

// ── Market ───────────────────────────────────────────────────────────

/**
 * Derive a Market PDA.
 * Seeds: ["market", authority, market_id_le]
 * @param {PublicKey} authority
 * @param {bigint|number} marketId
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findMarketAddress(authority, marketId, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddress(
    [SEEDS.MARKET, authority.toBuffer(), u64ToLeBytes(marketId)],
    programId
  );
}

// ── Vault (SOL lamport vault) ────────────────────────────────────────

/**
 * Derive the SOL vault PDA for a market.
 * Seeds: ["vault", market]
 * @param {PublicKey} market
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findVaultAddress(market, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddress(
    [SEEDS.VAULT, market.toBuffer()],
    programId
  );
}

// ── Vault Authority (token vault owner) ──────────────────────────────

/**
 * Derive the vault authority PDA for SPL/Token-2022 markets.
 * Seeds: ["vault_authority", market]
 * @param {PublicKey} market
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findVaultAuthorityAddress(market, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddress(
    [SEEDS.VAULT_AUTHORITY, market.toBuffer()],
    programId
  );
}

// ── User Position ────────────────────────────────────────────────────

/**
 * Derive a UserPosition PDA.
 * Seeds: ["position", market, owner, outcome_index]
 * @param {PublicKey} market
 * @param {PublicKey} owner
 * @param {number} outcomeIndex
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findPositionAddress(
  market,
  owner,
  outcomeIndex,
  programId = PROGRAM_ID
) {
  return PublicKey.findProgramAddress(
    [
      SEEDS.POSITION,
      market.toBuffer(),
      owner.toBuffer(),
      u8ToBytes(outcomeIndex),
    ],
    programId
  );
}

// ── MultisigAuthority ────────────────────────────────────────────────

/**
 * Derive a MultisigAuthority PDA.
 * Seeds: ["multisig", creator, nonce_le]
 * @param {PublicKey} creator
 * @param {bigint|number} nonce
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findMultisigAddress(creator, nonce, programId = PROGRAM_ID) {
  return PublicKey.findProgramAddress(
    [SEEDS.MULTISIG, creator.toBuffer(), u64ToLeBytes(nonce)],
    programId
  );
}

// ── MultisigProposal ─────────────────────────────────────────────────

/**
 * Derive a MultisigProposal PDA.
 * Seeds: ["proposal", multisig, proposal_id_le]
 * @param {PublicKey} multisig
 * @param {bigint|number} proposalId
 * @param {PublicKey} [programId]
 * @returns {Promise<[PublicKey, number]>}
 */
export function findProposalAddress(
  multisig,
  proposalId,
  programId = PROGRAM_ID
) {
  return PublicKey.findProgramAddress(
    [SEEDS.PROPOSAL, multisig.toBuffer(), u64ToLeBytes(proposalId)],
    programId
  );
}
