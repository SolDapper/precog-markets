/**
 * precog-markets — TypeScript declarations
 */

import {
  PublicKey,
  Connection,
  TransactionInstruction,
  ConfirmOptions,
  Signer,
} from "@solana/web3.js";

// ═══════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════

export declare const PROGRAM_ID: PublicKey;
export declare const TOKEN_PROGRAM_ID: PublicKey;
export declare const TOKEN_2022_PROGRAM_ID: PublicKey;
export declare const SYSTEM_PROGRAM_ID: PublicKey;
export declare const RENT_SYSVAR_ID: PublicKey;

export declare const MAX_OUTCOMES: 10;
export declare const MAX_TITLE_LEN: 128;
export declare const MAX_DESCRIPTION_LEN: 512;
export declare const MAX_OUTCOME_LABEL_LEN: 64;
export declare const MIN_BET_LAMPORTS: bigint;
export declare const MIN_BET_TOKEN: bigint;
export declare const MAX_FEE_BPS: 500;
export declare const DISPUTE_WINDOW_SECONDS: 86400;
export declare const MAX_MULTISIG_SIGNERS: 11;
export declare const MULTISIG_PROPOSAL_EXPIRY_SECONDS: 604800;

export declare const SEEDS: {
  readonly PROTOCOL_CONFIG: Buffer;
  readonly MARKET: Buffer;
  readonly VAULT: Buffer;
  readonly VAULT_AUTHORITY: Buffer;
  readonly POSITION: Buffer;
  readonly MULTISIG: Buffer;
  readonly PROPOSAL: Buffer;
};

export declare const DISCRIMINATORS: {
  readonly INITIALIZE_PROTOCOL: Buffer;
  readonly CREATE_MARKET: Buffer;
  readonly PLACE_BET: Buffer;
  readonly RESOLVE_MARKET: Buffer;
  readonly FINALIZE_MARKET: Buffer;
  readonly CLAIM_WINNINGS: Buffer;
  readonly VOID_MARKET: Buffer;
  readonly CLAIM_REFUND: Buffer;
  readonly UPDATE_PROTOCOL_CONFIG: Buffer;
  readonly CREATE_MULTISIG: Buffer;
  readonly CREATE_PROPOSAL: Buffer;
  readonly APPROVE_PROPOSAL: Buffer;
  readonly EXECUTE_PROPOSAL: Buffer;
  readonly HARVEST_WITHHELD_TOKENS: Buffer;
};

export declare const ACCOUNT_DISCRIMINATORS: {
  readonly MARKET: Buffer;
  readonly USER_POSITION: Buffer;
  readonly PROTOCOL_CONFIG: Buffer;
  readonly MULTISIG_AUTHORITY: Buffer;
  readonly MULTISIG_PROPOSAL: Buffer;
};

export declare const MarketStatus: {
  readonly Open: 0;
  readonly Resolved: 1;
  readonly Finalized: 2;
  readonly Voided: 3;
};
export type MarketStatusValue = (typeof MarketStatus)[keyof typeof MarketStatus];

export declare const TokenDenomination: {
  readonly NativeSol: 0;
  readonly SplToken: 1;
  readonly Token2022: 2;
};
export type TokenDenominationValue = (typeof TokenDenomination)[keyof typeof TokenDenomination];

export declare const ProposalActionTag: {
  readonly ResolveMarket: 0;
  readonly VoidMarket: 1;
  readonly UpdateDeadline: 2;
  readonly UpdateFeeBps: 3;
  readonly AddSigner: 4;
  readonly RemoveSigner: 5;
  readonly ChangeThreshold: 6;
};
export type ProposalActionTagValue = (typeof ProposalActionTag)[keyof typeof ProposalActionTag];

export declare const ErrorCode: Record<number, string>;
export declare const ErrorName: Record<string, number>;

// ═══════════════════════════════════════════════════════════════════════
// PDA Derivation
// ═══════════════════════════════════════════════════════════════════════

export declare function u64ToLeBytes(val: bigint | number): Buffer;
export declare function u8ToBytes(val: number): Buffer;

export declare function findProtocolConfigAddress(
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findMarketAddress(
  authority: PublicKey,
  marketId: bigint | number,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findVaultAddress(
  market: PublicKey,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findVaultAuthorityAddress(
  market: PublicKey,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findPositionAddress(
  market: PublicKey,
  owner: PublicKey,
  outcomeIndex: number,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findMultisigAddress(
  creator: PublicKey,
  nonce: bigint | number,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

export declare function findProposalAddress(
  multisig: PublicKey,
  proposalId: bigint | number,
  programId?: PublicKey
): Promise<[PublicKey, number]>;

// ═══════════════════════════════════════════════════════════════════════
// Serialization
// ═══════════════════════════════════════════════════════════════════════

export declare class BorshWriter {
  constructor(initialCapacity?: number);
  toBuffer(): Buffer;
  writeU8(v: number): this;
  writeU16(v: number): this;
  writeU32(v: number): this;
  writeU64(v: bigint | number): this;
  writeI64(v: bigint | number): this;
  writeBool(v: boolean): this;
  writeString(s: string): this;
  writeFixedBytes(data: Buffer | Uint8Array): this;
  writeVec<T>(arr: T[], writeFn: (writer: BorshWriter, item: T) => void): this;
  writeOption<T>(
    val: T | null | undefined,
    writeFn: (writer: BorshWriter, v: T) => void
  ): this;
  writePubkey(pk: PublicKey): this;
}

export declare class BorshReader {
  constructor(data: Buffer | Uint8Array);
  readonly offset: number;
  readU8(): number;
  readU16(): number;
  readU32(): number;
  readU64(): bigint;
  readI64(): bigint;
  readBool(): boolean;
  readString(): string;
  readFixedBytes(len: number): Buffer;
  readVec<T>(readFn: (reader: BorshReader) => T): T[];
  readOption<T>(readFn: (reader: BorshReader) => T): T | null;
  readPubkey(): PublicKey;
  skip(n: number): void;
}

// ═══════════════════════════════════════════════════════════════════════
// Account types
// ═══════════════════════════════════════════════════════════════════════

export interface MarketAccount {
  discriminator: Buffer;
  bump: number;
  marketId: bigint;
  authority: PublicKey;
  authorityIsMultisig: boolean;
  status: MarketStatusValue;
  statusName: string;
  resolutionDeadline: bigint;
  resolvedAt: bigint;
  winningOutcome: number;
  feeBps: number;
  feesCollected: bigint;
  numOutcomes: number;
  outcomePools: bigint[];
  totalPool: bigint;
  totalPositions: bigint;
  denomination: TokenDenominationValue;
  denominationName: string;
  tokenMint: PublicKey;
  tokenDecimals: number;
  title: string;
  description: string;
  outcomeLabels: string[];
}

export interface UserPositionAccount {
  discriminator: Buffer;
  bump: number;
  market: PublicKey;
  owner: PublicKey;
  outcomeIndex: number;
  amount: bigint;
  claimed: boolean;
  lastDepositAt: bigint;
}

export interface ProtocolConfigAccount {
  discriminator: Buffer;
  bump: number;
  admin: PublicKey;
  defaultFeeBps: number;
  treasury: PublicKey;
  paused: boolean;
  totalMarketsCreated: bigint;
  totalVolume: bigint;
}

export interface MultisigAuthorityAccount {
  discriminator: Buffer;
  bump: number;
  nonce: bigint;
  threshold: number;
  numSigners: number;
  signers: PublicKey[];
  proposalCount: bigint;
}

export interface DecodedProposalAction {
  tag: ProposalActionTagValue;
  name: string;
  fields: Record<string, unknown>;
}

export interface MultisigProposalAccount {
  discriminator: Buffer;
  bump: number;
  multisig: PublicKey;
  market: PublicKey;
  proposalId: bigint;
  action: DecodedProposalAction;
  proposer: PublicKey;
  approvals: number;
  approvalCount: number;
  executed: boolean;
  createdAt: bigint;
}

export declare function decodeMarket(data: Buffer | Uint8Array): MarketAccount;
export declare function decodeUserPosition(data: Buffer | Uint8Array): UserPositionAccount;
export declare function decodeProtocolConfig(data: Buffer | Uint8Array): ProtocolConfigAccount;
export declare function decodeMultisigAuthority(data: Buffer | Uint8Array): MultisigAuthorityAccount;
export declare function decodeMultisigProposal(data: Buffer | Uint8Array): MultisigProposalAccount;

// ═══════════════════════════════════════════════════════════════════════
// Instruction builders
// ═══════════════════════════════════════════════════════════════════════

export interface InitializeProtocolAccounts {
  protocolConfig: PublicKey;
  admin: PublicKey;
  treasury: PublicKey;
}

export declare function initializeProtocol(
  accounts: InitializeProtocolAccounts,
  args: { defaultFeeBps: number },
  programId?: PublicKey
): TransactionInstruction;

export interface CreateMarketAccounts {
  market: PublicKey;
  vault: PublicKey;
  authority: PublicKey;
  payer: PublicKey;
  protocolConfig: PublicKey;
  tokenMint?: PublicKey;
  vaultAuthority?: PublicKey;
  tokenVault?: PublicKey;
  tokenProgram?: PublicKey;
  rent?: PublicKey;
}

export interface CreateMarketArgs {
  marketId: bigint | number;
  title: string;
  description: string;
  outcomeLabels: string[];
  resolutionDeadline: bigint | number;
  feeBpsOverride?: number | null;
  denomination: number;
  authorityIsMultisig: boolean;
}

export declare function createMarket(
  accounts: CreateMarketAccounts,
  args: CreateMarketArgs,
  programId?: PublicKey
): TransactionInstruction;

export interface PlaceBetAccounts {
  market: PublicKey;
  vault: PublicKey;
  position: PublicKey;
  bettor: PublicKey;
  bettorTokenAccount?: PublicKey;
  tokenVault?: PublicKey;
  tokenMint?: PublicKey;
  tokenProgram?: PublicKey;
  vaultAuthority?: PublicKey;
}

export declare function placeBet(
  accounts: PlaceBetAccounts,
  args: { outcomeIndex: number; amount: bigint | number },
  programId?: PublicKey
): TransactionInstruction;

export declare function resolveMarket(
  accounts: { market: PublicKey; authority: PublicKey },
  args: { winningOutcome: number },
  programId?: PublicKey
): TransactionInstruction;

export declare function finalizeMarket(
  accounts: { market: PublicKey },
  programId?: PublicKey
): TransactionInstruction;

export interface ClaimWinningsAccounts {
  market: PublicKey;
  vault: PublicKey;
  position: PublicKey;
  claimant: PublicKey;
  protocolConfig: PublicKey;
  treasury: PublicKey;
  claimantTokenAccount?: PublicKey;
  treasuryTokenAccount?: PublicKey;
  tokenVault?: PublicKey;
  vaultAuthority?: PublicKey;
  tokenMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export declare function claimWinnings(
  accounts: ClaimWinningsAccounts,
  programId?: PublicKey
): TransactionInstruction;

export declare function voidMarket(
  accounts: { market: PublicKey; authority: PublicKey },
  programId?: PublicKey
): TransactionInstruction;

export interface ClaimRefundAccounts {
  market: PublicKey;
  vault: PublicKey;
  position: PublicKey;
  claimant: PublicKey;
  claimantTokenAccount?: PublicKey;
  tokenVault?: PublicKey;
  vaultAuthority?: PublicKey;
  tokenMint?: PublicKey;
  tokenProgram?: PublicKey;
}

export declare function claimRefund(
  accounts: ClaimRefundAccounts,
  programId?: PublicKey
): TransactionInstruction;

export interface UpdateProtocolConfigArgs {
  newDefaultFeeBps?: number | null;
  newTreasury?: PublicKey | null;
  paused?: boolean | null;
}

export declare function updateProtocolConfig(
  accounts: { protocolConfig: PublicKey; admin: PublicKey },
  args: UpdateProtocolConfigArgs,
  programId?: PublicKey
): TransactionInstruction;

export interface CreateMultisigArgs {
  nonce: bigint | number;
  threshold: number;
  signers: PublicKey[];
}

export declare function createMultisig(
  accounts: { multisig: PublicKey; creator: PublicKey },
  args: CreateMultisigArgs,
  programId?: PublicKey
): TransactionInstruction;

export interface CreateProposalAction {
  type:
    | "ResolveMarket"
    | "VoidMarket"
    | "UpdateDeadline"
    | "UpdateFeeBps"
    | "AddSigner"
    | "RemoveSigner"
    | "ChangeThreshold";
  fields?: Record<string, unknown>;
}

export declare function createProposal(
  accounts: {
    proposal: PublicKey;
    multisig: PublicKey;
    market: PublicKey;
    proposer: PublicKey;
  },
  args: { action: CreateProposalAction },
  programId?: PublicKey
): TransactionInstruction;

export declare function approveProposal(
  accounts: { proposal: PublicKey; multisig: PublicKey; signer: PublicKey },
  programId?: PublicKey
): TransactionInstruction;

export declare function executeProposal(
  accounts: { proposal: PublicKey; multisig: PublicKey; market: PublicKey },
  programId?: PublicKey
): TransactionInstruction;

export interface HarvestWithheldTokensAccounts {
  market: PublicKey;
  tokenMint: PublicKey;
  tokenVault: PublicKey;
  destination: PublicKey;
  withdrawAuthority: PublicKey;
  tokenProgram: PublicKey;
}

export declare function harvestWithheldTokens(
  accounts: HarvestWithheldTokensAccounts,
  programId?: PublicKey
): TransactionInstruction;

// ═══════════════════════════════════════════════════════════════════════
// High-level Client
// ═══════════════════════════════════════════════════════════════════════

export declare class PrecogMarketsClient {
  readonly connection: Connection;
  readonly programId: PublicKey;

  constructor(connection: Connection, programId?: PublicKey);

  // Transaction sending
  sendTransaction(
    instructions: TransactionInstruction[],
    signers: Signer[],
    opts?: ConfirmOptions
  ): Promise<string>;

  // Low-level instruction builders
  buildInstructions: typeof import("./instructions.js");

  // PDA derivation
  findProtocolConfig(): Promise<[PublicKey, number]>;
  findMarket(authority: PublicKey, marketId: bigint | number): Promise<[PublicKey, number]>;
  findVault(market: PublicKey): Promise<[PublicKey, number]>;
  findVaultAuthority(market: PublicKey): Promise<[PublicKey, number]>;
  findPosition(market: PublicKey, owner: PublicKey, outcomeIndex: number): Promise<[PublicKey, number]>;
  findMultisig(creator: PublicKey, nonce: bigint | number): Promise<[PublicKey, number]>;
  findProposal(multisig: PublicKey, proposalId: bigint | number): Promise<[PublicKey, number]>;

  // Account fetchers
  fetchMarket(address: PublicKey): Promise<MarketAccount | null>;
  fetchUserPosition(address: PublicKey): Promise<UserPositionAccount | null>;
  fetchProtocolConfig(address?: PublicKey): Promise<ProtocolConfigAccount | null>;
  fetchMultisigAuthority(address: PublicKey): Promise<MultisigAuthorityAccount | null>;
  fetchMultisigProposal(address: PublicKey): Promise<MultisigProposalAccount | null>;

  // Batch fetchers
  fetchMarkets(addresses: PublicKey[]): Promise<(MarketAccount | null)[]>;
  fetchUserPositions(addresses: PublicKey[]): Promise<(UserPositionAccount | null)[]>;

  // gPA queries
  getAllMarkets(filters?: {
    authority?: PublicKey;
  }): Promise<Array<{ pubkey: PublicKey; account: MarketAccount }>>;

  getPositionsByOwner(
    owner: PublicKey
  ): Promise<Array<{ pubkey: PublicKey; account: UserPositionAccount }>>;

  getPositionsByMarket(
    market: PublicKey
  ): Promise<Array<{ pubkey: PublicKey; account: UserPositionAccount }>>;

  getProposalsByMultisig(
    multisig: PublicKey
  ): Promise<Array<{ pubkey: PublicKey; account: MultisigProposalAccount }>>;

  // High-level transactional methods
  initializeProtocol(
    admin: Signer,
    treasury: PublicKey,
    defaultFeeBps: number,
    opts?: ConfirmOptions
  ): Promise<{ signature: string; protocolConfig: PublicKey }>;

  createSolMarket(params: {
    payer: Signer;
    authority?: PublicKey;
    marketId: bigint | number;
    title: string;
    description: string;
    outcomeLabels: string[];
    resolutionDeadline: bigint | number;
    feeBpsOverride?: number | null;
    authorityIsMultisig?: boolean;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string; market: PublicKey; vault: PublicKey }>;

  createTokenMarket(params: {
    payer: Signer;
    authority?: PublicKey;
    marketId: bigint | number;
    title: string;
    description: string;
    outcomeLabels: string[];
    resolutionDeadline: bigint | number;
    feeBpsOverride?: number | null;
    tokenMint: PublicKey;
    tokenVault: PublicKey;
    tokenProgram: PublicKey;
    denomination: number;
    authorityIsMultisig?: boolean;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string; market: PublicKey; vault: PublicKey; vaultAuthority: PublicKey }>;

  placeSolBet(params: {
    bettor: Signer;
    market: PublicKey;
    outcomeIndex: number;
    amount: bigint | number;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string; position: PublicKey }>;

  placeTokenBet(params: {
    bettor: Signer;
    market: PublicKey;
    outcomeIndex: number;
    amount: bigint | number;
    bettorTokenAccount: PublicKey;
    tokenVault: PublicKey;
    tokenMint: PublicKey;
    tokenProgram: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string; position: PublicKey }>;

  resolveMarket(
    authority: Signer,
    market: PublicKey,
    winningOutcome: number,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  finalizeMarket(
    payer: Signer,
    market: PublicKey,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  claimSolWinnings(params: {
    claimant: Signer;
    market: PublicKey;
    position: PublicKey;
    treasury: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string }>;

  claimTokenWinnings(params: {
    claimant: Signer;
    market: PublicKey;
    position: PublicKey;
    treasury: PublicKey;
    claimantTokenAccount: PublicKey;
    treasuryTokenAccount: PublicKey;
    tokenVault: PublicKey;
    tokenMint: PublicKey;
    tokenProgram: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string }>;

  voidMarket(
    authority: Signer,
    market: PublicKey,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  claimSolRefund(params: {
    claimant: Signer;
    market: PublicKey;
    position: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string }>;

  claimTokenRefund(params: {
    claimant: Signer;
    market: PublicKey;
    position: PublicKey;
    claimantTokenAccount: PublicKey;
    tokenVault: PublicKey;
    tokenMint: PublicKey;
    tokenProgram: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string }>;

  updateProtocolConfig(
    admin: Signer,
    args: UpdateProtocolConfigArgs,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  createMultisig(
    creator: Signer,
    nonce: bigint | number,
    threshold: number,
    signers: PublicKey[],
    opts?: ConfirmOptions
  ): Promise<{ signature: string; multisig: PublicKey }>;

  createProposal(params: {
    proposer: Signer;
    multisig: PublicKey;
    market: PublicKey;
    action: CreateProposalAction;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string; proposal: PublicKey; proposalId: bigint }>;

  approveProposal(
    signer: Signer,
    proposal: PublicKey,
    multisig: PublicKey,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  executeProposal(
    payer: Signer,
    proposal: PublicKey,
    multisig: PublicKey,
    market: PublicKey,
    opts?: ConfirmOptions
  ): Promise<{ signature: string }>;

  harvestWithheldTokens(params: {
    withdrawAuthority: Signer;
    market: PublicKey;
    tokenMint: PublicKey;
    tokenVault: PublicKey;
    destination: PublicKey;
    tokenProgram: PublicKey;
    opts?: ConfirmOptions;
  }): Promise<{ signature: string }>;

  // Utility
  static calculatePayout(
    positionAmount: bigint,
    winningPool: bigint,
    totalPool: bigint,
    feeBps: number
  ): { gross: bigint; fee: bigint; net: bigint };

  static getImpliedProbabilities(
    outcomePools: bigint[],
    totalPool: bigint
  ): number[];
}
