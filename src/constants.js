/**
 * @module constants
 * Program constants derived from the on-chain IDL.
 */

import { PublicKey } from "@solana/web3.js";

/** Prediction-market program ID */
export const PROGRAM_ID = new PublicKey(
  "PredMkt1111111111111111111111111111111111111"
);

/** SPL Token program ID */
export const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);

/** Token-2022 program ID */
export const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
);

/** System program */
export const SYSTEM_PROGRAM_ID = new PublicKey(
  "11111111111111111111111111111111"
);

/** Sysvar rent */
export const RENT_SYSVAR_ID = new PublicKey(
  "SysvarRent111111111111111111111111111111111"
);

// ── protocol limits ──────────────────────────────────────────────────
export const MAX_OUTCOMES = 10;
export const MAX_TITLE_LEN = 128;
export const MAX_DESCRIPTION_LEN = 512;
export const MAX_OUTCOME_LABEL_LEN = 64;
export const MIN_BET_LAMPORTS = 1_000_000n;
export const MIN_BET_TOKEN = 1n;
export const MAX_FEE_BPS = 500;
export const DISPUTE_WINDOW_SECONDS = 86_400;
export const MAX_MULTISIG_SIGNERS = 11;
export const MULTISIG_PROPOSAL_EXPIRY_SECONDS = 604_800;

// ── PDA seeds ────────────────────────────────────────────────────────
export const SEEDS = {
  PROTOCOL_CONFIG: Buffer.from("protocol_config"),
  MARKET: Buffer.from("market"),
  VAULT: Buffer.from("vault"),
  VAULT_AUTHORITY: Buffer.from("vault_authority"),
  POSITION: Buffer.from("position"),
  MULTISIG: Buffer.from("multisig"),
  PROPOSAL: Buffer.from("proposal"),
};

// ── Instruction discriminators (little-endian u32) ───────────────────
export const DISCRIMINATORS = {
  INITIALIZE_PROTOCOL: Buffer.from([0, 0, 0, 0]),
  CREATE_MARKET: Buffer.from([1, 0, 0, 0]),
  PLACE_BET: Buffer.from([2, 0, 0, 0]),
  RESOLVE_MARKET: Buffer.from([3, 0, 0, 0]),
  FINALIZE_MARKET: Buffer.from([4, 0, 0, 0]),
  CLAIM_WINNINGS: Buffer.from([5, 0, 0, 0]),
  VOID_MARKET: Buffer.from([6, 0, 0, 0]),
  CLAIM_REFUND: Buffer.from([7, 0, 0, 0]),
  UPDATE_PROTOCOL_CONFIG: Buffer.from([8, 0, 0, 0]),
  CREATE_MULTISIG: Buffer.from([9, 0, 0, 0]),
  CREATE_PROPOSAL: Buffer.from([10, 0, 0, 0]),
  APPROVE_PROPOSAL: Buffer.from([11, 0, 0, 0]),
  EXECUTE_PROPOSAL: Buffer.from([12, 0, 0, 0]),
  HARVEST_WITHHELD_TOKENS: Buffer.from([13, 0, 0, 0]),
};

// ── Account discriminators (8-byte) ─────────────────────────────────
// Convention: first 8 bytes of sha256("account:<AccountName>")
// These are placeholders — replace with the real program values.
export const ACCOUNT_DISCRIMINATORS = {
  MARKET: Buffer.from([0x4d, 0x61, 0x72, 0x6b, 0x65, 0x74, 0x00, 0x00]),
  USER_POSITION: Buffer.from([0x50, 0x6f, 0x73, 0x69, 0x74, 0x69, 0x6f, 0x6e]),
  PROTOCOL_CONFIG: Buffer.from([0x50, 0x72, 0x6f, 0x74, 0x6f, 0x43, 0x66, 0x67]),
  MULTISIG_AUTHORITY: Buffer.from([0x4d, 0x75, 0x6c, 0x74, 0x69, 0x53, 0x69, 0x67]),
  MULTISIG_PROPOSAL: Buffer.from([0x50, 0x72, 0x6f, 0x70, 0x6f, 0x73, 0x61, 0x6c]),
};

// ── Enums ────────────────────────────────────────────────────────────

/** MarketStatus enum (on-chain u8) */
export const MarketStatus = /** @type {const} */ ({
  Open: 0,
  Resolved: 1,
  Finalized: 2,
  Voided: 3,
});

/** TokenDenomination enum (on-chain u8) */
export const TokenDenomination = /** @type {const} */ ({
  NativeSol: 0,
  SplToken: 1,
  Token2022: 2,
});

/** ProposalAction tag (on-chain u8 enum tag) */
export const ProposalActionTag = /** @type {const} */ ({
  ResolveMarket: 0,
  VoidMarket: 1,
  UpdateDeadline: 2,
  UpdateFeeBps: 3,
  AddSigner: 4,
  RemoveSigner: 5,
  ChangeThreshold: 6,
});

// ── Error codes ──────────────────────────────────────────────────────
export const ErrorCode = /** @type {const} */ ({
  0: "InvalidInstructionData",
  1: "MarketTitleTooLong",
  2: "MarketDescriptionTooLong",
  3: "InvalidOutcomeCount",
  4: "OutcomeLabelTooLong",
  5: "DeadlineInPast",
  6: "MarketNotOpen",
  7: "MarketNotResolved",
  8: "MarketAlreadyResolved",
  9: "DeadlineNotReached",
  10: "DeadlinePassed",
  11: "MarketInDispute",
  12: "ZeroBetAmount",
  13: "BetBelowMinimum",
  14: "InvalidOutcomeIndex",
  15: "NoWinningPosition",
  16: "AlreadyClaimedWinnings",
  17: "RefundNotAvailable",
  18: "UnauthorizedAuthority",
  19: "UnauthorizedAdmin",
  20: "UnauthorizedPositionOwner",
  21: "MissingSignature",
  22: "InvalidPDA",
  23: "AccountAlreadyInitialized",
  24: "AccountNotInitialized",
  25: "InvalidVault",
  26: "InvalidSystemProgram",
  27: "ArithmeticOverflow",
  28: "DivisionByZero",
  29: "FeeTooHigh",
  30: "DisputePeriodExpired",
  31: "DisputePeriodNotExpired",
  32: "InvalidTokenProgram",
  33: "TokenMintMismatch",
  34: "InvalidTokenVaultOwner",
  35: "InvalidTokenAccount",
  36: "TokenTransferFailed",
  37: "DenominationMismatch",
  38: "InvalidMint",
  39: "DecimalsMismatch",
  40: "InvalidMultisigThreshold",
  41: "TooManyMultisigSigners",
  42: "DuplicateMultisigSigner",
  43: "InsufficientMultisigSignatures",
  44: "SignerNotMultisigMember",
  45: "ProposalAlreadyExecuted",
  46: "ProposalExpired",
  47: "TransferHookNotAllowed",
  48: "HarvestNotAuthorized",
  49: "UnsupportedTokenExtension",
  50: "NewDeadlineInPast",
  51: "MarketNotOpenForUpdate",
  52: "MultisigSignersFull",
  53: "CannotRemoveSigner",
  54: "SignerNotFound",
  55: "MarketNotRequired",
});

/** Map error name → code */
export const ErrorName = Object.fromEntries(
  Object.entries(ErrorCode).map(([k, v]) => [v, Number(k)])
);
