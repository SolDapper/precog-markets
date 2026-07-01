/**
 * Consumer type-test.
 *
 * This file is never executed — it exists only so `tsc --noEmit` can verify
 * that the hand-written `.d.ts` declarations are valid TypeScript and that a
 * downstream consumer can import and use the public API (including the
 * Token-2022 extension helpers) with correct types. If a declaration drifts
 * from the runtime API, this file stops compiling.
 */
import {
  PrecogMarketsClient,
  validateMintForMarket,
  getTransferFeeConfig,
  parseMintExtensions,
  hasMintExtension,
  MintExtension,
  ErrorCode,
  ErrorName,
} from "../src/index.js";
import type {
  MintValidation,
  ParsedExtension,
  TransferFeeConfig,
} from "../src/index.js";
import { PublicKey } from "@solana/web3.js";

// ── Pure extension helpers ───────────────────────────────────────────
const raw: Uint8Array = new Uint8Array(82);

const validation: MintValidation = validateMintForMarket(raw);
const isOk: boolean = validation.ok;
const blocked: ParsedExtension[] = validation.blocked;
const firstError: string | null = validation.error;

const fee: TransferFeeConfig | null = getTransferFeeConfig(raw);
if (fee) {
  const bps: number = fee.feeBps;
  const max: bigint = fee.maxFee;
  void bps;
  void max;
}

const exts: ParsedExtension[] = parseMintExtensions(raw);
const firstName: string = exts.length ? exts[0].name : "";
const present: boolean = hasMintExtension(raw, MintExtension.TransferFeeConfig);

// ── Constant maps ────────────────────────────────────────────────────
const errName: string = ErrorCode[48]; // UnsupportedTokenExtension
const errCode: number = ErrorName["OutcomeUnchanged"];

// ── Client methods (type-level only, never called) ───────────────────
declare const client: PrecogMarketsClient;
declare const mint: PublicKey;

async function clientTypes() {
  const mv: MintValidation = await client.validateTokenMint(mint);
  const tf: TransferFeeConfig | null = await client.fetchTransferFeeConfig(mint);
  const pe: ParsedExtension[] = await client.fetchMintExtensions(mint);
  return { mv, tf, pe };
}

// createTokenMarket accepts the new optional validateMint flag
declare const payer: Parameters<PrecogMarketsClient["createTokenMarket"]>[0]["payer"];

async function createTypes() {
  return client.createTokenMarket({
    payer,
    marketId: 1n,
    title: "t",
    description: "d",
    outcomeLabels: ["Yes", "No"],
    resolutionDeadline: 0n,
    tokenMint: mint,
    tokenVault: mint,
    tokenProgram: mint,
    denomination: 2,
    validateMint: true,
  });
}

// Reference everything so nothing is flagged as unused.
void [
  isOk, blocked, firstError, exts, firstName, present,
  errName, errCode, clientTypes, createTypes, validation,
];
