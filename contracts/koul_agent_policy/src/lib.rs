//! koul_agent_policy: what an agent session key may do with a user's smart account.
//!
//! Implements `stellar_accounts::policies::Policy` at OpenZeppelin/stellar-contracts @ 1e513890.
//! Attached to a `Default` context rule whose only signer is the agent's Ed25519 key, it is invoked once per
//! auth context (root invocation and every sub-invocation) and:
//!   1. rejects anything that is not a `Context::Contract`;
//!   2. requires `(contract, fn_name)` to be in `allowed_calls`;
//!   3. for `transfer`, requires `args[1]` (recipient) to be in `allowed_transfer_recipients`;
//!   4. for the XOXNO controller's `withdraw` / `supply` / `repay`, requires `args[1]` (account id) to equal the
//!      pinned `account_id`, and for `withdraw` requires `args[3]` (`to`) to be `None` or the smart account itself,
//!      so the agent can only ever move funds between the user's wallet and the user's own position;
//!   5. for the XOXNO aggregator's `execute_strategy`, requires `args[0]` (sender) to be the smart account, so a swap
//!      pays its output back to the wallet;
//!   6. only acts inside a tick: an allowlisted `tick` opens a session for this smart account and ledger, every other
//!      call needs that session, and the router closes it with `end_session` before the tick returns. The keeper
//!      therefore cannot call XOXNO, a token or the aggregator directly with the agent key; it can only ask the router,
//!      whose rules decide;
//!   7. counts enforce calls per (account, rule) in a rolling ledger window and rejects above the limit;
//!   8. emits a small event (never the whole Context, see OZ issue #852).
//!
//! Sessions rely on the order in which the smart account enforces contexts: the root invocation first, then its
//! sub-invocations depth first, as the host lists them in `__check_auth`.
#![no_std]

use soroban_sdk::{
    auth::{Context, ContractContext},
    contract, contracterror, contractevent, contractimpl, contracttype, panic_with_error, symbol_short, Address, Env,
    Symbol, TryFromVal, Val, Vec,
};
use stellar_accounts::{
    policies::Policy,
    smart_account::{ContextRule, Signer},
};

#[contracttype]
#[derive(Clone, Debug)]
pub struct KoulAgentParams {
    /// The user's XOXNO account id. Controller calls naming another account are rejected.
    pub account_id: u64,
    pub allowed_calls: Vec<(Address, Symbol)>,
    pub allowed_transfer_recipients: Vec<Address>,
    pub max_calls_per_window: u32,
    pub window_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct WindowState {
    pub window_start: u32,
    pub calls: u32,
}

/// An open tick: which router opened it, in which ledger.
#[contracttype]
#[derive(Clone, Debug)]
pub struct Session {
    pub router: Address,
    pub ledger: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum StorageKey {
    Params(Address, u32),
    Window(Address, u32),
    Session(Address),
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum KoulPolicyError {
    NotInstalled = 7100,
    NoSigners = 7101,
    NotContractContext = 7102,
    CallNotAllowed = 7103,
    TransferRecipientNotAllowed = 7104,
    Arity = 7105,
    RateLimited = 7106,
    BadParams = 7107,
    AccountNotAllowed = 7108,
    WithdrawRecipientNotAllowed = 7109,
    NoSession = 7110,
    SenderNotAllowed = 7111,
}

#[contractevent]
#[derive(Clone)]
pub struct KoulEnforced {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub contract: Address,
    pub fn_name: Symbol,
    pub calls_in_window: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct KoulInstalled {
    #[topic]
    pub smart_account: Address,
    pub context_rule_id: u32,
    pub allowed_calls: u32,
    pub max_calls_per_window: u32,
    pub window_ledgers: u32,
}

const TTL_THRESHOLD: u32 = 17280 * 7;
const TTL_EXTEND: u32 = 17280 * 30;

fn params(e: &Env, smart_account: &Address, rule_id: u32) -> KoulAgentParams {
    let key = StorageKey::Params(smart_account.clone(), rule_id);
    let p: KoulAgentParams = e.storage().persistent().get(&key).unwrap_or_else(|| panic_with_error!(e, KoulPolicyError::NotInstalled));
    e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
    p
}

/// XOXNO controller calls carry the account id as their second argument.
fn check_account(e: &Env, args: &Vec<Val>, account_id: u64) {
    let id = u64::try_from_val(e, &args.get(1).unwrap()).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
    if id != account_id {
        panic_with_error!(e, KoulPolicyError::AccountNotAllowed);
    }
}

#[contract]
pub struct KoulAgentPolicy;

#[contractimpl]
impl Policy for KoulAgentPolicy {
    type AccountParams = KoulAgentParams;

    fn enforce(e: &Env, context: Context, authenticated_signers: Vec<Signer>, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        if authenticated_signers.is_empty() {
            panic_with_error!(e, KoulPolicyError::NoSigners);
        }
        let p = params(e, &smart_account, context_rule.id);
        let (contract, fn_name, args) = match context {
            Context::Contract(ContractContext { contract, fn_name, args }) => (contract, fn_name, args),
            _ => panic_with_error!(e, KoulPolicyError::NotContractContext),
        };
        let allowed = p.allowed_calls.iter().any(|(c, f)| c == contract && f == fn_name);
        if !allowed {
            panic_with_error!(e, KoulPolicyError::CallNotAllowed);
        }
        let now = e.ledger().sequence();
        let skey = StorageKey::Session(smart_account.clone());
        if fn_name == symbol_short!("tick") {
            e.storage().temporary().set(&skey, &Session { router: contract.clone(), ledger: now });
        } else {
            let open: Option<Session> = e.storage().temporary().get(&skey);
            if !open.is_some_and(|s| s.ledger == now) {
                panic_with_error!(e, KoulPolicyError::NoSession);
            }
        }
        if fn_name == symbol_short!("transfer") {
            if args.len() != 3 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            let to = Address::try_from_val(e, &args.get(1).unwrap()).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
            if !p.allowed_transfer_recipients.iter().any(|r| r == to) {
                panic_with_error!(e, KoulPolicyError::TransferRecipientNotAllowed);
            }
        } else if fn_name == symbol_short!("withdraw") {
            if args.len() != 4 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
            let to: Val = args.get(3).unwrap();
            if !to.is_void() {
                let to = Address::try_from_val(e, &to).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
                if to != smart_account {
                    panic_with_error!(e, KoulPolicyError::WithdrawRecipientNotAllowed);
                }
            }
        } else if fn_name == symbol_short!("supply") {
            if args.len() != 4 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
        } else if fn_name == symbol_short!("repay") {
            if args.len() != 3 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            check_account(e, &args, p.account_id);
        } else if fn_name == Symbol::new(e, "execute_strategy") {
            if args.len() != 3 {
                panic_with_error!(e, KoulPolicyError::Arity);
            }
            let sender = Address::try_from_val(e, &args.get(0).unwrap()).unwrap_or_else(|_| panic_with_error!(e, KoulPolicyError::Arity));
            if sender != smart_account {
                panic_with_error!(e, KoulPolicyError::SenderNotAllowed);
            }
        }
        let wkey = StorageKey::Window(smart_account.clone(), context_rule.id);
        let mut w: WindowState = e.storage().persistent().get(&wkey).unwrap_or(WindowState { window_start: now, calls: 0 });
        if now.saturating_sub(w.window_start) >= p.window_ledgers {
            w = WindowState { window_start: now, calls: 0 };
        }
        w.calls += 1;
        if w.calls > p.max_calls_per_window {
            panic_with_error!(e, KoulPolicyError::RateLimited);
        }
        e.storage().persistent().set(&wkey, &w);
        e.storage().persistent().extend_ttl(&wkey, TTL_THRESHOLD, TTL_EXTEND);
        KoulEnforced { smart_account, context_rule_id: context_rule.id, contract, fn_name, calls_in_window: w.calls }.publish(e);
    }

    fn install(e: &Env, install_params: KoulAgentParams, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        if install_params.account_id == 0 || install_params.allowed_calls.is_empty() || install_params.max_calls_per_window == 0 || install_params.window_ledgers == 0 {
            panic_with_error!(e, KoulPolicyError::BadParams);
        }
        let key = StorageKey::Params(smart_account.clone(), context_rule.id);
        e.storage().persistent().set(&key, &install_params);
        e.storage().persistent().extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND);
        KoulInstalled {
            smart_account,
            context_rule_id: context_rule.id,
            allowed_calls: install_params.allowed_calls.len(),
            max_calls_per_window: install_params.max_calls_per_window,
            window_ledgers: install_params.window_ledgers,
        }
        .publish(e);
    }

    fn uninstall(e: &Env, context_rule: ContextRule, smart_account: Address) {
        smart_account.require_auth();
        e.storage().persistent().remove(&StorageKey::Params(smart_account.clone(), context_rule.id));
        e.storage().persistent().remove(&StorageKey::Window(smart_account, context_rule.id));
    }
}

#[contractimpl]
impl KoulAgentPolicy {
    /// Close the smart account's session. Only the router that opened it can, and it does so at the end of every tick.
    /// Without an open session there is nothing to close.
    pub fn end_session(e: Env, smart_account: Address) {
        let key = StorageKey::Session(smart_account);
        let open: Option<Session> = e.storage().temporary().get(&key);
        if let Some(s) = open {
            s.router.require_auth();
            e.storage().temporary().remove(&key);
        }
    }

    pub fn get_session(e: Env, smart_account: Address) -> Option<Session> {
        e.storage().temporary().get(&StorageKey::Session(smart_account))
    }

    pub fn get_params(e: Env, smart_account: Address, context_rule_id: u32) -> Option<KoulAgentParams> {
        e.storage().persistent().get(&StorageKey::Params(smart_account, context_rule_id))
    }

    pub fn get_window(e: Env, smart_account: Address, context_rule_id: u32) -> Option<WindowState> {
        e.storage().persistent().get(&StorageKey::Window(smart_account, context_rule_id))
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::{Address as _, Ledger}, vec, Bytes, IntoVal, String};
    use stellar_accounts::smart_account::ContextRuleType;

    struct World {
        e: Env,
        policy: Address,
        account: Address,
        router: Address,
        controller: Address,
        aggregator: Address,
        usdc: Address,
    }

    fn world() -> World {
        let e = Env::default();
        e.mock_all_auths();
        e.ledger().set_sequence_number(100);
        let policy = e.register(KoulAgentPolicy, ());
        let w = World { policy, account: Address::generate(&e), router: Address::generate(&e), controller: Address::generate(&e), aggregator: Address::generate(&e), usdc: Address::generate(&e), e };
        let params = KoulAgentParams {
            account_id: 12,
            allowed_calls: vec![&w.e, (w.router.clone(), symbol_short!("tick")), (w.controller.clone(), symbol_short!("withdraw")), (w.aggregator.clone(), Symbol::new(&w.e, "execute_strategy")), (w.usdc.clone(), symbol_short!("transfer"))],
            allowed_transfer_recipients: vec![&w.e, w.aggregator.clone()],
            max_calls_per_window: 40,
            window_ledgers: 2000,
        };
        KoulAgentPolicyClient::new(&w.e, &w.policy).install(&params, &rule(&w.e, &w.policy), &w.account);
        w
    }

    fn rule(e: &Env, policy: &Address) -> ContextRule {
        ContextRule {
            id: 1,
            context_type: ContextRuleType::Default,
            name: String::from_str(e, "koul-agent"),
            signers: vec![e, Signer::External(Address::generate(e), Bytes::from_array(e, &[7; 32]))],
            signer_ids: vec![e, 1],
            policies: vec![e, policy.clone()],
            policy_ids: vec![e, 1],
            valid_until: None,
        }
    }

    fn call(w: &World, contract: &Address, fn_name: &str, args: Vec<Val>) -> Result<(), Result<soroban_sdk::Error, soroban_sdk::InvokeError>> {
        let ctx = Context::Contract(ContractContext { contract: contract.clone(), fn_name: Symbol::new(&w.e, fn_name), args });
        let r = rule(&w.e, &w.policy);
        KoulAgentPolicyClient::new(&w.e, &w.policy).try_enforce(&ctx, &r.signers, &r, &w.account).map(|_| ())
    }

    fn withdraw_args(w: &World) -> Vec<Val> {
        vec![&w.e, w.account.into_val(&w.e), 12u64.into_val(&w.e), Vec::<Val>::new(&w.e).into_val(&w.e), Some(w.account.clone()).into_val(&w.e)]
    }

    fn err(code: KoulPolicyError) -> Result<(), Result<soroban_sdk::Error, soroban_sdk::InvokeError>> {
        Err(Ok(soroban_sdk::Error::from_contract_error(code as u32)))
    }

    #[test]
    fn the_agent_acts_only_inside_a_tick() {
        let w = world();
        let p = KoulAgentPolicyClient::new(&w.e, &w.policy);
        // Straight at XOXNO with the agent key: no session, rejected.
        assert_eq!(call(&w, &w.controller, "withdraw", withdraw_args(&w)), err(KoulPolicyError::NoSession));

        let tick_args = vec![&w.e, w.account.into_val(&w.e), 1u32.into_val(&w.e), Option::<Bytes>::None.into_val(&w.e)];
        assert_eq!(call(&w, &w.router, "tick", tick_args.clone()), Ok(()));
        assert_eq!(p.get_session(&w.account).unwrap().router, w.router);
        assert_eq!(call(&w, &w.controller, "withdraw", withdraw_args(&w)), Ok(()));

        // A session does not outlive its ledger, even if nobody closed it.
        w.e.ledger().set_sequence_number(101);
        assert_eq!(call(&w, &w.controller, "withdraw", withdraw_args(&w)), err(KoulPolicyError::NoSession));

        assert_eq!(call(&w, &w.router, "tick", tick_args), Ok(()));
        p.end_session(&w.account);
        assert!(p.get_session(&w.account).is_none());
        assert_eq!(call(&w, &w.controller, "withdraw", withdraw_args(&w)), err(KoulPolicyError::NoSession));
        // Closing without a session is a no-op.
        p.end_session(&w.account);
    }

    #[test]
    fn only_the_router_that_opened_it_closes_a_session() {
        let w = world();
        let tick_args = vec![&w.e, w.account.into_val(&w.e), 1u32.into_val(&w.e), Option::<Bytes>::None.into_val(&w.e)];
        assert_eq!(call(&w, &w.router, "tick", tick_args), Ok(()));
        // No auth mocked: the router is not the caller here, so closing fails.
        w.e.set_auths(&[]);
        assert!(KoulAgentPolicyClient::new(&w.e, &w.policy).try_end_session(&w.account).is_err());
    }

    #[test]
    fn a_swap_pays_back_to_the_wallet() {
        let w = world();
        let tick_args = vec![&w.e, w.account.into_val(&w.e), 1u32.into_val(&w.e), Option::<Bytes>::None.into_val(&w.e)];
        assert_eq!(call(&w, &w.router, "tick", tick_args), Ok(()));
        let swap = |sender: &Address| vec![&w.e, sender.into_val(&w.e), 10_000_000i128.into_val(&w.e), Bytes::new(&w.e).into_val(&w.e)];
        assert_eq!(call(&w, &w.aggregator, "execute_strategy", swap(&w.account)), Ok(()));
        assert_eq!(call(&w, &w.aggregator, "execute_strategy", swap(&Address::generate(&w.e))), err(KoulPolicyError::SenderNotAllowed));
        let transfer = |to: &Address| vec![&w.e, w.account.into_val(&w.e), to.into_val(&w.e), 10_000_000i128.into_val(&w.e)];
        assert_eq!(call(&w, &w.usdc, "transfer", transfer(&w.aggregator)), Ok(()));
        assert_eq!(call(&w, &w.usdc, "transfer", transfer(&Address::generate(&w.e))), err(KoulPolicyError::TransferRecipientNotAllowed));
        assert_eq!(call(&w, &w.controller, "borrow", withdraw_args(&w)), err(KoulPolicyError::CallNotAllowed));
    }
}
