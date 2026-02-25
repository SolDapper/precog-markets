# precog-markets

A complete, zero-dependency JavaScript SDK (ESM) for interacting with the Solana **Precog Markets** program — a trustless pari-mutuel prediction market supporting native SOL, SPL Token, and Token-2022 denominations with on-chain multi-sig governance.

> **No Anchor required.** This SDK uses raw `@solana/web3.js` `TransactionInstruction` objects with hand-rolled Borsh serialization.

## Features

- **15 instruction builders** covering the full program lifecycle
- **5 account decoders** (Market, UserPosition, ProtocolConfig, MultisigAuthority, MultisigProposal)
- **PDA derivation** helpers for every account type
- **High-level `PrecogMarketsClient`** with auto-PDA resolution, `sendTransaction`, and batch/gPA queries
- **Discriminator-filtered RPC queries** — all `getProgramAccounts` calls use 8-byte account discriminator `memcmp` filters for efficient fetching
- **Low-level `BorshWriter`/`BorshReader`** for custom serialization needs
- **Full TypeScript declarations** (`index.d.ts`)
- **ESM-only** (`"type": "module"`)
- **Peer dependency** on `@solana/web3.js ^1.87` — no other runtime deps

> **⚠️ Multisig governance is untested.** The multisig instructions (`createMultisig`, `createProposal`, `approveProposal`, `executeProposal`) and their associated account decoders are included in the SDK but have **not been tested** against the on-chain program. The code is derived from the Rust program source and is believed to be structurally correct, but may contain bugs in serialization, account ordering, or argument encoding. Do not use in production without thorough testing. Contributions and test reports are welcome.

## Installation

```bash
npm install precog-markets @solana/web3.js
```

## Quick Start

```js
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { PrecogMarketsClient } from "precog-markets";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");
const client = new PrecogMarketsClient(connection);

// 1. Create a SOL market
const { market } = await client.createSolMarket({
  payer: creator,
  marketId: 1n,
  title: "Will $PELF hit 10m MC by Jun?",
  description: "Market cap milestone",
  outcomeLabels: ["Yes", "No"],
  resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
});

// 2. Place a bet
const bettor = Keypair.generate();
const { position } = await client.placeSolBet({
  bettor,
  market,
  outcomeIndex: 0,          // "Yes"
  amount: LAMPORTS_PER_SOL, // 1 SOL
});

// 3. Fetch & inspect
const mkt = await client.fetchMarket(market);
console.log(mkt.title);           // "Will $PELF hit 10m MC by Jun?"
console.log(mkt.outcomeLabels);   // ["Yes", "No"]
console.log(mkt.outcomePools);    // [1000000000n, 0n]
console.log(mkt.statusName);      // "Open"

// 4. Implied probabilities
const probs = PrecogMarketsClient.getImpliedProbabilities(
  mkt.outcomePools, mkt.totalPool
);
console.log(probs); // [1, 0]
```

## Architecture

```
src/
├── index.js            # Barrel re-exports
├── index.d.ts          # TypeScript declarations
├── constants.js        # Program ID, seeds, discriminators, enums, errors
├── pda.js              # PDA derivation for all account types
├── serialization.js    # BorshWriter / BorshReader
├── accounts.js         # Account decoders (Market, UserPosition, etc.)
├── instructions.js     # Instruction builders (all 15 instructions)
└── client.js           # High-level PrecogMarketsClient
```

## Module Structure

### Constants (`precog-markets/constants`)

| Export | Description |
|--------|-------------|
| `PROGRAM_ID` | On-chain program address |
| `MarketStatus` | `{ Open: 0, Resolved: 1, Finalized: 2, Voided: 3 }` |
| `TokenDenomination` | `{ NativeSol: 0, SplToken: 1, Token2022: 2 }` |
| `ProposalActionTag` | Enum tags for multisig proposal actions |
| `ErrorCode` / `ErrorName` | Bidirectional error code ↔ name maps |
| `SEEDS` | PDA seed buffers |
| `DISCRIMINATORS` | Single-byte (`u8`) instruction discriminators |
| `ACCOUNT_DISCRIMINATORS` | 8-byte account magic headers for `memcmp` filtering |
| `MAX_OUTCOMES`, `MAX_FEE_BPS`, etc. | Protocol limits |

### PDA Derivation (`precog-markets/pda`)

Every PDA the program uses has a corresponding `find*Address()` function:

```js
import { findMarketAddress, findPositionAddress } from "precog-markets";

const [marketPda, bump] = await findMarketAddress(authority, marketId);
const [positionPda]      = await findPositionAddress(market, owner, outcomeIndex);
```

| Function | Seeds |
|----------|-------|
| `findProtocolConfigAddress()` | `["protocol_config"]` |
| `findMarketAddress(authority, marketId)` | `["market", authority, marketId_le]` |
| `findVaultAddress(market)` | `["vault", market]` |
| `findVaultAuthorityAddress(market)` | `["vault_authority", market]` |
| `findPositionAddress(market, owner, index)` | `["position", market, owner, index]` |
| `findMultisigAddress(creator, nonce)` | `["multisig", creator, nonce_le]` |
| `findProposalAddress(multisig, proposalId)` | `["proposal", multisig, proposalId_le]` |

### Account Decoders (`precog-markets/accounts`)

```js
import { decodeMarket } from "precog-markets";

const accountInfo = await connection.getAccountInfo(marketAddress);
const market = decodeMarket(accountInfo.data);
```

| Decoder | Returns | Status |
|---------|---------|--------|
| `decodeMarket(data)` | `MarketAccount` | Tested |
| `decodeUserPosition(data)` | `UserPositionAccount` | Tested |
| `decodeProtocolConfig(data)` | `ProtocolConfigAccount` | Tested |
| `decodeMultisigAuthority(data)` | `MultisigAuthorityAccount` | ⚠️ Untested |
| `decodeMultisigProposal(data)` | `MultisigProposalAccount` | ⚠️ Untested |

#### Market Account Fields

The Market account includes Token-2022 transfer fee metadata and creator fee split fields:

| Field | Type | Description |
|-------|------|-------------|
| `hasTransferFee` | `boolean` | Whether the token mint has a transfer fee extension |
| `transferFeeBps` | `number` | Transfer fee in basis points (Token-2022 only) |
| `maxTransferFee` | `bigint` | Maximum transfer fee in token base units |
| `creator` | `PublicKey` | Wallet that created this market; receives `creatorFeeBps` of each winning claim |
| `creatorFeeBps` | `number` | `feeBps - defaultFeeBps`; zero if no override was set |

#### Fee Model

Total fee = `market.feeBps`. On each winning claim:
- **Protocol** receives `protocolConfig.defaultFeeBps` worth → sent to `protocolConfig.treasury`
- **Creator** receives `market.creatorFeeBps` worth → sent to `market.creator`

When creating a market, if `feeBpsOverride` is set it must be ≥ the protocol `defaultFeeBps`. The excess becomes the creator's cut.

### Instruction Builders (`precog-markets/instructions`)

Each builder returns a `TransactionInstruction`. Pass your own accounts — the SDK never does PDA resolution at this level.

> **Note:** Instruction data uses a single `u8` byte discriminator (NOT a 4-byte or 8-byte Anchor discriminator).

```js
import { placeBet, findProtocolConfigAddress } from "precog-markets";

const [protocolConfig] = findProtocolConfigAddress();
const ix = placeBet(
  { market, vault, position, bettor: bettor.publicKey, protocolConfig },
  { outcomeIndex: 0, amount: 1_000_000_000n }
);
```

| Builder | Instruction | Status |
|---------|-------------|--------|
| `initializeProtocol(accounts, args)` | One-time protocol setup | Tested |
| `createMarket(accounts, args)` | Create a prediction market | Tested |
| `placeBet(accounts, args)` | Deposit SOL/tokens on an outcome | Tested |
| `resolveMarket(accounts, args)` | Single-sig resolve | Tested |
| `disputeResolve(accounts, args)` | Re-resolve during dispute window | Tested |
| `finalizeMarket(accounts)` | Permissionless crank after dispute window | Tested |
| `claimWinnings(accounts)` | Claim payout (fees split to treasury + creator) | Tested |
| `voidMarket(accounts)` | Void a market | Tested |
| `claimRefund(accounts)` | Refund on voided markets | Tested |
| `updateProtocolConfig(accounts, args)` | Admin config update | Tested |
| `harvestWithheldTokens(accounts)` | Harvest Token-2022 transfer fees | Tested |
| `createMultisig(accounts, args)` | Create M-of-N multisig | ⚠️ Untested |
| `createProposal(accounts, args)` | Propose multisig action | ⚠️ Untested |
| `approveProposal(accounts)` | Approve a proposal | ⚠️ Untested |
| `executeProposal(accounts)` | Execute approved proposal | ⚠️ Untested |

### High-Level Client (`precog-markets/client`)

The `PrecogMarketsClient` wraps everything with automatic PDA derivation and transaction sending:

```js
// Default settings (computeUnitMargin: 1.1, priorityLevel: "Medium")
const client = new PrecogMarketsClient(connection);

// Custom settings
const client = new PrecogMarketsClient(connection, {
  programId: customProgramId,     // optional, defaults to PROGRAM_ID
  computeUnitMargin: 1.2,         // 20% headroom on CU estimates
  priorityLevel: "High",          // Helius priority fee level
});

// Backward compatible — passing a PublicKey still works
const client = new PrecogMarketsClient(connection, customProgramId);
```

Per-call overrides are also supported:

```js
// Override priority level for a single call
await client.estimatePriorityFee(instructions, feePayer, { priorityLevel: "VeryHigh" });

// Override CU margin for a single call
await client.estimateComputeUnits(instructions, feePayer, { computeUnitMargin: 1.3 });
```

```js
// Transactional (sign + send)
await client.createSolMarket({ ... });
await client.placeSolBet({ ... });
await client.resolveMarket(authority, market, 0);
await client.finalizeMarket(payer, market);
await client.claimSolWinnings({ ... });

// Fetching
const market = await client.fetchMarket(address);
const positions = await client.getPositionsByOwner(owner);
const allMarkets = await client.getAllMarkets({ authority });

// Utilities
const payout = PrecogMarketsClient.calculatePayout(amount, winPool, totalPool, feeBps);
const probs = PrecogMarketsClient.getImpliedProbabilities(pools, total);
```

## SPL Token / Token-2022 Markets

For non-SOL markets, use `createTokenMarket` and `placeTokenBet`:

```js
import { TOKEN_PROGRAM_ID, TokenDenomination } from "precog-markets";

const { market, vaultAuthority } = await client.createTokenMarket({
  payer: creator,
  marketId: 2n,
  title: "USDC market",
  description: "...",
  outcomeLabels: ["Yes", "No"],
  resolutionDeadline: deadline,
  tokenMint: usdcMint,
  tokenVault: vaultAta,                      // ATA owned by vaultAuthority PDA
  tokenProgram: TOKEN_PROGRAM_ID,
  denomination: TokenDenomination.SplToken,   // 1
});

await client.placeTokenBet({
  bettor,
  market,
  outcomeIndex: 0,
  amount: 1_000_000n,  // 1 USDC (6 decimals)
  bettorTokenAccount: bettorAta,
  tokenVault: vaultAta,
  tokenMint: usdcMint,
  tokenProgram: TOKEN_PROGRAM_ID,
});
```

## Dispute Resolution

After a market is resolved, a 24-hour dispute window begins. During this window the market authority can change the winning outcome or void the market entirely.

### Re-resolve (change outcome)

```js
import { disputeResolve } from "precog-markets";

// Low-level instruction builder
const ix = disputeResolve(
  { market: marketPubkey, authority: authorityPubkey },
  { winningOutcome: 1 }  // must differ from current winning outcome
);

// High-level client
await client.disputeResolve(authority, market, 1);
```

Calling `disputeResolve` resets `resolved_at` to the current time, restarting a full 24-hour dispute window. The new outcome must be different from the current one (`OutcomeUnchanged` error otherwise).

> **Multisig note:** `disputeResolve` is only available to non-multisig authorities. Multisig-governed markets must use a `VoidMarket` proposal followed by a new `ResolveMarket` proposal instead.

### Void during dispute

The authority can also void the market during the dispute window, refunding all positions:

```js
await client.voidMarket(authority, market);
```

## Multi-Sig Governance (⚠️ Untested)

> **⚠️ This entire section covers untested functionality.** The multisig governance instructions, PDA helpers, account decoders, and high-level client methods are included in the SDK but have not been integration-tested against the deployed on-chain program. The code is derived from the Rust program source and is believed to be structurally correct, but may contain bugs in serialization, account ordering, or argument encoding. **Do not use in production without thorough testing.**

Markets can be governed by an on-chain M-of-N multisig:

```js
// Create a 2-of-3 multisig
const { multisig } = await client.createMultisig(
  creator, 0n, 2, [signer1.publicKey, signer2.publicKey, signer3.publicKey]
);

// Create market with multisig authority
const { market } = await client.createSolMarket({
  payer: creator,
  authority: multisig,          // Use multisig PDA as authority
  authorityIsMultisig: true,
  ...
});

// Propose resolution (auto-approves for proposer)
const { proposal } = await client.createProposal({
  proposer: signer1,
  multisig,
  market,
  action: { type: "ResolveMarket", fields: { winningOutcome: 0 } },
});

// Second signer approves
await client.approveProposal(signer2, proposal, multisig);

// Anyone can execute once threshold is met
await client.executeProposal(anyPayer, proposal, multisig, market);
```

### Multisig Governance Actions

| Action | Fields |
|--------|--------|
| `ResolveMarket` | `{ winningOutcome: number }` |
| `VoidMarket` | (none) |
| `UpdateDeadline` | `{ newDeadline: bigint }` |
| `UpdateFeeBps` | `{ newFeeBps: number }` |
| `AddSigner` | `{ newSigner: PublicKey }` |
| `RemoveSigner` | `{ signer: PublicKey }` |
| `ChangeThreshold` | `{ newThreshold: number }` |

## Market Lifecycle

```
Open ──→ Resolved ──→ (24h dispute) ──→ Finalized
  │          ↑  │                           │
  │          │  │  disputeResolve()         │
  │          └──┘  (restarts window)        ▼
  │                                      claimWinnings()
  └──→ Voided
        │
        ▼
    claimRefund()
```

1. **Open** — Bets accepted until `resolutionDeadline`
2. **Resolved** — Authority (or multisig) declares winning outcome
3. **Dispute window** — 24h period; authority can call `disputeResolve()` to change the outcome (resets the 24h clock), or `voidMarket()` to cancel
4. **Finalized** — Anyone cranks `finalizeMarket`; winners claim payouts
5. **Voided** (alternate) — Authority voids; all bettors get full refunds

## Account Discriminators

Every on-chain account begins with an 8-byte magic header used for type identification:

| Account | Discriminator (hex) | ASCII |
|---------|-------------------|-------|
| Market | `4d 41 52 4b 45 54 56 32` | `MARKETV2` |
| UserPosition | `50 4f 53 49 54 4e 56 31` | `POSITNV1` |
| ProtocolConfig | `50 52 4f 54 4f 43 4f 4c` | `PROTOCOL` |
| MultisigAuthority | `4d 55 4c 54 53 49 47 31` | `MULTSIG1` |
| MultisigProposal | `50 52 4f 50 4f 53 4c 31` | `PROPOSL1` |

The SDK uses these discriminators in all `getProgramAccounts` calls via `memcmp` filters for efficient RPC queries.

## Compute Budget & Priority Fees

The SDK can estimate both compute units and priority fees for optimal transaction landing.

### Compute Unit Estimation

Simulates your transaction and returns a CU limit with a 1.1× safety margin:

```js
const { estimatedUnits, instruction: cuIx } = await client.estimateComputeUnits(
  [placeBetIx],
  bettor.publicKey
);
```

### Priority Fee Estimation (Helius)

Fetches the recommended priority fee from Helius's `getPriorityFeeEstimate` API. Requires your connection to be pointed at a Helius RPC endpoint.

```js
const { priorityFee, instruction: feeIx } = await client.estimatePriorityFee(
  [placeBetIx],
  bettor.publicKey
);
// priorityFee is in microLamports per compute unit
```

Default priority level is `"Medium"` (50th percentile). Override with:
```js
await client.estimatePriorityFee(instructions, feePayer, { priorityLevel: "High" });
```

### Combined Estimation

Get both compute unit limit and priority fee instructions in one call:

```js
const result = await client.estimateTransactionFees(
  [placeBetIx],
  bettor.publicKey
);

// result.instructions = [cuLimitIx, cuPriceIx, ...originalInstructions]
const tx = new Transaction().add(...result.instructions);
```

This runs `estimateComputeUnits` and `estimatePriorityFee` in parallel and returns everything ready to go.

### Smart Transaction Sending

For the best transaction landing rate with Helius staked connections (SWQoS), use `sendSmartTransaction` — it handles CU estimation, priority fees, signing, and optimized sending in one call:

```js
const { signature, estimatedUnits, priorityFee } = await client.sendSmartTransaction(
  [placeBetIx],
  [bettor]   // first signer = fee payer
);
```

Under the hood this:
1. Estimates compute units (simulation × 1.1)
2. Fetches priority fee from Helius ("Medium" by default)
3. Prepends `setComputeUnitLimit` + `setComputeUnitPrice` instructions
4. Signs and sends with `skipPreflight: true, maxRetries: 0`

You can also use `sendRawTransaction` directly for pre-built transactions:

```js
const sig = await client.sendRawTransaction(signedTx);
// Defaults: skipPreflight: true, maxRetries: 0
```

## Error Handling

The SDK exports all 64 program error codes:

```js
import { ErrorCode, ErrorName } from "precog-markets";

ErrorCode[6];                  // "MarketNotOpen"
ErrorName["MarketNotOpen"];    // 6
```

## Custom Program ID

Every function and the client accept an optional `programId` override:

```js
import { PrecogMarketsClient, findMarketAddress } from "precog-markets";

const customProgramId = new PublicKey("YourProgram...");
const client = new PrecogMarketsClient(connection, customProgramId);
const [market] = await findMarketAddress(authority, 1n, customProgramId);
```

## Serialization Utilities

The `BorshWriter`/`BorshReader` classes are exported for advanced use:

```js
import { BorshWriter, BorshReader } from "precog-markets";

const writer = new BorshWriter();
writer.writeU64(42n).writeString("hello").writeBool(true);
const buf = writer.toBuffer();

const reader = new BorshReader(buf);
console.log(reader.readU64());   // 42n
console.log(reader.readString()); // "hello"
console.log(reader.readBool());   // true
```

## Requirements

- Node.js ≥ 18
- `@solana/web3.js` ^1.87.0 (peer dependency)
- `@solana/spl-token` (optional peer, for creating ATAs)

## License

MIT