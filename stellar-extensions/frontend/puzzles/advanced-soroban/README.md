# Advanced Soroban Architecture Puzzle Set

This directory contains ten **hard** puzzles that test advanced Soroban
architecture: contract composition, upgradeability, cross-contract calls and
authentication, storage versioning and migration, and reentrancy protection.

The set follows `schemas/puzzle-template.schema.json` for every shared field.
The shared schema does not define `testCases`, so this directory ships
[`puzzle-template.schema.json`](./puzzle-template.schema.json), which extends
the shared template with a required `testCases` collection of 3–5 entries. The
shared schema itself is not modified.

## Puzzle index

| # | File | Topic | Correct answer |
| - | ---- | ----- | -------------- |
| 1 | `adv-cross-contract-auth.json` | Cross-contract auth | `player.require_auth()` |
| 2 | `adv-auth-invocation-tree.json` | Auth invocation trees | Subtree entry must cover the nested call |
| 3 | `adv-upgrade-upgrader-auth.json` | Upgrade access control | `upgrader.require_auth()` |
| 4 | `adv-upgrade-wasm-replace.json` | Upgrade mechanics | `update_current_contract_wasm` |
| 5 | `adv-storage-schema-version.json` | Storage versioning | `SchemaVersion` |
| 6 | `adv-storage-migration-order.json` | Key migration | Copy, verify, then delete |
| 7 | `adv-storage-ttl-extension.json` | Persistent TTLs | `extend_ttl` |
| 8 | `adv-reentrancy-lock-order.json` | Reentrancy guard | Check, set, effect, call, clear |
| 9 | `adv-composition-token-client.json` | Contract composition | `Client::new(&env, &token_id)` |
| 10 | `adv-factory-salt-deploy.json` | Factory deployment | `with_current_contract(salt).deploy(...)` |

## Why these answers

### 1. Authorize the token transfer

A generated client call is a cross-contract invocation; it does not carry the
player's authority. The contract that debits the player must call
`player.require_auth()` before invoking the token contract. Authorizing the
token contract, the treasury, or `env.invoker()` cannot stand in for the
player's authorization entry. Get this wrong and any caller can move another
player's funds.

### 2. Who authorizes a nested call?

Soroban evaluates `require_auth` against the invocation tree of the whole
transaction. A signature on the root invocation is only reusable when the
required address authorized an entry whose subtree contains the invocation
being checked. Nested `require_auth` is never skipped, and contract addresses
do not inherit a player's signature. This is why integrators that add a
contract hop must extend the authorization entries, not just re-sign the root.

### 3. Lock the upgrade door

Reading the upgrader address proves only who *may* upgrade. The entrypoint must
call `require_auth` on that stored address before replacing the WASM. Using an
admin address that is not the designated upgrader, a caller-supplied value, or
the invoker bypasses role separation. The check belongs before the WASM update
so no unauthenticated caller can ever reach the code swap.

### 4. Swap the code, keep the state

`update_current_contract_wasm` replaces the code of the contract currently
executing, preserving its address and storage. `deploy` creates a new contract
at a new address, `install` only uploads bytecode, and there is no
`update_current_contract`. Emit an upgrade event after the swap so indexers and
the rollback runbook can follow the deployed hash.

### 5. Detect legacy storage

Each contract stores its schema version in instance storage under a dedicated
key and exposes it through `get_schema_version`. A missing key means the
deployment predates versioning, so readers default to 0 instead of panicking.
`Admin`, `QuestionCount`, and `QuestionPerLevel` are unrelated keys; reusing one
of them for versioning would make its meaning ambiguous forever.

### 6. Migrate without losing rows

A renamed `DataKey` variant is a new key: the variant name is part of the
serialized key. Migrate by reading each row from the old key, writing it under
the new key, verifying the copy, and only then removing the old key. Deleting
first leaves a window where a failure loses rows; overwriting in place breaks
readers that still expect the old shape. Keep both keys with a read fallback if
the migration must be lazy.

### 7. Keep player records alive

Persistent entries own their TTL. `extend_ttl(key, threshold, extend_to)` renews
an entry only when its remaining TTL is below the threshold, extending it to
the target. Instance storage uses the two-argument form without a key. There is
no `bump` or `set_ttl` storage method. Without renewal, a dormant player's
progress can expire and be lost.

### 8. Guard the external call

Soroban does not make external calls reentrancy-safe. Check that the lock is
clear, set it, apply the balance change (checks-effects-interactions), call the
token contract, and clear the lock on both success and failure. Checking after
the call is too late, and `require_auth` proves who called, not whether the call
is re-entering.

### 9. Compose through a client

Contracts compose through generated clients instead of calling one another's
Rust functions. `#[contractclient]` modules expose `Client::new(&env,
&contract_address)`, and every method on that client becomes a host-mediated
cross-contract call. Constructing the client without the environment or with
the player's address as the target produces code that cannot read or mutate the
other contract's state.

### 10. Deploy a child contract deterministically

`env.deployer()` must be scoped before deploying. `with_current_contract(salt)`
makes the current contract the deployer and derives the child address from that
address plus the salt, so off-chain services can predict the address.
`with_address` is not a deployer scope and the unscoped form is not tied to the
factory. `update_current_contract_wasm` upgrades the running contract rather
than creating a child.

## Test case format

Each puzzle carries 3–5 `testCases` entries:

```json
{
  "title": "Player authorization requested",
  "description": "The address whose funds move must authorize the invocation.",
  "validationMode": "exact_match",
  "input": { "answer": "player.require_auth()" },
  "expectedOutput": { "correct": true }
}
```

`input` describes a submission (`answer` for text/code puzzles,
`selectedIndex` for multiple choice) and `expectedOutput` describes the
expected grading result. The accepted `validationMode` values are
`exact_match`, `numeric_tolerance`, `regex`, and `custom`.

## Validating

From the repository root:

```bash
node stellar-extensions/scripts/validate-puzzle-content.js \
  --dir stellar-extensions/frontend/puzzles/advanced-soroban \
  --schema stellar-extensions/frontend/puzzles/advanced-soroban/puzzle-template.schema.json
```

The validator checks the shared schema requirements, difficulty values,
duplicate puzzle ids across files, and test case structure, and reports each
issue with its file and line number. It exits with status 1 when any issue is
found.
