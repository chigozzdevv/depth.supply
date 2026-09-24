# Depth contracts

The Solana program and Arcium computations live in this Anchor workspace.
The [protocol specification](../depth.md) defines the trading and market
requirements.

## Structure

| Directory | Purpose |
| --- | --- |
| `programs/depth/` | Solana instructions and account state |
| `encrypted-ixs/` | Arcium computations |
| `tests/` | Integration tests |

## Development

Install Arcium CLI 0.13.2, Anchor CLI 1.0.2, Solana CLI 3.1.10, Rust 1.89.0,
Docker, and pnpm. Follow [Arcium's installation guide](https://docs.arcium.com/developers/installation)
for the Arcium dependencies. Run commands from this directory:

```sh
pnpm install --frozen-lockfile
mkdir -p target
test -f target/test-wallet.json || solana-keygen new --no-bip39-passphrase --silent --outfile target/test-wallet.json
avm use 1.0.2
arcium build
pnpm run typecheck
pnpm test
```
