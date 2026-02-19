/**
 * @module serialization
 * Minimal Borsh-compatible binary serialization / deserialization helpers.
 * No external dependencies — works with plain Buffers.
 */

// ═══════════════════════════════════════════════════════════════════════
// WRITER
// ═══════════════════════════════════════════════════════════════════════

export class BorshWriter {
  /** @param {number} [initialCapacity=256] */
  constructor(initialCapacity = 256) {
    /** @type {Buffer} */ this.buf = Buffer.alloc(initialCapacity);
    /** @type {number} */ this.offset = 0;
  }

  /** @private Ensure capacity */
  _grow(needed) {
    while (this.offset + needed > this.buf.length) {
      const next = Buffer.alloc(this.buf.length * 2);
      this.buf.copy(next);
      this.buf = next;
    }
  }

  /** @returns {Buffer} Trimmed buffer */
  toBuffer() {
    return this.buf.subarray(0, this.offset);
  }

  // ── primitives ─────────────────────────────────────────────────────

  /** @param {number} v */ writeU8(v) {
    this._grow(1);
    this.buf.writeUInt8(v, this.offset);
    this.offset += 1;
    return this;
  }

  /** @param {number} v */ writeU16(v) {
    this._grow(2);
    this.buf.writeUInt16LE(v, this.offset);
    this.offset += 2;
    return this;
  }

  /** @param {number} v */ writeU32(v) {
    this._grow(4);
    this.buf.writeUInt32LE(v, this.offset);
    this.offset += 4;
    return this;
  }

  /** @param {bigint|number} v */ writeU64(v) {
    this._grow(8);
    this.buf.writeBigUInt64LE(BigInt(v), this.offset);
    this.offset += 8;
    return this;
  }

  /** @param {bigint|number} v */ writeI64(v) {
    this._grow(8);
    this.buf.writeBigInt64LE(BigInt(v), this.offset);
    this.offset += 8;
    return this;
  }

  /** @param {boolean} v */ writeBool(v) {
    return this.writeU8(v ? 1 : 0);
  }

  // ── compound ───────────────────────────────────────────────────────

  /** Borsh string: u32 len prefix + utf-8 bytes */
  /** @param {string} s */ writeString(s) {
    const bytes = Buffer.from(s, "utf-8");
    this.writeU32(bytes.length);
    this._grow(bytes.length);
    bytes.copy(this.buf, this.offset);
    this.offset += bytes.length;
    return this;
  }

  /** Write raw bytes without length prefix */
  /** @param {Buffer|Uint8Array} data */ writeFixedBytes(data) {
    this._grow(data.length);
    Buffer.from(data).copy(this.buf, this.offset);
    this.offset += data.length;
    return this;
  }

  /** Borsh Vec<T> */
  /** @param {any[]} arr @param {(writer: BorshWriter, item: any)=>void} writeFn */
  writeVec(arr, writeFn) {
    this.writeU32(arr.length);
    for (const item of arr) writeFn(this, item);
    return this;
  }

  /** Borsh Option<T>: 0x00 | 0x01 + T */
  /** @param {any} val @param {(writer: BorshWriter, v: any)=>void} writeFn */
  writeOption(val, writeFn) {
    if (val === null || val === undefined) {
      this.writeU8(0);
    } else {
      this.writeU8(1);
      writeFn(this, val);
    }
    return this;
  }

  /** Write a 32-byte public key (raw bytes) */
  /** @param {import("@solana/web3.js").PublicKey} pk */ writePubkey(pk) {
    return this.writeFixedBytes(pk.toBuffer());
  }
}

// ═══════════════════════════════════════════════════════════════════════
// READER
// ═══════════════════════════════════════════════════════════════════════

export class BorshReader {
  /** @param {Buffer|Uint8Array} data */
  constructor(data) {
    /** @type {Buffer} */ this.buf = Buffer.from(data);
    /** @type {number} */ this.offset = 0;
  }

  /** @private */
  _check(n) {
    if (this.offset + n > this.buf.length) {
      throw new RangeError(
        `BorshReader: read past end (need ${n} at offset ${this.offset}, buf length ${this.buf.length})`
      );
    }
  }

  // ── primitives ─────────────────────────────────────────────────────

  /** @returns {number} */ readU8() {
    this._check(1);
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  /** @returns {number} */ readU16() {
    this._check(2);
    const v = this.buf.readUInt16LE(this.offset);
    this.offset += 2;
    return v;
  }

  /** @returns {number} */ readU32() {
    this._check(4);
    const v = this.buf.readUInt32LE(this.offset);
    this.offset += 4;
    return v;
  }

  /** @returns {bigint} */ readU64() {
    this._check(8);
    const v = this.buf.readBigUInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  /** @returns {bigint} */ readI64() {
    this._check(8);
    const v = this.buf.readBigInt64LE(this.offset);
    this.offset += 8;
    return v;
  }

  /** @returns {boolean} */ readBool() {
    return this.readU8() !== 0;
  }

  // ── compound ───────────────────────────────────────────────────────

  /** @returns {string} */ readString() {
    const len = this.readU32();
    this._check(len);
    const s = this.buf.toString("utf-8", this.offset, this.offset + len);
    this.offset += len;
    return s;
  }

  /** @param {number} len @returns {Buffer} */ readFixedBytes(len) {
    this._check(len);
    const slice = this.buf.subarray(this.offset, this.offset + len);
    this.offset += len;
    return Buffer.from(slice);
  }

  /**
   * @template T
   * @param {(reader: BorshReader) => T} readFn
   * @returns {T[]}
   */
  readVec(readFn) {
    const len = this.readU32();
    const arr = [];
    for (let i = 0; i < len; i++) arr.push(readFn(this));
    return arr;
  }

  /**
   * @template T
   * @param {(reader: BorshReader) => T} readFn
   * @returns {T|null}
   */
  readOption(readFn) {
    const tag = this.readU8();
    return tag === 0 ? null : readFn(this);
  }

  /** @returns {import("@solana/web3.js").PublicKey} */
  readPubkey() {
    return new PublicKey(this.readFixedBytes(32));
  }

  /** Skip `n` bytes */
  /** @param {number} n */ skip(n) {
    this._check(n);
    this.offset += n;
  }
}

import { PublicKey } from "@solana/web3.js";
