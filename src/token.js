/**
 * @module token
 * Zero-dependency Token-2022 mint-extension helpers.
 *
 * These functions parse the raw bytes of a mint account (exactly the buffer
 * returned by `connection.getAccountInfo(mint).data`) and reproduce the
 * on-chain program's extension policy. Running them before building a
 * `createTokenMarket` / `placeTokenBet` transaction lets callers surface a
 * clear, immediate error instead of paying for a transaction that the program
 * will reject.
 *
 * The byte layout mirrors `spl_token_2022` and the program's `token_utils.rs`:
 *
 *   [ base mint (82 bytes) ][ account_type (1 byte) ][ extensions... ]
 *
 * where account_type == 2 marks a mint-with-extensions, and each extension is
 * a TLV record:
 *
 *   [ type (u16 LE) ][ length (u16 LE) ][ data (length bytes) ]
 */

import {
  MintExtension,
  MintExtensionName,
  ALLOWED_MINT_EXTENSIONS,
  BLOCKED_MINT_EXTENSIONS,
} from "./constants.js";

// ── Layout constants (must match token_utils.rs) ─────────────────────
/** Base mint size — identical for SPL Token and Token-2022. */
export const MINT_BASE_SIZE = 82;
/** Offset of the account-type discriminator byte. */
const ACCOUNT_TYPE_OFFSET = MINT_BASE_SIZE;
/** account_type value that marks a Token-2022 mint carrying extensions. */
const ACCOUNT_TYPE_MINT_WITH_EXTENSIONS = 2;

// TransferFeeConfig data layout (within the extension's data section):
//   transfer_fee_config_authority  COption<Pubkey>  4 + 32 = 36
//   withdraw_withheld_authority    COption<Pubkey>  4 + 32 = 36
//   withheld_amount                u64                       8
//   older_transfer_fee  { epoch u64, maximum_fee u64, bps u16 } = 18
//   newer_transfer_fee  { epoch u64, maximum_fee u64, bps u16 } = 18
const NEWER_FEE_OFFSET = 36 + 36 + 8 + 18; // = 98
const TRANSFER_FEE_SIZE = 18;

/** Coerce web3.js account data (Buffer | Uint8Array | number[]) to Uint8Array. */
function asBytes(mintData) {
  if (mintData == null) throw new TypeError("mint account data is required");
  if (mintData instanceof Uint8Array) return mintData;
  if (Array.isArray(mintData)) return Uint8Array.from(mintData);
  if (mintData.data) return asBytes(mintData.data); // AccountInfo passed directly
  throw new TypeError("unsupported mint data type");
}

function readU16LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function readU64LE(buf, off) {
  let v = 0n;
  for (let i = 0; i < 8; i++) v |= BigInt(buf[off + i]) << BigInt(8 * i);
  return v;
}

/**
 * @typedef {Object} ParsedExtension
 * @property {number} type      Extension type ID (u16).
 * @property {string} name      Human-readable name, or `Unknown(<id>)`.
 * @property {number} offset    Byte offset of the TLV record within the account.
 * @property {number} length    Length of the extension's data section.
 * @property {boolean} allowed  Whether the program accepts this extension.
 * @property {string|null} error  Program error name if blocked, else null.
 */

/**
 * Walk every TLV extension record on a mint account.
 *
 * @param {Uint8Array | Buffer | number[] | {data:any}} mintData Raw mint account bytes.
 * @returns {ParsedExtension[]} Empty array for legacy SPL mints or plain
 *   Token-2022 mints with no extensions.
 */
export function parseMintExtensions(mintData) {
  const buf = asBytes(mintData);

  // Legacy SPL Token mint, or Token-2022 mint with no extension section.
  if (buf.length <= ACCOUNT_TYPE_OFFSET + 1) return [];
  if (buf[ACCOUNT_TYPE_OFFSET] !== ACCOUNT_TYPE_MINT_WITH_EXTENSIONS) return [];

  const out = [];
  let offset = ACCOUNT_TYPE_OFFSET + 1;

  while (offset + 4 <= buf.length) {
    const type = readU16LE(buf, offset);
    const length = readU16LE(buf, offset + 2);
    const dataEnd = offset + 4 + length;
    if (dataEnd > buf.length) {
      throw new RangeError(
        `malformed mint: extension at offset ${offset} claims length ${length} past end`
      );
    }

    const blockedError = BLOCKED_MINT_EXTENSIONS[type] ?? null;
    const isAllowed = ALLOWED_MINT_EXTENSIONS.includes(type);
    out.push({
      type,
      name: MintExtensionName[type] ?? `Unknown(${type})`,
      offset,
      length,
      allowed: isAllowed,
      error: isAllowed ? null : blockedError ?? "UnsupportedTokenExtension",
    });

    offset = dataEnd;
  }

  return out;
}

/**
 * @typedef {Object} MintValidation
 * @property {boolean} ok            True if the program would accept this mint.
 * @property {ParsedExtension[]} extensions  All extensions found.
 * @property {ParsedExtension[]} blocked      Extensions that would be rejected.
 * @property {string|null} error     Program error name of the first blocking
 *   extension (the one the program hits first), or null if `ok`.
 */

/**
 * Decide whether the program would accept a mint for market creation, mirroring
 * `validate_only_allowed_extensions`. The reported `error` matches the program
 * error the on-chain check would raise first.
 *
 * @param {Uint8Array | Buffer | number[] | {data:any}} mintData Raw mint account bytes.
 * @returns {MintValidation}
 */
export function validateMintForMarket(mintData) {
  const extensions = parseMintExtensions(mintData);
  const blocked = extensions.filter((e) => !e.allowed);
  return {
    ok: blocked.length === 0,
    extensions,
    blocked,
    error: blocked.length ? blocked[0].error : null,
  };
}

/**
 * @typedef {Object} TransferFeeConfig
 * @property {number} feeBps   Current (newer) transfer fee in basis points.
 * @property {bigint} maxFee   Current (newer) maximum fee, in token base units.
 */

/**
 * Read the active transfer-fee schedule from a mint, if present. Reads the
 * `newer_transfer_fee` schedule — the one the runtime applies to current
 * transfers — matching the program's `extract_transfer_fee_config`.
 *
 * @param {Uint8Array | Buffer | number[] | {data:any}} mintData Raw mint account bytes.
 * @returns {TransferFeeConfig | null} null if the mint has no TransferFeeConfig.
 */
export function getTransferFeeConfig(mintData) {
  const ext = parseMintExtensions(mintData).find(
    (e) => e.type === MintExtension.TransferFeeConfig
  );
  if (!ext) return null;

  const buf = asBytes(mintData);
  const dataStart = ext.offset + 4;
  if (ext.length < NEWER_FEE_OFFSET + TRANSFER_FEE_SIZE) {
    throw new RangeError("malformed TransferFeeConfig extension");
  }

  const nf = dataStart + NEWER_FEE_OFFSET;
  const maxFee = readU64LE(buf, nf + 8);       // after epoch (u64)
  const feeBps = readU16LE(buf, nf + 16);      // after epoch + maximum_fee
  return { feeBps, maxFee };
}

/**
 * Convenience: does this mint carry the given extension type?
 * @param {Uint8Array | Buffer | number[] | {data:any}} mintData
 * @param {number} extensionType One of {@link MintExtension}.
 * @returns {boolean}
 */
export function hasMintExtension(mintData, extensionType) {
  return parseMintExtensions(mintData).some((e) => e.type === extensionType);
}
