/**
 * @module constants
 * Program constants derived from the on-chain IDL.
 */

import { PublicKey } from "@solana/web3.js";

/** Prediction-market program ID */
export const PROGRAM_ID = new PublicKey(
  "6KfoCcTUVsS8i1h31dhK8cydvDXGmRyTdya7jbjoymn9"
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

// ── Instruction discriminators (single u8 byte) ─────────────────────
export const DISCRIMINATORS = {
  INITIALIZE_PROTOCOL: Buffer.from([0]),
  CREATE_MARKET: Buffer.from([1]),
  PLACE_BET: Buffer.from([2]),
  RESOLVE_MARKET: Buffer.from([3]),
  FINALIZE_MARKET: Buffer.from([4]),
  CLAIM_WINNINGS: Buffer.from([5]),
  VOID_MARKET: Buffer.from([6]),
  CLAIM_REFUND: Buffer.from([7]),
  UPDATE_PROTOCOL_CONFIG: Buffer.from([8]),
  CREATE_MULTISIG: Buffer.from([9]),
  CREATE_PROPOSAL: Buffer.from([10]),
  APPROVE_PROPOSAL: Buffer.from([11]),
  EXECUTE_PROPOSAL: Buffer.from([12]),
  HARVEST_WITHHELD_TOKENS: Buffer.from([13]),
  DISPUTE_RESOLVE: Buffer.from([14]),
};

// ── Account discriminators (8-byte magic headers from IDL) ──────────
export const ACCOUNT_DISCRIMINATORS = {
  MARKET: Buffer.from([0x4d, 0x41, 0x52, 0x4b, 0x45, 0x54, 0x56, 0x32]),           // MARKETV2
  USER_POSITION: Buffer.from([0x50, 0x4f, 0x53, 0x49, 0x54, 0x4e, 0x56, 0x31]),     // POSITNV1
  PROTOCOL_CONFIG: Buffer.from([0x50, 0x52, 0x4f, 0x54, 0x4f, 0x43, 0x4f, 0x4c]),   // PROTOCOL
  MULTISIG_AUTHORITY: Buffer.from([0x4d, 0x55, 0x4c, 0x54, 0x53, 0x49, 0x47, 0x31]),// MULTSIG1
  MULTISIG_PROPOSAL: Buffer.from([0x50, 0x52, 0x4f, 0x50, 0x4f, 0x53, 0x4c, 0x31]),// PROPOSL1
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
  9: "WinningPoolEmpty",
  10: "InsufficientDistinctPositions",
  11: "DeadlineNotReached",
  12: "DeadlinePassed",
  13: "MarketInDispute",
  14: "ZeroBetAmount",
  15: "BetBelowMinimum",
  16: "InvalidOutcomeIndex",
  17: "NoWinningPosition",
  18: "AlreadyClaimedWinnings",
  19: "RefundNotAvailable",
  20: "UnauthorizedAuthority",
  21: "UnauthorizedAdmin",
  22: "UnauthorizedPositionOwner",
  23: "MissingSignature",
  24: "InvalidPDA",
  25: "AccountAlreadyInitialized",
  26: "AccountNotInitialized",
  27: "InvalidVault",
  28: "InvalidSystemProgram",
  29: "ArithmeticOverflow",
  30: "DivisionByZero",
  31: "FeeTooHigh",
  32: "DisputePeriodExpired",
  33: "DisputePeriodNotExpired",
  34: "InvalidTokenProgram",
  35: "TokenMintMismatch",
  36: "InvalidTokenVaultOwner",
  37: "InvalidTokenAccount",
  38: "TokenTransferFailed",
  39: "DenominationMismatch",
  40: "InvalidMint",
  41: "DecimalsMismatch",
  42: "TransferFeeExceedsLimit",
  43: "InsufficientPostFeeAmount",
  44: "TransferHookNotAllowed",
  45: "NonTransferableNotAllowed",
  46: "PermanentDelegateNotAllowed",
  47: "ConfidentialTransferNotAllowed",
  48: "UnsupportedTokenExtension",
  49: "HarvestNotAuthorized",
  50: "NewDeadlineInPast",
  51: "MarketNotOpenForUpdate",
  52: "MultisigSignersFull",
  53: "CannotRemoveSigner",
  54: "SignerNotFound",
  55: "MarketNotRequired",
  56: "InvalidMultisigThreshold",
  57: "TooManyMultisigSigners",
  58: "DuplicateMultisigSigner",
  59: "InsufficientMultisigSignatures",
  60: "SignerNotMultisigMember",
  61: "ProposalAlreadyExecuted",
  62: "ProposalExpired",
  63: "AlreadyApprovedProposal",
  64: "SignerSetChanged",
  65: "FeeBelowProtocolMinimum",
  66: "OutcomeUnchanged",
});

/** Map error name → code */
export const ErrorName = Object.fromEntries(
  Object.entries(ErrorCode).map(([k, v]) => [v, Number(k)])
);

// ── Token-2022 mint extension type IDs ───────────────────────────────
// Source: spl_token_2022::extension::ExtensionType (the u16 TLV discriminant).
// These mirror the on-chain program's extension allow/block policy so a mint
// can be validated client-side *before* a market-creation or bet transaction
// is sent, turning a failed transaction into an immediate, descriptive error.
export const MintExtension = /** @type {const} */ ({
  TransferFeeConfig: 1,
  MintCloseAuthority: 3,
  ConfidentialTransferMint: 5,
  TransferHook: 7,
  NonTransferable: 9,
  DefaultAccountState: 10,
  InterestBearingConfig: 11,
  PermanentDelegate: 12,
  MetadataPointer: 18,
  TokenMetadata: 19,
  ConfidentialTransferFeeConfig: 20,
});

/** Reverse map: extension type ID → name */
export const MintExtensionName = Object.fromEntries(
  Object.entries(MintExtension).map(([k, v]) => [v, k])
);

/**
 * Extension types the program accepts on a market's mint.
 * Each is either fully handled (TransferFeeConfig) or provably harmless to the
 * program's balance/payout math (see per-entry reasoning in the on-chain
 * token_utils.rs). Any type NOT in this set is rejected.
 */
export const ALLOWED_MINT_EXTENSIONS = /** @type {const} */ ([
  MintExtension.TransferFeeConfig,
  MintExtension.MintCloseAuthority,
  MintExtension.DefaultAccountState,
  MintExtension.InterestBearingConfig,
  MintExtension.MetadataPointer,
  MintExtension.TokenMetadata,
]);

/**
 * Extension types the program explicitly rejects, mapped to the specific
 * program error each one raises. Extension types that are neither allowed nor
 * in this table raise the generic `UnsupportedTokenExtension`.
 */
export const BLOCKED_MINT_EXTENSIONS = /** @type {const} */ ({
  [MintExtension.TransferHook]: "TransferHookNotAllowed",
  [MintExtension.NonTransferable]: "NonTransferableNotAllowed",
  [MintExtension.PermanentDelegate]: "PermanentDelegateNotAllowed",
  [MintExtension.ConfidentialTransferMint]: "ConfidentialTransferNotAllowed",
  [MintExtension.ConfidentialTransferFeeConfig]: "ConfidentialTransferNotAllowed",
});