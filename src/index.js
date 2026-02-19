/**
 * @module precog-markets
 * Complete JavaScript SDK for the on-chain Solana prediction market program.
 *
 * @example
 * ```js
 * import { PrecogMarketsClient, PROGRAM_ID } from "precog-markets";
 * import { Connection, Keypair } from "@solana/web3.js";
 *
 * const connection = new Connection("https://api.devnet.solana.com");
 * const client = new PrecogMarketsClient(connection);
 *
 * // Fetch a market
 * const market = await client.fetchMarket(marketPubkey);
 * console.log(market.title, market.outcomeLabels);
 * ```
 */

// ── Constants & enums ────────────────────────────────────────────────
export {
  PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  RENT_SYSVAR_ID,
  MAX_OUTCOMES,
  MAX_TITLE_LEN,
  MAX_DESCRIPTION_LEN,
  MAX_OUTCOME_LABEL_LEN,
  MIN_BET_LAMPORTS,
  MIN_BET_TOKEN,
  MAX_FEE_BPS,
  DISPUTE_WINDOW_SECONDS,
  MAX_MULTISIG_SIGNERS,
  MULTISIG_PROPOSAL_EXPIRY_SECONDS,
  SEEDS,
  DISCRIMINATORS,
  ACCOUNT_DISCRIMINATORS,
  MarketStatus,
  TokenDenomination,
  ProposalActionTag,
  ErrorCode,
  ErrorName,
} from "./constants.js";

// ── PDA derivation ───────────────────────────────────────────────────
export {
  u64ToLeBytes,
  u8ToBytes,
  findProtocolConfigAddress,
  findMarketAddress,
  findVaultAddress,
  findVaultAuthorityAddress,
  findPositionAddress,
  findMultisigAddress,
  findProposalAddress,
} from "./pda.js";

// ── Serialization ────────────────────────────────────────────────────
export { BorshWriter, BorshReader } from "./serialization.js";

// ── Account decoders ─────────────────────────────────────────────────
export {
  decodeMarket,
  decodeUserPosition,
  decodeProtocolConfig,
  decodeMultisigAuthority,
  decodeMultisigProposal,
} from "./accounts.js";

// ── Instruction builders ─────────────────────────────────────────────
export {
  initializeProtocol,
  createMarket,
  placeBet,
  resolveMarket,
  finalizeMarket,
  claimWinnings,
  voidMarket,
  claimRefund,
  updateProtocolConfig,
  createMultisig,
  createProposal,
  approveProposal,
  executeProposal,
  harvestWithheldTokens,
} from "./instructions.js";

// ── High-level client ────────────────────────────────────────────────
export { PrecogMarketsClient } from "./client.js";
