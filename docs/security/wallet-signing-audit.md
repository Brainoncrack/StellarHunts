# Wallet Signing Flow — Security Audit (Findings)

**Issue:** UnityChainxx/StellarHunts#782 — _Audit wallet signing flow for phishing risks_
**Status:** Audit complete; the enforceable mitigations ship with this PR.
**Scope:** Everything a user (or the app on their behalf) signs or submits to Stellar / Soroban: the frontend wallet path, the backend NFT-claim handler, and the on-chain contracts that consume those transactions.

## 1. What users sign today

| Surface                                                                          | Current state                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Frontend (`frontend/`)                                                           | No code imports `@stellar/stellar-sdk` or `@stellar/freighter-api` yet. There is **no live signing path** — wallet UI is placeholder (`GetStartedCTA` handler is a stub) and the Navbar links to a `/connect-wallet` route that does not exist.        |
| Backend NFT claim (`backend/src/nft-claim/providers/stellar-handler.service.ts`) | Runs in `STELLAR_MODE=mock` by default; the "live" branch is an unimplemented TODO sketch and always throws. No real transaction is built, signed or submitted today.                                                                                  |
| On-chain contracts (`onchain/contracts/`)                                        | Minting is not user-signed: the game contract calls `mint_level_badge` cross-contract and the NFT contract authorizes via `env.invoker()` against its minter registry. Player answers are SHA-256 hashed on-chain; plaintext answers are never stored. |

## 2. Findings

### F1 — No blind-signing guardrail exists for the future frontend integration (High, fixed in this PR)

Once the frontend starts calling Freighter, the easiest way to get exploited is to hand raw XDR to `signTransaction` and let the user approve an envelope they cannot read. A lookalike dApp or a compromised dependency could swap the operation to a different contract or function and the user would "sign the NFT claim" while actually approving something hostile.

**Mitigation shipped:** `frontend/lib/stellar/signTransaction.js` refuses to sign anything that is not (a) fully decodable into a human-readable summary, (b) a contract call against an allow-listed StellarHunts contract (env: `NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID`, `NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID`), and (c) an allow-listed function name (default: `submit_answer`, `request_hint`). Every transaction must pass through `signWithConfirmation()`, which requires an explicit user confirmation callback — a missing confirmation step throws instead of silently signing.

### F2 — Summaries must be human-readable, not raw XDR (High, fixed in this PR)

**Mitigation shipped:** `frontend/lib/stellar/txSummary.js` decodes every operation and renders structured lines: fee in stroops and XLM, validity window, memo type, and per-operation "Call `function(args)` on contract `C…`". Operations that cannot be decoded are flagged `readable: false`, which blocks signing entirely. `frontend/components/wallet/TransactionConfirmDialog.jsx` renders this summary behind an explicit "I have read the summary above" checkbox before Confirm/Reject.

### F3 — `/connect-wallet` route does not exist (Medium, open)

`Navbar.jsx` links its "Connect Wallet" buttons to `/connect-wallet`, and `GetStartedCTA`'s connect handler is a `setTimeout` stub. Users cannot actually connect a wallet. When this route is implemented, it must use `requestAccess()` from `@stellar/freighter-api` and route all signing through `signWithConfirmation()` — never call Freighter's signer directly.

### F4 — Server-side custodian signing must never reach the client (Medium, open)

When `StellarHandlerService` implements live minting, the custodian key must stay server-side (`process.env`, injected secret), and the minting transaction should apply the same allow-list discipline (only the registered NFT contract, only `mint_level_badge`, only for users whose level completion the backend has verified). Until then, live mode fails closed (always throws), which is the correct behavior.

### F5 — On-chain surfaces already scoped reasonably (Informational)

- **Answer privacy:** `submit_answer` compares SHA-256 hashes; plaintext answers never hit the chain.
- **Role-gated minting:** `mint_level_badge` verifies `env.invoker()` is in the NFT contract's minter registry (default minter = the game contract), preventing arbitrary users from minting badges.
- **Duplicate prevention:** badge storage is keyed per `(Address, Levels)` so a level badge cannot be minted twice.

### F6 — Env-sourced allowlists need CI parity (Low, open)

The frontend allowlists come from `NEXT_PUBLIC_*` env vars. They are public by design (contract IDs and function names are on-chain facts), but a misconfigured deployment with an empty allowlist should fail closed — `assertInScope` throws when the contract is not in the set, which is the intended behavior. Deployment checklists should verify the variables are set (see README Configuration).

### F7 — Argument-level validation is not covered by function allow-listing (Medium, open — recommended)

The F1 allow-list constrains _which_ contract and function can be called, but not _what arguments_ are passed. A hostile or buggy caller could still pass an unexpected value to an allow-listed function (for example a different player address, a wrong level, or an unexpected hint index). Recommended: give each allow-listed function a small argument schema (expected count, types, and ranges) checked in `assertInScope`, and require that any `Address` argument equal the connected account unless the function is explicitly documented as acting on another address. Arguments that fail the schema should block signing the same way `readable: false` does.

### F8 — Network and source-account binding should be verified before signing (Medium, open — recommended)

A transaction built for one network (e.g. testnet) must not be signed while the app believes it is on another (e.g. mainnet), and the transaction's source account must be the account the user connected. Recommended checks before the confirmation dialog opens:

- The network passphrase embedded in the signing request matches the app's configured network (`NEXT_PUBLIC_STELLAR_NETWORK` or equivalent), and the dialog displays the network name prominently.
- The transaction source account (and any per-operation source override) equals the connected public key. Per-operation source overrides should be refused unless explicitly expected.
- A mismatch fails closed with a clear message rather than asking the user to decide.

### F9 — Fee, validity window and Soroban resource limits (Medium, open — recommended)

The summary already shows fee and validity window (F2) but nothing enforces sane bounds. A manipulated transaction could carry an inflated fee or resource budget, or a validity window long enough to be held and submitted later. Recommended:

- A configurable maximum total fee (stroops) above which signing is refused.
- A maximum validity window (for example, a few minutes from build time) and a requirement that a time bound is present at all.
- For Soroban transactions, a check that the simulated resource fee is in an expected range, with the simulation result shown in the summary.

### F10 — Authorization entries must be reviewed, not just the invocation (Medium, open — recommended)

Soroban transactions carry authorization entries that determine what the signer is actually consenting to, including sub-invocations made by the called contract. A top-level call to an allow-listed function can still authorize a nested call to something else. Recommended: decode the full authorization tree and (a) refuse any entry that references a contract outside the allow-list, and (b) render sub-invocations in the confirmation summary. Anything that cannot be fully decoded is treated as `readable: false`.

### F11 — Wallet connection hygiene and origin trust (Low, open — recommended)

Phishing risk is not limited to what is signed; it also includes _where_ the user is signing from. Recommended for the `/connect-wallet` implementation (F3):

- Do not auto-prompt for wallet access on page load; only on an explicit user click.
- Surface the connected address (truncated, with a copy/verify affordance) and the active network in the app chrome at all times.
- Provide a clear "Disconnect" action and clear any cached account state on disconnect or when the wallet reports an account/network change.
- Document the canonical production domain in the README and user-facing help so users can verify they are on the real site.

### F12 — Frontend supply-chain and page-integrity controls (Medium, open — recommended)

F1 names a compromised dependency as a threat; the signing helpers only help if the code that implements them is not tampered with. Recommended:

- Commit the lockfile, install with a frozen lockfile in CI, and enable dependency vulnerability alerts for the frontend.
- Pin `@stellar/stellar-sdk` and `@stellar/freighter-api` to reviewed versions and review upgrades individually.
- Ship a restrictive Content-Security-Policy (no inline script where avoidable, `connect-src` limited to the Stellar RPC/Horizon endpoints in use, `frame-ancestors 'none'` to prevent clickjacking of the confirmation dialog).
- Avoid third-party scripts on any page that can open the confirmation dialog.

### F13 — Backend claim endpoint must not become a signing oracle (Medium, open — recommended)

When live minting is implemented (F4), the claim endpoint effectively lets an unauthenticated or weakly authenticated caller ask the server to sign with the custodian key. Recommended:

- Authenticate the claim request and bind it to the player address whose level completion was verified; ignore any recipient address supplied separately by the client.
- Make claims idempotent per `(Address, Level)` on the server too, so retries cannot cause duplicate submission attempts or inconsistent state (the contract already rejects duplicates per F5).
- Apply rate limiting per account and per IP to the claim route.
- Log claim attempts (account, level, outcome, transaction hash) without logging secrets or raw signed envelopes.

### F14 — Custodian key lifecycle (Low, open — recommended)

Beyond keeping the key off the client (F4): use a dedicated account with only the minimum XLM balance needed for fees, never reuse it for other purposes, document a rotation procedure (including updating the minter registry in the NFT contract), and keep the key in the deployment platform's secret store rather than in repo-tracked env files. Verify `.gitignore` excludes `.env*` files and that CI secret scanning is enabled.

## 3. Signing policy (summary)

1. Build transactions with `buildContractCall()` — no hand-rolled XDR.
2. Summarize with `summarizeTransaction()` — if not readable, stop.
3. Enforce scope with `assertInScope()` — allow-listed contracts and functions only.
4. Confirm with the user via `TransactionConfirmDialog` — explicit, reviewed, cancellable.
5. Sign with Freighter only after all four steps pass.

Anything else is refused by design. There is no code path in this repository that signs an unsummarized or out-of-scope transaction.

**Proposed additions to the policy (pending F7–F10):** between steps 3 and 4, also verify network and source-account binding (F8), argument schema (F7), fee/validity bounds (F9) and the decoded authorization tree (F10). Any failure blocks signing; none of these checks should be user-overridable.

## 4. Threat model (summary)

| Threat                             | Example                                                                        | Primary control                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Lookalike dApp                     | A cloned site prompts the user to sign a "claim" that calls a hostile contract | Allow-listed contracts/functions (F1), readable summary (F2), origin hygiene (F11) |
| Compromised dependency or script   | Injected code swaps the operation before it reaches the wallet                 | Supply-chain controls and CSP (F12), allow-list enforced at signing time (F1)      |
| Argument tampering                 | Allow-listed function called with unexpected values                            | Argument schemas (F7)                                                              |
| Hidden consent via sub-invocations | Authorization entry covers a nested call to another contract                   | Authorization-tree review (F10)                                                    |
| Wrong network / wrong account      | Testnet transaction signed as mainnet, or signed by an unintended account      | Network and source binding (F8)                                                    |
| Fee or time-window abuse           | Inflated fee, or a signed transaction held and replayed later                  | Fee cap and validity bounds (F9)                                                   |
| Server abused as signing oracle    | Attacker triggers custodian-signed mints for arbitrary addresses               | Authenticated, verified, idempotent claims (F13); key hygiene (F14)                |
| Blind approval by the user         | User clicks through without reading                                            | Explicit acknowledgement checkbox (F2); keep summaries short and specific          |

**Out of scope:** compromise of the user's device or the Freighter extension itself, and social engineering that occurs entirely outside the app.

## 5. Follow-ups

- [ ] Implement `/connect-wallet` using `requestAccess()` + the signing helper (F3)
- [ ] Implement live `StellarHandlerService` with server-side custodian key and allow-listed mint calls (F4)
- [ ] Add a frontend test that feeds a hostile transaction (unknown contract / unknown function / undecodable op) to `assertInScope` and asserts it throws
- [ ] Extend the allowlist via env when new game functions are introduced, with a note in the changelog
- [ ] Add per-function argument schemas and tests for out-of-range and wrong-address arguments (F7)
- [ ] Add network-passphrase and source-account checks with tests for mismatches (F8)
- [ ] Add configurable fee cap and validity-window limits (F9)
- [ ] Decode and review Soroban authorization entries, including sub-invocations (F10)
- [ ] Add CSP headers and enable lockfile-frozen installs and dependency alerts in CI (F12)
- [ ] Add authentication, idempotency and rate limiting to the claim endpoint design (F13)
- [ ] Write a custodian key rotation runbook and enable secret scanning (F14)

## 6. Deployment checklist

Before any production deployment that enables wallet signing:

- [ ] `NEXT_PUBLIC_STELLAR_HUNTS_CONTRACT_ID` and `NEXT_PUBLIC_STELLAR_HUNTS_NFT_CONTRACT_ID` are set and match the deployed contract IDs for the target network (F6)
- [ ] The function allow-list matches the functions the current frontend actually calls
- [ ] The configured network (testnet vs. mainnet) matches the contract IDs in use (F8)
- [ ] `STELLAR_MODE` is set intentionally; live mode is only enabled once F4/F13 are implemented
- [ ] Custodian key is stored in the platform secret manager and is not present in the repo or client bundle (F4, F14)
- [ ] CSP and other security headers are active on the deployed frontend (F12)
- [ ] The canonical production domain is documented for users (F11)

## 7. Residual risk

Even with all of the above, a user can still knowingly approve a legitimate allow-listed call they did not intend (for example, requesting a hint they did not mean to spend on). The confirmation dialog is the final control, so it should present _what the call does in game terms_ alongside the technical summary. Re-audit this flow whenever a new contract function is added to the allow-list, when the wallet integration is first implemented (F3), and when live minting is enabled (F4).
