# Puzzle Token Vesting

The admin funds a unique grant from its Soroban token balance. Linear grants
vest over `[start_at, end_at]` after the configured cliff; cliff grants release
the full amount at `end_at` (which must equal `cliff_at`). Recipients claim
vested tokens. Admin cancellation freezes accrued vesting, refunds the
unvested balance to the admin, and sends a 10% penalty to the configured
treasury.

Run tests with:

```sh
cargo test --manifest-path stellar-extensions/onchain/puzzle_token_vesting/Cargo.toml
```
