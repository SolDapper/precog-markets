/**
 * Type declarations for the zero-dependency Token-2022 mint-extension helpers.
 */

export declare const MINT_BASE_SIZE: 82;

export interface ParsedExtension {
  /** Extension type ID (u16). */
  type: number;
  /** Human-readable name, or `Unknown(<id>)`. */
  name: string;
  /** Byte offset of the TLV record within the account. */
  offset: number;
  /** Length of the extension's data section. */
  length: number;
  /** Whether the program accepts this extension. */
  allowed: boolean;
  /** Program error name if blocked, else null. */
  error: string | null;
}

export interface MintValidation {
  /** True if the program would accept this mint. */
  ok: boolean;
  /** All extensions found on the mint. */
  extensions: ParsedExtension[];
  /** Extensions that would be rejected. */
  blocked: ParsedExtension[];
  /** Program error name of the first blocking extension, or null if `ok`. */
  error: string | null;
}

export interface TransferFeeConfig {
  /** Current (newer) transfer fee in basis points. */
  feeBps: number;
  /** Current (newer) maximum fee, in token base units. */
  maxFee: bigint;
}

export declare function parseMintExtensions(
  mintData: Uint8Array | Buffer | number[] | { data: any }
): ParsedExtension[];

export declare function validateMintForMarket(
  mintData: Uint8Array | Buffer | number[] | { data: any }
): MintValidation;

export declare function getTransferFeeConfig(
  mintData: Uint8Array | Buffer | number[] | { data: any }
): TransferFeeConfig | null;

export declare function hasMintExtension(
  mintData: Uint8Array | Buffer | number[] | { data: any },
  extensionType: number
): boolean;
