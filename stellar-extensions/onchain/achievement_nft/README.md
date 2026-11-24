# Achievement NFT

This Soroban contract mints one transferable achievement NFT per account and
achievement type. An administrator registers the authorized minter (typically
the game contract). Each NFT stores its name, tier, ledger timestamp, and IPFS
image hash on-chain. `get_by_achievement_type` uses offset-based pagination
(limits 1–100).

Run tests with:

```sh
cargo test --manifest-path stellar-extensions/onchain/achievement_nft/Cargo.toml
```
