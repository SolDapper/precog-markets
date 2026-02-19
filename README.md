# precog-markets

A complete, zero-dependency JavaScript SDK (ESM) for interacting with the Solana **Precog Markets** program — a trustless pari-mutuel market supporting native SOL, SPL Token, and Token-2022 denominations with on-chain multi-sig governance.

> **No Anchor required.** This SDK uses raw `@solana/web3.js` `TransactionInstruction` objects with hand-rolled Borsh serialization.

## Features

- **14 instruction builders** covering the full program lifecycle
- **5 account decoders** (Market, UserPosition, ProtocolConfig, MultisigAuthority, MultisigProposal)
- **PDA derivation** helpers for every account type
- **High-level `PrecogMarketsClient`** with auto-PDA resolution, `sendTransaction`, and batch/gPA queries
- **Low-level `BorshWriter`/`BorshReader`** for custom serialization needs
- **Full TypeScript declarations** (`index.d.ts`)
- **ESM-only** (`"type": "module"`)
- **Peer dependency** on `@solana/web3.js ^1.87` — no other runtime deps

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
const admin = Keypair.generate();

// 1. Initialize protocol (one-time)
const { protocolConfig } = await client.initializeProtocol(
  admin,
  admin.publicKey,  // treasury
  200                // 2% default fee
);

// 2. Create a SOL market
const { market } = await client.createSolMarket({
  payer: admin,
  marketId: 1n,
  title: "Will ETH flip BTC by 2026?",
  description: "Market cap flip",
  outcomeLabels: ["Yes", "No"],
  resolutionDeadline: BigInt(Math.floor(Date.now() / 1000) + 86400 * 30),
});

// 3. Place a bet
const bettor = Keypair.generate();
const { position } = await client.placeSolBet({
  bettor,
  market,
  outcomeIndex: 0,          // "Yes"
  amount: LAMPORTS_PER_SOL, // 1 SOL
});

// 4. Fetch & inspect
const mkt = await client.fetchMarket(market);
console.log(mkt.title);           // "Will ETH flip BTC by 2026?"
console.log(mkt.outcomeLabels);   // ["Yes", "No"]
console.log(mkt.outcomePools);    // [1000000000n, 0n]
console.log(mkt.statusName);      // "Open"

// 5. Implied probabilities
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
├── instructions.js     # Instruction builders (all 14 instructions)
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
| `DISCRIMINATORS` | 4-byte instruction discriminators |
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

| Decoder | Returns |
|---------|---------|
| `decodeMarket(data)` | `MarketAccount` |
| `decodeUserPosition(data)` | `UserPositionAccount` |
| `decodeProtocolConfig(data)` | `ProtocolConfigAccount` |
| `decodeMultisigAuthority(data)` | `MultisigAuthorityAccount` |
| `decodeMultisigProposal(data)` | `MultisigProposalAccount` |

### Instruction Builders (`precog-markets/instructions`)

Each builder returns a `TransactionInstruction`. Pass your own accounts — the SDK never does PDA resolution at this level.

```js
import { placeBet } from "precog-markets";

const ix = placeBet(
  { market, vault, position, bettor: bettor.publicKey },
  { outcomeIndex: 0, amount: 1_000_000_000n }
);
```

| Builder | Instruction |
|---------|-------------|
| `initializeProtocol(accounts, args)` | One-time protocol setup |
| `createMarket(accounts, args)` | Create a prediction market |
| `placeBet(accounts, args)` | Deposit SOL/tokens on an outcome |
| `resolveMarket(accounts, args)` | Single-sig resolve |
| `finalizeMarket(accounts)` | Permissionless crank after dispute window |
| `claimWinnings(accounts)` | Claim payout |
| `voidMarket(accounts)` | Void a market |
| `claimRefund(accounts)` | Refund on voided markets |
| `updateProtocolConfig(accounts, args)` | Admin config update |
| `createMultisig(accounts, args)` | Create M-of-N multisig |
| `createProposal(accounts, args)` | Propose multisig action |
| `approveProposal(accounts)` | Approve a proposal |
| `executeProposal(accounts)` | Execute approved proposal |
| `harvestWithheldTokens(accounts)` | Harvest Token-2022 transfer fees |

### High-Level Client (`precog-markets/client`)

The `PrecogMarketsClient` wraps everything with automatic PDA derivation and transaction sending:

```js
const client = new PrecogMarketsClient(connection);

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
  payer: admin,
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

## Multi-Sig Governance

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
  │                                         │
  │         ┌──────────────────────────┐    │
  └──→ Voided                          │    ▼
        │                              │  claimWinnings()
        ▼                              │
    claimRefund()                      │
                                       │
    finalizeMarket() ◄─────────────────┘
```

1. **Open** — Bets accepted until `resolutionDeadline`
2. **Resolved** — Authority (or multisig) declares winning outcome
3. **Dispute window** — 24h period for challenges
4. **Finalized** — Anyone cranks `finalizeMarket`; winners claim payouts
5. **Voided** (alternate) — Authority voids; all bettors get full refunds

## Error Handling

The SDK exports all 56 program error codes:

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
