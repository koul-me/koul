# Koul

Koul is a rule engine on Soroban that runs a user's strategy from their own passkey smart account. A person writes
"if this, then that" rules for their money; an on-chain router stores and evaluates them, and executes the action from
the user's smart account under a session key that a policy contract confines. The user keeps custody, and an off-chain
keeper only submits ticks. Koul is live on Stellar testnet at https://app.koul.me, and the code is at
https://github.com/koul-me/koul (MIT).

## Pages

- [Architecture](architecture.md): how Koul works today, component by component, and the planned path to mainnet.
- [On-chain build log](build-log.md): every on-chain change, with its transaction hash.
- [Run guide](README-build-guide.md): what has been built so far and how to run it.

The public status page, https://koul.me/status, shows whether the keeper is running.
