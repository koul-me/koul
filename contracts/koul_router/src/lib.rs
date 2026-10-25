//! koul_router: the on-chain rule engine for a user's XOXNO position.
//!
//! An autopilot is an ordered list of rules. A rule is one to three conditions joined by all or any, one action and
//! a cooldown. `tick(user, id)` walks the rules top to bottom, skips rules still cooling down, evaluates the
//! conditions against live reads (pool rates, controller health factor and positions, the FX oracle, the wallet's
//! USDC balance) and executes the first rule whose conditions hold and whose action resolves to a non-empty amount.
//! At most one action per tick. `set_autopilot` is passkey-signed; `tick` needs `user.require_auth()`, which the
//! agent key satisfies through the smart account's agent rule and `koul_agent_policy`. `check` is a read-only view
//! for live UIs. The router holds no funds and keeps no state beyond autopilots, registries and last-fired ledgers.
//!
//! Swaps go through the XOXNO aggregator with the wallet as sender. The route comes from the keeper, because only an
//! off-chain quote server can search DEX liquidity, so the router trusts nothing in it: it checks the route's token
//! pair against the rule, sets the input amount itself, measures what the wallet actually received and reverts below
//! its own floor, derived from oracle prices less the rule's slippage. `next_action` tells the keeper when a route is
//! needed and for what amount. At the end of every tick the router closes the agent's session on `koul_agent_policy`.
#![no_std]

use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, panic_with_error, token, xdr::FromXdr,
    Address, Bytes, BytesN, Env, Symbol, Vec,
};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HubAssetKey {
    pub asset: Address,
    pub hub_id: u32,
}

#[contractclient(name = "ControllerClient")]
pub trait Controller {
    fn withdraw(env: Env, caller: Address, account_id: u64, withdrawals: Vec<(HubAssetKey, i128)>, to: Option<Address>) -> Vec<(HubAssetKey, i128)>;
    fn supply(env: Env, caller: Address, account_id: u64, spoke_id: u32, assets: Vec<(HubAssetKey, i128)>) -> u64;
    fn repay(env: Env, caller: Address, account_id: u64, payments: Vec<(HubAssetKey, i128)>);
    fn get_health_factor(env: Env, account_id: u64) -> i128;
    fn get_collateral_amount(env: Env, account_id: u64, hub_asset: HubAssetKey) -> i128;
    fn get_borrow_amount(env: Env, account_id: u64, hub_asset: HubAssetKey) -> i128;
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct MarketParamsRaw {
    pub asset_decimals: u32,
    pub asset_id: Address,
    pub base_borrow_rate: i128,
    pub flashloan_fee: u32,
    pub is_flashloanable: bool,
    pub max_borrow_rate: i128,
    pub max_utilization: i128,
    pub mid_utilization: i128,
    pub optimal_utilization: i128,
    pub reserve_factor: u32,
    pub slope1: i128,
    pub slope2: i128,
    pub slope3: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolStateRaw {
    pub borrow_index: i128,
    pub borrowed: i128,
    pub cash: i128,
    pub last_timestamp: u64,
    pub revenue: i128,
    pub supplied: i128,
    pub supply_index: i128,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct PoolSyncData {
    pub params: MarketParamsRaw,
    pub state: PoolStateRaw,
}

#[contractclient(name = "PoolClient")]
pub trait Pool {
    fn get_deposit_rate(env: Env, hub_asset: HubAssetKey) -> i128;
    fn get_sync_data(env: Env, hub_asset: HubAssetKey) -> PoolSyncData;
    fn get_supplied_amount(env: Env, hub_asset: HubAssetKey) -> i128;
    fn get_borrowed_amount(env: Env, hub_asset: HubAssetKey) -> i128;
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OracleAsset {
    Stellar(Address),
    Other(Symbol),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PriceData {
    pub price: i128,
    pub timestamp: u64,
}

#[contractclient(name = "OracleClient")]
pub trait Oracle {
    fn lastprice(env: Env, asset: OracleAsset) -> Option<PriceData>;
}

#[contractclient(name = "AggregatorClient")]
pub trait Aggregator {
    fn execute_strategy(env: Env, sender: Address, total_in: i128, swap_xdr: Bytes) -> i128;
}

/// `koul_agent_policy` opens an agent session when it authorizes `tick`; the router closes it before returning.
#[contractclient(name = "SessionClient")]
pub trait Session {
    fn end_session(env: Env, smart_account: Address);
}

/// The aggregator's `StrategyPayload`, enough to read the route's token pair: `ops[1]` and `ops[2]` index `assets`.
#[contracttype]
#[derive(Clone, Debug)]
pub struct StrategyPayload {
    pub amounts: Vec<i128>,
    pub assets: Vec<Address>,
    pub ops: Bytes,
}

/// Where a token's USD price comes from, 14 decimals like Reflector: an oracle asset with a staleness limit in
/// seconds, or a fixed price.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PriceSource {
    Oracle(Address, OracleAsset, u64),
    Fixed(i128),
}

/// A token the router may swap or price: its USD price source and its decimals.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Feed {
    pub source: PriceSource,
    pub decimals: u32,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Config {
    pub controller: Address,
    pub pool: Address,
    pub usdc: Address,
    pub oracle: Address,
    pub spoke_id: u32,
}

/// Two comparators cover every condition: `Below` is `value < level`, `AtOrAbove` is `value >= level`.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cmp {
    Below,
    AtOrAbove,
}

/// How much of the base amount an action uses. `Percent` is in basis points of the base, `Fixed` is 7-decimal USDC
/// capped at the base. The base is the withdrawable collateral for moves and withdrawals, the debt (rounded up one
/// grain) for repayments.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Amount {
    All,
    Percent(u32),
    Fixed(i128),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Condition {
    /// Account health factor (WAD, `i128::MAX` when there is no debt) compared with the level.
    HealthFactor(Cmp, i128),
    /// `deposit_rate(hub_over) - deposit_rate(hub_under) >= min_bps` (annual rates, basis points).
    SupplyRateGap(u32, u32, u32),
    /// One hub's deposit rate against a level, in basis points of the pool's annual simple rate.
    SupplyRate(u32, Cmp, u32),
    /// Oracle `lastprice(Other(asset))` (USD per unit, 14 decimals) compared with the level. A missing price or one
    /// older than `max_age_secs` never matches.
    FxPrice(Symbol, Cmp, i128, u64),
    /// Idle USDC in the wallet (7 decimals) compared with the amount.
    IdleBalance(Cmp, i128),
    /// A registered token's USD price (14 decimals) compared with the level. A missing or stale price never matches.
    TokenPrice(Address, Cmp, i128),
    /// The wallet's balance of any token, in its own base units, compared with the amount.
    TokenBalance(Address, Cmp, i128),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    /// Withdraw `amount` of the collateral in `from_hub` and supply it to `to_hub`.
    MoveSupply(u32, u32, Amount),
    /// Supply `amount` of the wallet's idle USDC into `hub`. This is how an autopilot opens a position.
    SupplyFromWallet(u32, Amount),
    /// Repay `amount` of the debt in `hub` from idle wallet USDC.
    RepayFromWallet(u32, Amount),
    /// Withdraw `amount` of the debt in `repay_hub` from the collateral in `withdraw_hub`, then repay.
    RepayWithCollateral(u32, u32, Amount),
    /// Withdraw `amount` of the collateral in `hub` to the wallet.
    WithdrawToWallet(u32, Amount),
    /// Swap `amount` of the wallet's `token_in` balance into `token_out`, at most `max_slippage_bps` below the oracle.
    SwapFromWallet(Address, Address, Amount, u32),
    /// Withdraw `amount` of the collateral in `hub` to the wallet, then swap that USDC into `token_out`.
    WithdrawAndSwap(u32, Address, Amount, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rule {
    pub conditions: Vec<Condition>,
    /// `true`: every condition must hold. `false`: any one is enough.
    pub match_all: bool,
    pub action: Action,
    /// Ledgers to wait after this rule fired before it may fire again. Must be > 0.
    pub cooldown_ledgers: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Autopilot {
    pub account_id: u64,
    pub rules: Vec<Rule>,
}

/// What `tick` did.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Executed {
    pub rule_index: u32,
    pub kind: Symbol,
    pub amount: i128,
    pub from_hub: u32,
    pub to_hub: u32,
}

/// What the next tick would run, for the keeper: a swap needs a route for exactly `amount` of `token_in`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Planned {
    pub rule_index: u32,
    pub kind: Symbol,
    pub amount: i128,
    pub needs_route: bool,
    pub token_in: Address,
    pub token_out: Address,
    /// The least the router accepts from the swap; 0 for other actions.
    pub min_out: i128,
}

/// Live state of one condition for the `check` view.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ConditionState {
    pub holds: bool,
    /// The value that was compared: health factor, rate gap in bps, price, or balance.
    pub observed: i128,
}

/// Live state of one rule for the `check` view.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RuleState {
    /// `false` while the cooldown is running.
    pub ready: bool,
    pub holds: bool,
    pub conditions: Vec<ConditionState>,
    /// Ledger the rule last fired at, 0 if never.
    pub last_fired: u32,
}

#[contracttype]
pub enum DataKey {
    Config,
    Admin,
    Users,
    Ids(Address),
    Autopilot(Address, u32),
    LastFired(Address, u32, u32),
    Feed(Address),
    Aggregator,
    Policy,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum RouterError {
    NoAutopilot = 7200,
    BadAutopilot = 7201,
    NothingMoved = 7206,
    UnknownToken = 7207,
    RouteRequired = 7208,
    RouteMismatch = 7209,
    BelowFloor = 7210,
    NotConfigured = 7211,
}

#[contractevent]
#[derive(Clone)]
pub struct Fired {
    #[topic]
    pub user: Address,
    pub autopilot_id: u32,
    pub rule_index: u32,
    pub kind: Symbol,
    pub amount: i128,
    pub from_hub: u32,
    pub to_hub: u32,
    /// One value per condition of the fired rule, in rule order.
    pub observed: Vec<i128>,
}

#[contractevent]
#[derive(Clone)]
pub struct Swapped {
    #[topic]
    pub user: Address,
    pub autopilot_id: u32,
    pub rule_index: u32,
    pub token_in: Address,
    pub token_out: Address,
    pub amount_in: i128,
    pub amount_out: i128,
    pub min_out: i128,
}

#[contractevent]
#[derive(Clone)]
pub struct AutopilotSet {
    #[topic]
    pub user: Address,
    pub autopilot_id: u32,
    pub account_id: u64,
    pub rules: u32,
}

#[contractevent]
#[derive(Clone)]
pub struct AutopilotCleared {
    #[topic]
    pub user: Address,
    pub autopilot_id: u32,
}

const RAY: i128 = 1_000_000_000_000_000_000_000_000_000;
const BPS_RAY: i128 = RAY / 10_000;
/// Amounts passed to the controller must be identical at simulation and execution, while positions accrue interest
/// every ledger. Every amount is therefore snapped to 0.01 USDC, and moves below 1 USDC are ignored.
pub const GRAIN: i128 = 100_000;
pub const MIN_MOVE: i128 = 10_000_000;
pub const MAX_RULES: u32 = 32;
pub const MAX_CONDITIONS: u32 = 3;
/// Prices are USD with 14 decimals, as Reflector publishes them.
pub const PRICE_ONE: i128 = 100_000_000_000_000;
pub const MAX_SLIPPAGE_BPS: u32 = 2_000;
const TTL_THRESHOLD: u32 = 17280 * 7;
const TTL_EXTEND: u32 = 17280 * 30;

pub fn floor_grain(x: i128) -> i128 {
    if x <= 0 { 0 } else { x - x % GRAIN }
}

pub fn ceil_grain(x: i128) -> i128 {
    if x <= 0 { 0 } else if x % GRAIN == 0 { x } else { x - x % GRAIN + GRAIN }
}

/// What can actually leave a hub now: the position snapped down, capped by the hub's liquid cash and by the
/// pool's utilisation ceiling (`borrowed / (supplied - w) <= max_utilization`), minus one grain of margin.
pub fn withdrawable(collateral: i128, cash: i128, supplied: i128, borrowed: i128, max_utilization: i128) -> i128 {
    let util_cap = if borrowed <= 0 || max_utilization >= RAY || max_utilization <= 0 {
        cash
    } else {
        supplied - (borrowed * RAY / max_utilization + 1)
    };
    let cap = floor_grain(if util_cap < cash { util_cap } else { cash }) - GRAIN;
    let c = floor_grain(collateral);
    if c < cap { c } else if cap > 0 { cap } else { 0 }
}

pub fn holds(cmp: Cmp, value: i128, level: i128) -> bool {
    match cmp {
        Cmp::Below => value < level,
        Cmp::AtOrAbove => value >= level,
    }
}

/// Resolve an `Amount` against its base, snapped down to the grain and never above the base.
pub fn resolve(amount: &Amount, base: i128) -> i128 {
    let want = match amount {
        Amount::All => base,
        Amount::Percent(bps) => base / 10_000 * (*bps as i128) + (base % 10_000) * (*bps as i128) / 10_000,
        Amount::Fixed(x) => if *x < base { *x } else { base },
    };
    floor_grain(if want < base { want } else { base })
}

pub fn ready(last_fired: u32, now: u32, cooldown_ledgers: u32) -> bool {
    last_fired == 0 || now.saturating_sub(last_fired) >= cooldown_ledgers
}

pub fn is_stale(now: u64, ts: u64, max_age: u64) -> bool {
    now.saturating_sub(ts) > max_age
}

fn pow10(n: u32) -> i128 {
    10i128.pow(n)
}

/// USD value of `amount` base units at `price` (14 decimals), in 14 decimals.
pub fn usd_value(amount: i128, decimals: u32, price: i128) -> i128 {
    amount / pow10(decimals) * price + amount % pow10(decimals) * price / pow10(decimals)
}

/// The least the router accepts for `amount_in`: the oracle-implied output less `slippage_bps`.
pub fn swap_floor(amount_in: i128, dec_in: u32, price_in: i128, dec_out: u32, price_out: i128, slippage_bps: u32) -> i128 {
    if price_out <= 0 {
        return 0;
    }
    let out = usd_value(amount_in, dec_in, price_in) * pow10(dec_out) / price_out;
    out / 10_000 * (10_000 - slippage_bps as i128) + out % 10_000 * (10_000 - slippage_bps as i128) / 10_000
}

fn amount_ok(a: &Amount) -> bool {
    match a {
        Amount::All => true,
        Amount::Percent(bps) => *bps >= 1 && *bps <= 10_000,
        Amount::Fixed(x) => *x >= MIN_MOVE,
    }
}

fn swap_amount_ok(a: &Amount) -> bool {
    match a {
        Amount::Fixed(x) => *x > 0,
        _ => amount_ok(a),
    }
}

fn condition_ok(c: &Condition) -> bool {
    match c {
        Condition::HealthFactor(_, level) => *level > 0,
        Condition::SupplyRateGap(over, under, min_bps) => over != under && *min_bps > 0,
        Condition::SupplyRate(_, _, bps) => *bps > 0,
        Condition::FxPrice(_, _, level, max_age) => *level > 0 && *max_age > 0,
        Condition::IdleBalance(_, amount) => *amount >= 0,
        Condition::TokenPrice(_, _, level) => *level > 0,
        Condition::TokenBalance(_, _, amount) => *amount >= 0,
    }
}

fn action_ok(a: &Action) -> bool {
    match a {
        Action::MoveSupply(from, to, amt) => from != to && amount_ok(amt),
        Action::SupplyFromWallet(_, amt) => amount_ok(amt),
        Action::RepayFromWallet(_, amt) => amount_ok(amt),
        Action::RepayWithCollateral(_, _, amt) => amount_ok(amt),
        Action::WithdrawToWallet(_, amt) => amount_ok(amt),
        Action::SwapFromWallet(tin, tout, amt, slip) => tin != tout && swap_amount_ok(amt) && *slip >= 1 && *slip <= MAX_SLIPPAGE_BPS,
        Action::WithdrawAndSwap(_, _, amt, slip) => amount_ok(amt) && *slip >= 1 && *slip <= MAX_SLIPPAGE_BPS,
    }
}

/// The limits the SDK mirrors: 1..=32 rules, 1..=3 conditions each, cooldown > 0, hubs differ for moves and rate gaps,
/// percentages in 1..=10000 bps, fixed amounts at least 1 USDC (any positive amount for a swap's own token), positive
/// levels, swap slippage in 1..=2000 bps and two different tokens.
pub fn autopilot_ok(ap: &Autopilot) -> bool {
    if ap.rules.is_empty() || ap.rules.len() > MAX_RULES {
        return false;
    }
    ap.rules.iter().all(|r| {
        !r.conditions.is_empty() && r.conditions.len() <= MAX_CONDITIONS && r.cooldown_ledgers > 0 && r.conditions.iter().all(|c| condition_ok(&c)) && action_ok(&r.action)
    })
}

fn config(e: &Env) -> Config {
    e.storage().instance().get(&DataKey::Config).unwrap()
}

fn key(cfg: &Config, hub: u32) -> HubAssetKey {
    HubAssetKey { asset: cfg.usdc.clone(), hub_id: hub }
}

fn hub_withdrawable(pool: &PoolClient, k: &HubAssetKey, collateral: i128) -> i128 {
    if collateral <= 0 {
        return 0;
    }
    let sd = pool.get_sync_data(k);
    withdrawable(collateral, sd.state.cash, pool.get_supplied_amount(k), pool.get_borrowed_amount(k), sd.params.max_utilization)
}

fn feed(e: &Env, token: &Address) -> Option<Feed> {
    e.storage().persistent().get(&DataKey::Feed(token.clone()))
}

fn instance_addr(e: &Env, k: &DataKey) -> Option<Address> {
    e.storage().instance().get(k)
}

/// Every token a rule names must have a feed, and a swap needs the aggregator. Checked when an autopilot is stored.
fn tokens_known(e: &Env, cfg: &Config, ap: &Autopilot) -> Result<(), RouterError> {
    for r in ap.rules.iter() {
        for c in r.conditions.iter() {
            if let Condition::TokenPrice(t, _, _) = c {
                if feed(e, &t).is_none() {
                    return Err(RouterError::UnknownToken);
                }
            }
        }
        let (tin, tout) = match &r.action {
            Action::SwapFromWallet(tin, tout, _, _) => (tin.clone(), tout.clone()),
            Action::WithdrawAndSwap(_, tout, _, _) => (cfg.usdc.clone(), tout.clone()),
            _ => continue,
        };
        if tin == tout || feed(e, &tin).is_none() || feed(e, &tout).is_none() {
            return Err(RouterError::UnknownToken);
        }
        if instance_addr(e, &DataKey::Aggregator).is_none() {
            return Err(RouterError::NotConfigured);
        }
    }
    Ok(())
}

fn last_fired(e: &Env, user: &Address, id: u32, rule_index: u32) -> u32 {
    e.storage().persistent().get(&DataKey::LastFired(user.clone(), id, rule_index)).unwrap_or(0)
}

fn extend(e: &Env, k: &DataKey) {
    e.storage().persistent().extend_ttl(k, TTL_THRESHOLD, TTL_EXTEND);
}

fn ids_of(e: &Env, user: &Address) -> Vec<u32> {
    e.storage().persistent().get(&DataKey::Ids(user.clone())).unwrap_or(Vec::new(e))
}

fn users(e: &Env) -> Vec<Address> {
    e.storage().persistent().get(&DataKey::Users).unwrap_or(Vec::new(e))
}

fn vec_remove_u32(v: &Vec<u32>, x: u32) -> Vec<u32> {
    let mut out = Vec::new(v.env());
    for y in v.iter() {
        if y != x {
            out.push_back(y);
        }
    }
    out
}

fn vec_remove_addr(v: &Vec<Address>, x: &Address) -> Vec<Address> {
    let mut out = Vec::new(v.env());
    for y in v.iter() {
        if y != *x {
            out.push_back(y);
        }
    }
    out
}

struct Reads<'a> {
    e: &'a Env,
    cfg: &'a Config,
    controller: ControllerClient<'a>,
    pool: PoolClient<'a>,
}

impl<'a> Reads<'a> {
    fn new(e: &'a Env, cfg: &'a Config) -> Self {
        Reads { e, cfg, controller: ControllerClient::new(e, &cfg.controller), pool: PoolClient::new(e, &cfg.pool) }
    }

    fn evaluate(&self, user: &Address, account_id: u64, c: &Condition) -> ConditionState {
        match c {
            Condition::HealthFactor(cmp, level) => {
                let hf = self.controller.get_health_factor(&account_id);
                ConditionState { holds: holds(*cmp, hf, *level), observed: hf }
            }
            Condition::SupplyRateGap(over, under, min_bps) => {
                let gap = self.pool.get_deposit_rate(&key(self.cfg, *over)) - self.pool.get_deposit_rate(&key(self.cfg, *under));
                let gap_bps = gap / BPS_RAY;
                ConditionState { holds: gap >= (*min_bps as i128) * BPS_RAY, observed: gap_bps }
            }
            Condition::SupplyRate(hub, cmp, bps) => {
                let rate_bps = self.pool.get_deposit_rate(&key(self.cfg, *hub)) / BPS_RAY;
                ConditionState { holds: holds(*cmp, rate_bps, *bps as i128), observed: rate_bps }
            }
            Condition::FxPrice(asset, cmp, level, max_age) => {
                let oracle = OracleClient::new(self.e, &self.cfg.oracle);
                match oracle.lastprice(&OracleAsset::Other(asset.clone())) {
                    Some(p) if !is_stale(self.e.ledger().timestamp(), p.timestamp, *max_age) => ConditionState { holds: holds(*cmp, p.price, *level), observed: p.price },
                    Some(p) => ConditionState { holds: false, observed: p.price },
                    None => ConditionState { holds: false, observed: 0 },
                }
            }
            Condition::IdleBalance(cmp, amount) => {
                let idle = self.balance(&self.cfg.usdc, user);
                ConditionState { holds: holds(*cmp, idle, *amount), observed: idle }
            }
            Condition::TokenPrice(t, cmp, level) => match self.price(t) {
                Some((p, _)) => ConditionState { holds: holds(*cmp, p, *level), observed: p },
                None => ConditionState { holds: false, observed: 0 },
            },
            Condition::TokenBalance(t, cmp, amount) => {
                let b = self.balance(t, user);
                ConditionState { holds: holds(*cmp, b, *amount), observed: b }
            }
        }
    }

    fn evaluate_rule(&self, user: &Address, account_id: u64, r: &Rule) -> (bool, Vec<ConditionState>) {
        let mut states = Vec::new(self.e);
        let mut all = true;
        let mut any = false;
        for c in r.conditions.iter() {
            let s = self.evaluate(user, account_id, &c);
            all = all && s.holds;
            any = any || s.holds;
            states.push_back(s);
        }
        (if r.match_all { all } else { any }, states)
    }

    fn withdraw(&self, user: &Address, account_id: u64, hub: u32, amount: i128) -> i128 {
        let mut w = Vec::new(self.e);
        w.push_back((key(self.cfg, hub), amount));
        let got = self.controller.withdraw(user, &account_id, &w, &Some(user.clone()));
        floor_grain(got.get(0).map(|(_, a)| a).unwrap_or(0))
    }

    fn repay(&self, user: &Address, account_id: u64, hub: u32, amount: i128) {
        let mut p = Vec::new(self.e);
        p.push_back((key(self.cfg, hub), amount));
        self.controller.repay(user, &account_id, &p);
    }

    fn withdrawable_in(&self, account_id: u64, hub: u32) -> i128 {
        let k = key(self.cfg, hub);
        hub_withdrawable(&self.pool, &k, self.controller.get_collateral_amount(&account_id, &k))
    }

    /// Debt base for repayments: debt accrues every ledger, so round up and add a grain so the signed amount stays
    /// valid for hours (the controller refunds any excess). Zero when there is no debt.
    fn debt_base(&self, account_id: u64, hub: u32) -> i128 {
        let debt = self.controller.get_borrow_amount(&account_id, &key(self.cfg, hub));
        if debt <= 0 { 0 } else { ceil_grain(debt + GRAIN) }
    }

    /// A registered token's USD price, or `None` when it has no feed or the oracle's price is missing or stale.
    fn price(&self, token: &Address) -> Option<(i128, u32)> {
        let f = feed(self.e, token)?;
        let p = match f.source {
            PriceSource::Fixed(p) => p,
            PriceSource::Oracle(oracle, asset, max_age) => {
                let pd = OracleClient::new(self.e, &oracle).lastprice(&asset)?;
                if is_stale(self.e.ledger().timestamp(), pd.timestamp, max_age) {
                    return None;
                }
                pd.price
            }
        };
        if p > 0 { Some((p, f.decimals)) } else { None }
    }

    fn balance(&self, token: &Address, user: &Address) -> i128 {
        token::TokenClient::new(self.e, token).balance(user)
    }

    /// The swap half of a plan: worth at least 1 USD, with the router's floor. A wallet balance earns nothing between the
    /// keeper's quote and the tick, so unlike a position it needs no snapping; a withdrawal arrives already snapped.
    fn plan_swap(&self, tin: &Address, tout: &Address, amount: i128, slip: u32, withdraw_hub: Option<u32>) -> Option<Plan> {
        let (pin, din) = self.price(tin)?;
        let (pout, dout) = self.price(tout)?;
        if amount <= 0 || usd_value(amount, din, pin) < PRICE_ONE {
            return None;
        }
        let min_out = swap_floor(amount, din, pin, dout, pout, slip);
        if min_out <= 0 {
            return None;
        }
        Some(Plan::Swap { tin: tin.clone(), tout: tout.clone(), amount, min_out, withdraw_hub })
    }

    /// Resolve an action against live reads without moving anything. `None` means it has nothing worth doing (no
    /// collateral, no debt, no idle funds, hub illiquid, no fresh price); `tick` then goes on to the next rule.
    fn plan(&self, user: &Address, account_id: u64, a: &Action) -> Option<Plan> {
        match a {
            Action::MoveSupply(from, to, amt) => {
                let w = resolve(amt, self.withdrawable_in(account_id, *from));
                if w < MIN_MOVE { None } else { Some(Plan::Move { from: *from, to: *to, amount: w }) }
            }
            Action::SupplyFromWallet(hub, amt) => {
                let put = resolve(amt, floor_grain(self.balance(&self.cfg.usdc, user)));
                if put < MIN_MOVE { None } else { Some(Plan::Supply { hub: *hub, amount: put }) }
            }
            Action::RepayFromWallet(hub, amt) => {
                let want = resolve(amt, self.debt_base(account_id, *hub));
                let idle = floor_grain(self.balance(&self.cfg.usdc, user));
                let pay = if want < idle { want } else { idle };
                if pay <= 0 { None } else { Some(Plan::RepayWallet { hub: *hub, amount: pay }) }
            }
            Action::RepayWithCollateral(from, hub, amt) => {
                let want = resolve(amt, self.debt_base(account_id, *hub));
                let avail = self.withdrawable_in(account_id, *from);
                let w = if want < avail { want } else { avail };
                if w < MIN_MOVE { None } else { Some(Plan::RepayCollateral { from: *from, hub: *hub, amount: w }) }
            }
            Action::WithdrawToWallet(hub, amt) => {
                let w = resolve(amt, self.withdrawable_in(account_id, *hub));
                if w < MIN_MOVE { None } else { Some(Plan::Withdraw { hub: *hub, amount: w }) }
            }
            Action::SwapFromWallet(tin, tout, amt, slip) => {
                let base = self.balance(tin, user);
                let want = match amt {
                    Amount::All => base,
                    Amount::Percent(bps) => base / 10_000 * (*bps as i128) + (base % 10_000) * (*bps as i128) / 10_000,
                    Amount::Fixed(x) => if *x < base { *x } else { base },
                };
                self.plan_swap(tin, tout, want, *slip, None)
            }
            Action::WithdrawAndSwap(hub, tout, amt, slip) => {
                let w = resolve(amt, self.withdrawable_in(account_id, *hub));
                if w < MIN_MOVE { None } else { self.plan_swap(&self.cfg.usdc, tout, w, *slip, Some(*hub)) }
            }
        }
    }

    /// Run a plan. Swaps need the keeper's route; everything about it except the venues is checked here.
    fn run(&self, user: &Address, account_id: u64, id: u32, rule_index: u32, p: Plan, route: &Option<Bytes>) -> Executed {
        let ex = |kind: &str, amount: i128, from_hub: u32, to_hub: u32| Executed { rule_index, kind: Symbol::new(self.e, kind), amount, from_hub, to_hub };
        match p {
            Plan::Move { from, to, amount } => {
                let received = self.withdraw(user, account_id, from, amount);
                if received < MIN_MOVE {
                    panic_with_error!(self.e, RouterError::NothingMoved);
                }
                let mut s = Vec::new(self.e);
                s.push_back((key(self.cfg, to), received));
                self.controller.supply(user, &account_id, &self.cfg.spoke_id, &s);
                ex("move_supply", received, from, to)
            }
            Plan::Supply { hub, amount } => {
                let mut s = Vec::new(self.e);
                s.push_back((key(self.cfg, hub), amount));
                self.controller.supply(user, &account_id, &self.cfg.spoke_id, &s);
                ex("supply", amount, hub, hub)
            }
            Plan::RepayWallet { hub, amount } => {
                self.repay(user, account_id, hub, amount);
                ex("repay_wallet", amount, hub, hub)
            }
            Plan::RepayCollateral { from, hub, amount } => {
                let received = self.withdraw(user, account_id, from, amount);
                if received <= 0 {
                    panic_with_error!(self.e, RouterError::NothingMoved);
                }
                self.repay(user, account_id, hub, received);
                ex("repay_collateral", received, from, hub)
            }
            Plan::Withdraw { hub, amount } => {
                let received = self.withdraw(user, account_id, hub, amount);
                if received <= 0 {
                    panic_with_error!(self.e, RouterError::NothingMoved);
                }
                ex("withdraw", received, hub, hub)
            }
            Plan::Swap { tin, tout, amount, min_out, withdraw_hub } => {
                let route = route.clone().unwrap_or_else(|| panic_with_error!(self.e, RouterError::RouteRequired));
                let payload = StrategyPayload::from_xdr(self.e, &route).unwrap_or_else(|_| panic_with_error!(self.e, RouterError::RouteMismatch));
                let asset = |i: u32| payload.ops.get(i).and_then(|ix| payload.assets.get(ix as u32));
                if asset(1) != Some(tin.clone()) || asset(2) != Some(tout.clone()) {
                    panic_with_error!(self.e, RouterError::RouteMismatch);
                }
                // The route was quoted for exactly `amount`; the controller returns that unless the hub changed meanwhile.
                if let Some(hub) = withdraw_hub {
                    if self.withdraw(user, account_id, hub, amount) != amount {
                        panic_with_error!(self.e, RouterError::NothingMoved);
                    }
                }
                let aggregator = instance_addr(self.e, &DataKey::Aggregator).unwrap_or_else(|| panic_with_error!(self.e, RouterError::NotConfigured));
                let before = self.balance(&tout, user);
                AggregatorClient::new(self.e, &aggregator).execute_strategy(user, &amount, &route);
                let got = self.balance(&tout, user) - before;
                if got < min_out {
                    panic_with_error!(self.e, RouterError::BelowFloor);
                }
                Swapped { user: user.clone(), autopilot_id: id, rule_index, token_in: tin, token_out: tout, amount_in: amount, amount_out: got, min_out }.publish(self.e);
                match withdraw_hub {
                    Some(hub) => ex("withdraw_swap", amount, hub, 0),
                    None => ex("swap", amount, 0, 0),
                }
            }
        }
    }
}

/// A resolved action: what `run` will move, decided from reads only.
enum Plan {
    Move { from: u32, to: u32, amount: i128 },
    Supply { hub: u32, amount: i128 },
    RepayWallet { hub: u32, amount: i128 },
    RepayCollateral { from: u32, hub: u32, amount: i128 },
    Withdraw { hub: u32, amount: i128 },
    Swap { tin: Address, tout: Address, amount: i128, min_out: i128, withdraw_hub: Option<u32> },
}

impl Plan {
    fn planned(&self, e: &Env, cfg: &Config, rule_index: u32) -> Planned {
        let usdc = cfg.usdc.clone();
        let p = |kind: &str, amount: i128| Planned { rule_index, kind: Symbol::new(e, kind), amount, needs_route: false, token_in: usdc.clone(), token_out: usdc.clone(), min_out: 0 };
        match self {
            Plan::Move { amount, .. } => p("move_supply", *amount),
            Plan::Supply { amount, .. } => p("supply", *amount),
            Plan::RepayWallet { amount, .. } => p("repay_wallet", *amount),
            Plan::RepayCollateral { amount, .. } => p("repay_collateral", *amount),
            Plan::Withdraw { amount, .. } => p("withdraw", *amount),
            Plan::Swap { tin, tout, amount, min_out, withdraw_hub } => Planned {
                rule_index,
                kind: Symbol::new(e, if withdraw_hub.is_some() { "withdraw_swap" } else { "swap" }),
                amount: *amount,
                needs_route: true,
                token_in: tin.clone(),
                token_out: tout.clone(),
                min_out: *min_out,
            },
        }
    }
}

#[contract]
pub struct KoulRouter;

#[contractimpl]
impl KoulRouter {
    pub fn __constructor(e: Env, admin: Address, controller: Address, pool: Address, usdc: Address, oracle: Address, spoke_id: u32) {
        e.storage().instance().set(&DataKey::Admin, &admin);
        e.storage().instance().set(&DataKey::Config, &Config { controller, pool, usdc, oracle, spoke_id });
    }

    /// Admin-only wasm upgrade so the router address (and every user's policy allowlist) stays stable.
    pub fn upgrade(e: Env, new_wasm_hash: BytesN<32>) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        e.deployer().update_current_contract_wasm(new_wasm_hash);
    }

    pub fn set_oracle(e: Env, oracle: Address) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let mut cfg = config(&e);
        cfg.oracle = oracle;
        e.storage().instance().set(&DataKey::Config, &cfg);
    }

    pub fn get_config(e: Env) -> Config {
        config(&e)
    }

    /// Admin: register or replace a token's price source. Oracles must quote USD with 14 decimals, like Reflector.
    pub fn set_feed(e: Env, token: Address, feed: Feed) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        let k = DataKey::Feed(token);
        e.storage().persistent().set(&k, &feed);
        extend(&e, &k);
    }

    pub fn get_feed(e: Env, token: Address) -> Option<Feed> {
        feed(&e, &token)
    }

    /// Admin: the XOXNO swap aggregator router swaps execute through.
    pub fn set_aggregator(e: Env, aggregator: Address) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        e.storage().instance().set(&DataKey::Aggregator, &aggregator);
    }

    /// Admin: the agent policy whose session every tick closes.
    pub fn set_policy(e: Env, policy: Address) {
        let admin: Address = e.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();
        e.storage().instance().set(&DataKey::Policy, &policy);
    }

    pub fn get_aggregator(e: Env) -> Option<Address> {
        instance_addr(&e, &DataKey::Aggregator)
    }

    pub fn get_policy(e: Env) -> Option<Address> {
        instance_addr(&e, &DataKey::Policy)
    }

    /// Create or replace autopilot `id` for `user`. Replacing resets the cooldowns of every rule.
    pub fn set_autopilot(e: Env, user: Address, id: u32, autopilot: Autopilot) {
        user.require_auth();
        if !autopilot_ok(&autopilot) {
            panic_with_error!(&e, RouterError::BadAutopilot);
        }
        if let Err(err) = tokens_known(&e, &config(&e), &autopilot) {
            panic_with_error!(&e, err);
        }
        let k = DataKey::Autopilot(user.clone(), id);
        let existed = e.storage().persistent().has(&k);
        if existed {
            for i in 0..MAX_RULES {
                e.storage().persistent().remove(&DataKey::LastFired(user.clone(), id, i));
            }
        }
        e.storage().persistent().set(&k, &autopilot);
        extend(&e, &k);
        let ids = ids_of(&e, &user);
        if !ids.contains(id) {
            let mut ids = ids;
            ids.push_back(id);
            let ik = DataKey::Ids(user.clone());
            e.storage().persistent().set(&ik, &ids);
            extend(&e, &ik);
        }
        let all = users(&e);
        if !all.contains(&user) {
            let mut all = all;
            all.push_back(user.clone());
            e.storage().persistent().set(&DataKey::Users, &all);
            extend(&e, &DataKey::Users);
        }
        AutopilotSet { user, autopilot_id: id, account_id: autopilot.account_id, rules: autopilot.rules.len() }.publish(&e);
    }

    pub fn clear_autopilot(e: Env, user: Address, id: u32) {
        user.require_auth();
        let k = DataKey::Autopilot(user.clone(), id);
        if !e.storage().persistent().has(&k) {
            panic_with_error!(&e, RouterError::NoAutopilot);
        }
        e.storage().persistent().remove(&k);
        for i in 0..MAX_RULES {
            e.storage().persistent().remove(&DataKey::LastFired(user.clone(), id, i));
        }
        let ids = vec_remove_u32(&ids_of(&e, &user), id);
        let ik = DataKey::Ids(user.clone());
        if ids.is_empty() {
            e.storage().persistent().remove(&ik);
            let all = vec_remove_addr(&users(&e), &user);
            if all.is_empty() {
                e.storage().persistent().remove(&DataKey::Users);
            } else {
                e.storage().persistent().set(&DataKey::Users, &all);
            }
        } else {
            e.storage().persistent().set(&ik, &ids);
        }
        AutopilotCleared { user, autopilot_id: id }.publish(&e);
    }

    pub fn get_autopilot(e: Env, user: Address, id: u32) -> Option<Autopilot> {
        e.storage().persistent().get(&DataKey::Autopilot(user, id))
    }

    pub fn list_ids(e: Env, user: Address) -> Vec<u32> {
        ids_of(&e, &user)
    }

    pub fn list_users(e: Env) -> Vec<Address> {
        users(&e)
    }

    /// Read-only: cooldown state and per-condition truth for every rule, in rule order. No auth.
    pub fn check(e: Env, user: Address, id: u32) -> Vec<RuleState> {
        let cfg = config(&e);
        let ap: Autopilot = e.storage().persistent().get(&DataKey::Autopilot(user.clone(), id)).unwrap_or_else(|| panic_with_error!(&e, RouterError::NoAutopilot));
        let reads = Reads::new(&e, &cfg);
        let now = e.ledger().sequence();
        let mut out = Vec::new(&e);
        for (i, r) in ap.rules.iter().enumerate() {
            let lf = last_fired(&e, &user, id, i as u32);
            let (h, states) = reads.evaluate_rule(&user, ap.account_id, &r);
            out.push_back(RuleState { ready: ready(lf, now, r.cooldown_ledgers), holds: h, conditions: states, last_fired: lf });
        }
        out
    }

    /// What the next tick would run, without moving anything. The keeper reads it to learn whether the tick needs a swap
    /// route and for how much. No auth.
    pub fn next_action(e: Env, user: Address, id: u32) -> Option<Planned> {
        let cfg = config(&e);
        let ap: Autopilot = e.storage().persistent().get(&DataKey::Autopilot(user.clone(), id)).unwrap_or_else(|| panic_with_error!(&e, RouterError::NoAutopilot));
        let reads = Reads::new(&e, &cfg);
        let now = e.ledger().sequence();
        for (i, r) in ap.rules.iter().enumerate() {
            let idx = i as u32;
            if !ready(last_fired(&e, &user, id, idx), now, r.cooldown_ledgers) || !reads.evaluate_rule(&user, ap.account_id, &r).0 {
                continue;
            }
            if let Some(p) = reads.plan(&user, ap.account_id, &r.action) {
                return Some(p.planned(&e, &cfg, idx));
            }
        }
        None
    }

    /// Evaluate and execute the first applicable rule of autopilot `id`. Returns `None` when nothing applies, so the
    /// keeper can simulate first and skip submission. `route` is the aggregator route for a swap rule, quoted for the
    /// amount `next_action` reported; other rules ignore it.
    pub fn tick(e: Env, user: Address, id: u32, route: Option<Bytes>) -> Option<Executed> {
        user.require_auth();
        let cfg = config(&e);
        let k = DataKey::Autopilot(user.clone(), id);
        let ap: Autopilot = e.storage().persistent().get(&k).unwrap_or_else(|| panic_with_error!(&e, RouterError::NoAutopilot));
        extend(&e, &k);
        let reads = Reads::new(&e, &cfg);
        let now = e.ledger().sequence();
        let mut done = None;
        for (i, r) in ap.rules.iter().enumerate() {
            let idx = i as u32;
            if !ready(last_fired(&e, &user, id, idx), now, r.cooldown_ledgers) {
                continue;
            }
            let (h, states) = reads.evaluate_rule(&user, ap.account_id, &r);
            if !h {
                continue;
            }
            let Some(plan) = reads.plan(&user, ap.account_id, &r.action) else { continue };
            let ex = reads.run(&user, ap.account_id, id, idx, plan, &route);
            let lk = DataKey::LastFired(user.clone(), id, idx);
            e.storage().persistent().set(&lk, &now);
            extend(&e, &lk);
            let mut observed = Vec::new(&e);
            for s in states.iter() {
                observed.push_back(s.observed);
            }
            Fired { user: user.clone(), autopilot_id: id, rule_index: idx, kind: ex.kind.clone(), amount: ex.amount, from_hub: ex.from_hub, to_hub: ex.to_hub, observed }.publish(&e);
            done = Some(ex);
            break;
        }
        if let Some(policy) = instance_addr(&e, &DataKey::Policy) {
            SessionClient::new(&e, &policy).end_session(&user);
        }
        done
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::{testutils::Address as _, vec};

    const MAX_UTIL: i128 = 950_000_000_000_000_000_000_000_000;

    #[test]
    fn grain_snapping() {
        assert_eq!(floor_grain(319_903_025), 319_900_000);
        assert_eq!(ceil_grain(319_903_025), 320_000_000);
        assert_eq!(ceil_grain(320_000_000), 320_000_000);
        assert_eq!(floor_grain(-5), 0);
        // hub 2 as observed: 49.99 supplied, 12.00 borrowed, 37.99 cash, max util 95% -> cap 37.36, minus margin
        let w = withdrawable(499_900_441, 379_900_000, 499_900_441, 120_000_441, MAX_UTIL);
        assert!(w <= 373_500_000 && w >= 373_000_000, "{w}");
        assert_eq!(withdrawable(120_000_000, 379_900_000, 499_900_441, 120_000_441, MAX_UTIL), 120_000_000);
        assert_eq!(withdrawable(500_000_000, 379_900_000, 499_900_441, 0, MAX_UTIL), 379_800_000);
    }

    #[test]
    fn amount_resolution() {
        let base = 373_400_000;
        assert_eq!(resolve(&Amount::All, base), base);
        assert_eq!(resolve(&Amount::Percent(5_000), base), 186_700_000);
        assert_eq!(resolve(&Amount::Percent(10_000), base), base);
        assert_eq!(resolve(&Amount::Percent(3_333), 100_000_000), 33_300_000);
        assert_eq!(resolve(&Amount::Fixed(50_000_000), base), 50_000_000);
        assert_eq!(resolve(&Amount::Fixed(9_000_000_000), base), base);
        assert_eq!(resolve(&Amount::Fixed(50_012_345), base), 50_000_000);
        assert_eq!(resolve(&Amount::All, 0), 0);
        assert_eq!(resolve(&Amount::Percent(1), 100_000), 0);
    }

    #[test]
    fn comparators_cooldown_staleness() {
        assert!(holds(Cmp::Below, 1_180_000_000_000_000_000, 1_250_000_000_000_000_000));
        assert!(!holds(Cmp::Below, 1_250_000_000_000_000_000, 1_250_000_000_000_000_000));
        assert!(holds(Cmp::AtOrAbove, 50, 50));
        assert!(!holds(Cmp::AtOrAbove, 49, 50));
        assert!(ready(0, 5, 100));
        assert!(!ready(1000, 1050, 100));
        assert!(ready(1000, 1100, 100));
        assert!(is_stale(1000, 100, 600));
        assert!(!is_stale(1000, 900, 600));
        assert!(!is_stale(100, 1000, 600));
    }

    fn rule(_e: &Env, conditions: Vec<Condition>, action: Action) -> Rule {
        Rule { conditions, match_all: true, action, cooldown_ledgers: 60 }
    }

    fn lira_shield(e: &Env) -> Autopilot {
        Autopilot {
            account_id: 12,
            rules: vec![
                e,
                rule(e, vec![e, Condition::HealthFactor(Cmp::Below, 1_250_000_000_000_000_000)], Action::RepayFromWallet(1, Amount::All)),
                rule(e, vec![e, Condition::SupplyRateGap(2, 1, 100)], Action::MoveSupply(1, 2, Amount::All)),
                rule(e, vec![e, Condition::SupplyRateGap(1, 2, 100)], Action::MoveSupply(2, 1, Amount::All)),
                rule(e, vec![e, Condition::FxPrice(Symbol::new(e, "TRY"), Cmp::Below, 2_000_000_000_000, 900)], Action::WithdrawToWallet(1, Amount::All)),
                rule(e, vec![e, Condition::FxPrice(Symbol::new(e, "TRY"), Cmp::Below, 2_000_000_000_000, 900)], Action::WithdrawToWallet(2, Amount::All)),
            ],
        }
    }

    #[test]
    fn validation() {
        let e = Env::default();
        assert!(autopilot_ok(&lira_shield(&e)));
        let bad = |rules: Vec<Rule>| !autopilot_ok(&Autopilot { account_id: 1, rules });
        assert!(bad(vec![&e]));
        assert!(bad(vec![&e, rule(&e, vec![&e], Action::WithdrawToWallet(1, Amount::All))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::SupplyRateGap(1, 1, 100)], Action::WithdrawToWallet(1, Amount::All))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::MoveSupply(1, 1, Amount::All))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::WithdrawToWallet(1, Amount::Percent(0)))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::WithdrawToWallet(1, Amount::Percent(10_001)))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::WithdrawToWallet(1, Amount::Fixed(MIN_MOVE - 1)))]));
        assert!(bad(vec![&e, rule(&e, vec![&e, Condition::FxPrice(Symbol::new(&e, "TRY"), Cmp::Below, 1, 0)], Action::WithdrawToWallet(1, Amount::All))]));
        let mut r = rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::WithdrawToWallet(1, Amount::All));
        r.cooldown_ledgers = 0;
        assert!(bad(vec![&e, r]));
        let four = vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1), Condition::IdleBalance(Cmp::AtOrAbove, 2), Condition::IdleBalance(Cmp::AtOrAbove, 3), Condition::IdleBalance(Cmp::AtOrAbove, 4)];
        assert!(bad(vec![&e, rule(&e, four, Action::WithdrawToWallet(1, Amount::All))]));
        let one = rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 1)], Action::WithdrawToWallet(1, Amount::All));
        let mut full = Vec::new(&e);
        for _ in 0..MAX_RULES {
            full.push_back(one.clone());
        }
        assert!(!bad(full.clone()));
        full.push_back(one.clone());
        assert!(bad(full));
    }

    #[test]
    fn storage_and_registries() {
        let e = Env::default();
        e.mock_all_auths();
        let admin = Address::generate(&e);
        let id = e.register(KoulRouter, (&admin, &Address::generate(&e), &Address::generate(&e), &Address::generate(&e), &Address::generate(&e), 3u32));
        let c = KoulRouterClient::new(&e, &id);
        let alice = Address::generate(&e);
        let bob = Address::generate(&e);
        let ap = lira_shield(&e);
        assert_eq!(c.list_users(), Vec::<Address>::new(&e));
        assert_eq!(c.get_autopilot(&alice, &1), None);

        c.set_autopilot(&alice, &1, &ap);
        c.set_autopilot(&alice, &7, &ap);
        c.set_autopilot(&bob, &1, &ap);
        assert_eq!(c.get_autopilot(&alice, &7), Some(ap.clone()));
        assert_eq!(c.list_ids(&alice), vec![&e, 1, 7]);
        assert_eq!(c.list_users(), vec![&e, alice.clone(), bob.clone()]);

        c.set_autopilot(&alice, &1, &ap);
        assert_eq!(c.list_ids(&alice), vec![&e, 1, 7]);

        c.clear_autopilot(&alice, &1);
        assert_eq!(c.get_autopilot(&alice, &1), None);
        assert_eq!(c.list_ids(&alice), vec![&e, 7]);
        assert_eq!(c.list_users(), vec![&e, alice.clone(), bob.clone()]);
        c.clear_autopilot(&alice, &7);
        assert_eq!(c.list_ids(&alice), Vec::<u32>::new(&e));
        assert_eq!(c.list_users(), vec![&e, bob.clone()]);

        assert_eq!(c.try_clear_autopilot(&alice, &7), Err(Ok(soroban_sdk::Error::from_contract_error(RouterError::NoAutopilot as u32))));
        let bad = Autopilot { account_id: 1, rules: vec![&e] };
        assert_eq!(c.try_set_autopilot(&alice, &1, &bad), Err(Ok(soroban_sdk::Error::from_contract_error(RouterError::BadAutopilot as u32))));
        assert_eq!(c.try_tick(&alice, &1, &None), Err(Ok(soroban_sdk::Error::from_contract_error(RouterError::NoAutopilot as u32))));
    }
}

#[cfg(test)]
mod tick_test {
    use super::*;
    use soroban_sdk::testutils::{Address as _, Events, Ledger};
    use soroban_sdk::{vec, xdr::ToXdr};

    #[contracttype]
    pub enum MK {
        Hf,
        Coll(u32),
        Debt(u32),
        Rate(u32),
        Liq,
        Price,
    }

    #[contract]
    pub struct MockController;

    #[contractimpl]
    impl MockController {
        pub fn set(e: Env, hf: i128, coll1: i128, coll2: i128, debt1: i128, debt2: i128) {
            e.storage().instance().set(&MK::Hf, &hf);
            e.storage().instance().set(&MK::Coll(1), &coll1);
            e.storage().instance().set(&MK::Coll(2), &coll2);
            e.storage().instance().set(&MK::Debt(1), &debt1);
            e.storage().instance().set(&MK::Debt(2), &debt2);
        }
        pub fn withdraw(e: Env, _caller: Address, _account_id: u64, withdrawals: Vec<(HubAssetKey, i128)>, _to: Option<Address>) -> Vec<(HubAssetKey, i128)> {
            for (k, a) in withdrawals.iter() {
                let c: i128 = e.storage().instance().get(&MK::Coll(k.hub_id)).unwrap_or(0);
                assert!(a <= c, "withdraw above collateral");
                e.storage().instance().set(&MK::Coll(k.hub_id), &(c - a));
            }
            withdrawals
        }
        pub fn supply(e: Env, _caller: Address, _account_id: u64, _spoke_id: u32, assets: Vec<(HubAssetKey, i128)>) -> u64 {
            for (k, a) in assets.iter() {
                let c: i128 = e.storage().instance().get(&MK::Coll(k.hub_id)).unwrap_or(0);
                e.storage().instance().set(&MK::Coll(k.hub_id), &(c + a));
            }
            12
        }
        pub fn repay(e: Env, _caller: Address, _account_id: u64, payments: Vec<(HubAssetKey, i128)>) {
            for (k, a) in payments.iter() {
                let d: i128 = e.storage().instance().get(&MK::Debt(k.hub_id)).unwrap_or(0);
                e.storage().instance().set(&MK::Debt(k.hub_id), &(if a >= d { 0 } else { d - a }));
            }
        }
        pub fn get_health_factor(e: Env, _account_id: u64) -> i128 {
            e.storage().instance().get(&MK::Hf).unwrap()
        }
        pub fn get_collateral_amount(e: Env, _account_id: u64, hub_asset: HubAssetKey) -> i128 {
            e.storage().instance().get(&MK::Coll(hub_asset.hub_id)).unwrap_or(0)
        }
        pub fn get_borrow_amount(e: Env, _account_id: u64, hub_asset: HubAssetKey) -> i128 {
            e.storage().instance().get(&MK::Debt(hub_asset.hub_id)).unwrap_or(0)
        }
    }

    #[contract]
    pub struct MockPool;

    #[contractimpl]
    impl MockPool {
        pub fn set_rates(e: Env, rate1: i128, rate2: i128) {
            e.storage().instance().set(&MK::Rate(1), &rate1);
            e.storage().instance().set(&MK::Rate(2), &rate2);
        }
        pub fn set_liquidity(e: Env, cash: i128, supplied: i128, borrowed: i128) {
            e.storage().instance().set(&MK::Liq, &(cash, supplied, borrowed));
        }
        pub fn get_deposit_rate(e: Env, hub_asset: HubAssetKey) -> i128 {
            e.storage().instance().get(&MK::Rate(hub_asset.hub_id)).unwrap_or(0)
        }
        pub fn get_sync_data(e: Env, hub_asset: HubAssetKey) -> PoolSyncData {
            let (cash, supplied, borrowed): (i128, i128, i128) = e.storage().instance().get(&MK::Liq).unwrap();
            PoolSyncData {
                params: MarketParamsRaw {
                    asset_decimals: 7,
                    asset_id: hub_asset.asset,
                    base_borrow_rate: 0,
                    flashloan_fee: 0,
                    is_flashloanable: false,
                    max_borrow_rate: 0,
                    max_utilization: 950_000_000_000_000_000_000_000_000,
                    mid_utilization: 0,
                    optimal_utilization: 0,
                    reserve_factor: 0,
                    slope1: 0,
                    slope2: 0,
                    slope3: 0,
                },
                state: PoolStateRaw { borrow_index: 0, borrowed, cash, last_timestamp: 0, revenue: 0, supplied, supply_index: 0 },
            }
        }
        pub fn get_supplied_amount(e: Env, _hub_asset: HubAssetKey) -> i128 {
            let (_, supplied, _): (i128, i128, i128) = e.storage().instance().get(&MK::Liq).unwrap();
            supplied
        }
        pub fn get_borrowed_amount(e: Env, _hub_asset: HubAssetKey) -> i128 {
            let (_, _, borrowed): (i128, i128, i128) = e.storage().instance().get(&MK::Liq).unwrap();
            borrowed
        }
    }

    #[contract]
    pub struct MockOracle;

    #[contractimpl]
    impl MockOracle {
        pub fn set_price(e: Env, price: i128, timestamp: u64) {
            e.storage().instance().set(&MK::Price, &PriceData { price, timestamp });
        }
        pub fn lastprice(e: Env, _asset: OracleAsset) -> Option<PriceData> {
            e.storage().instance().get(&MK::Price)
        }
    }

    const USDC: i128 = 10_000_000;
    const WAD: i128 = 1_000_000_000_000_000_000;
    const HF_LEVEL: i128 = 1_250_000_000_000_000_000;
    const TRY_LEVEL: i128 = 2_000_000_000_000;

    struct World<'a> {
        router: KoulRouterClient<'a>,
        controller: MockControllerClient<'a>,
        pool: MockPoolClient<'a>,
        oracle: MockOracleClient<'a>,
        usdc: soroban_sdk::token::StellarAssetClient<'a>,
        user: Address,
    }

    fn world(e: &Env) -> World<'_> {
        e.mock_all_auths();
        e.ledger().set_sequence_number(1000);
        e.ledger().set_timestamp(10_000);
        let admin = Address::generate(e);
        let controller_id = e.register(MockController, ());
        let pool_id = e.register(MockPool, ());
        let oracle_id = e.register(MockOracle, ());
        let usdc_id = e.register_stellar_asset_contract_v2(admin.clone()).address();
        let router_id = e.register(KoulRouter, (&admin, &controller_id, &pool_id, &usdc_id, &oracle_id, 3u32));
        let w = World {
            router: KoulRouterClient::new(e, &router_id),
            controller: MockControllerClient::new(e, &controller_id),
            pool: MockPoolClient::new(e, &pool_id),
            oracle: MockOracleClient::new(e, &oracle_id),
            usdc: soroban_sdk::token::StellarAssetClient::new(e, &usdc_id),
            user: Address::generate(e),
        };
        w.pool.set_liquidity(&(1_000 * USDC), &(1_000 * USDC), &0);
        w.pool.set_rates(&(100 * BPS_RAY), &(300 * BPS_RAY));
        w.oracle.set_price(&2_100_000_000_000, &10_000);
        w.controller.set(&(1_180_000_000_000_000_000), &(100 * USDC), &0, &(20 * USDC), &0);
        w
    }

    fn rule(_e: &Env, conditions: Vec<Condition>, match_all: bool, action: Action, cooldown_ledgers: u32) -> Rule {
        Rule { conditions, match_all, action, cooldown_ledgers }
    }

    fn shield(e: &Env) -> Autopilot {
        Autopilot {
            account_id: 12,
            rules: vec![
                e,
                rule(e, vec![e, Condition::HealthFactor(Cmp::Below, HF_LEVEL)], true, Action::RepayFromWallet(1, Amount::All), 10),
                rule(e, vec![e, Condition::SupplyRateGap(2, 1, 100)], true, Action::MoveSupply(1, 2, Amount::All), 100),
                rule(e, vec![e, Condition::FxPrice(Symbol::new(e, "TRY"), Cmp::Below, TRY_LEVEL, 900)], true, Action::WithdrawToWallet(2, Amount::Percent(5_000)), 10),
            ],
        }
    }

    #[test]
    fn first_true_rule_with_a_real_amount_fires() {
        let e = Env::default();
        let w = world(&e);
        w.router.set_autopilot(&w.user, &1, &shield(&e));

        // Rule 0 holds (hf 1.18 < 1.25) but the wallet is empty, so it resolves to nothing and rule 1 runs.
        let ex = w.router.tick(&w.user, &1, &None).unwrap();
        assert_eq!(e.events().all().filter_by_contract(&w.router.address).events().len(), 1);
        assert_eq!(ex, Executed { rule_index: 1, kind: Symbol::new(&e, "move_supply"), amount: 100 * USDC, from_hub: 1, to_hub: 2 });
        assert_eq!(w.controller.get_collateral_amount(&12, &HubAssetKey { asset: w.usdc.address.clone(), hub_id: 2 }), 100 * USDC);

        // Same ledger: rule 0 still empty, rule 1 cooling down, rule 2 price 0.021 is not below 0.020.
        assert_eq!(w.router.tick(&w.user, &1, &None), None);
        let st = w.router.check(&w.user, &1);
        assert_eq!(st.len(), 3);
        assert!(st.get(0).unwrap().holds && st.get(0).unwrap().ready);
        assert_eq!(st.get(0).unwrap().conditions.get(0).unwrap().observed, 1_180_000_000_000_000_000);
        assert!(st.get(1).unwrap().holds && !st.get(1).unwrap().ready);
        assert_eq!(st.get(1).unwrap().last_fired, 1000);
        assert_eq!(st.get(1).unwrap().conditions.get(0).unwrap().observed, 200);
        assert!(!st.get(2).unwrap().holds && st.get(2).unwrap().ready);

        // Idle USDC arrives: rule 0 repays the whole debt rounded up one grain, capped by the wallet.
        w.usdc.mint(&w.user, &(15 * USDC));
        let ex = w.router.tick(&w.user, &1, &None).unwrap();
        assert_eq!(ex, Executed { rule_index: 0, kind: Symbol::new(&e, "repay_wallet"), amount: 15 * USDC, from_hub: 1, to_hub: 1 });
        assert_eq!(w.controller.get_borrow_amount(&12, &HubAssetKey { asset: w.usdc.address.clone(), hub_id: 1 }), 5 * USDC);
        assert_eq!(w.router.tick(&w.user, &1, &None), None);

        // Cooldown of rule 0 passes: the remaining 5 USDC + one grain is repaid.
        e.ledger().set_sequence_number(1010);
        e.ledger().set_timestamp(10_100);
        let ex = w.router.tick(&w.user, &1, &None).unwrap();
        assert_eq!(ex.amount, 5 * USDC + GRAIN);

        // FX shock, fresh price: rule 2 withdraws half of hub 2.
        e.ledger().set_sequence_number(1020);
        w.oracle.set_price(&1_900_000_000_000, &10_100);
        let ex = w.router.tick(&w.user, &1, &None).unwrap();
        assert_eq!(ex, Executed { rule_index: 2, kind: Symbol::new(&e, "withdraw"), amount: 50 * USDC, from_hub: 2, to_hub: 2 });

        // Stale price never matches even though the level is crossed.
        e.ledger().set_sequence_number(1040);
        e.ledger().set_timestamp(20_000);
        assert_eq!(w.router.tick(&w.user, &1, &None), None);
        let st = w.router.check(&w.user, &1);
        assert!(!st.get(2).unwrap().holds);
        assert_eq!(st.get(2).unwrap().conditions.get(0).unwrap().observed, 1_900_000_000_000);
    }

    #[test]
    fn a_hub_rate_against_a_level() {
        let e = Env::default();
        let w = world(&e);
        w.controller.set(&(2 * WAD), &0, &0, &0, &0);
        w.usdc.mint(&w.user, &(20 * USDC));
        // Hub 2 pays 300 bps, hub 1 pays 100 bps (set in `world`).
        let ap = Autopilot {
            account_id: 12,
            rules: vec![
                &e,
                rule(&e, vec![&e, Condition::SupplyRate(2, Cmp::AtOrAbove, 500)], true, Action::SupplyFromWallet(2, Amount::All), 10),
                rule(&e, vec![&e, Condition::SupplyRate(2, Cmp::AtOrAbove, 250)], true, Action::SupplyFromWallet(2, Amount::All), 10),
            ],
        };
        w.router.set_autopilot(&w.user, &4, &ap);
        let st = w.router.check(&w.user, &4);
        assert_eq!(st.get(0).unwrap().conditions.get(0).unwrap().observed, 300);
        assert!(!st.get(0).unwrap().holds, "300 bps is not at or above 500");
        assert!(st.get(1).unwrap().holds, "300 bps is at or above 250");
        let ex = w.router.tick(&w.user, &4, &None).unwrap();
        assert_eq!(ex.rule_index, 1);
        assert_eq!(ex.amount, 20 * USDC);
    }

    #[test]
    fn supply_from_wallet_opens_a_position() {
        let e = Env::default();
        let w = world(&e);
        w.controller.set(&(2 * WAD), &0, &0, &0, &0);
        let ap = Autopilot {
            account_id: 12,
            rules: vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 10 * USDC)], true, Action::SupplyFromWallet(2, Amount::All), 10)],
        };
        w.router.set_autopilot(&w.user, &3, &ap);
        // Nothing in the wallet yet: the condition is false and the action has nothing to put to work.
        assert_eq!(w.router.tick(&w.user, &3, &None), None);
        w.usdc.mint(&w.user, &(25 * USDC));
        let ex = w.router.tick(&w.user, &3, &None).unwrap();
        assert_eq!(ex, Executed { rule_index: 0, kind: Symbol::new(&e, "supply"), amount: 25 * USDC, from_hub: 2, to_hub: 2 });
        assert_eq!(w.controller.get_collateral_amount(&12, &HubAssetKey { asset: w.usdc.address.clone(), hub_id: 2 }), 25 * USDC);
    }

    #[test]
    fn any_and_all_and_repay_with_collateral() {
        let e = Env::default();
        let w = world(&e);
        let ap = Autopilot {
            account_id: 12,
            rules: vec![
                &e,
                rule(&e, vec![&e, Condition::HealthFactor(Cmp::Below, HF_LEVEL), Condition::IdleBalance(Cmp::AtOrAbove, 1_000 * USDC)], true, Action::RepayFromWallet(1, Amount::All), 10),
                rule(&e, vec![&e, Condition::HealthFactor(Cmp::Below, HF_LEVEL), Condition::IdleBalance(Cmp::AtOrAbove, 1_000 * USDC)], false, Action::RepayWithCollateral(1, 1, Amount::Fixed(8 * USDC)), 10),
            ],
        };
        w.router.set_autopilot(&w.user, &2, &ap);
        let st = w.router.check(&w.user, &2);
        assert!(!st.get(0).unwrap().holds);
        assert!(st.get(1).unwrap().holds);
        let ex = w.router.tick(&w.user, &2, &None).unwrap();
        assert_eq!(ex, Executed { rule_index: 1, kind: Symbol::new(&e, "repay_collateral"), amount: 8 * USDC, from_hub: 1, to_hub: 1 });
        let k = HubAssetKey { asset: w.usdc.address.clone(), hub_id: 1 };
        assert_eq!(w.controller.get_collateral_amount(&12, &k), 92 * USDC);
        assert_eq!(w.controller.get_borrow_amount(&12, &k), 12 * USDC);
        // Replacing the autopilot resets the cooldown.
        w.router.set_autopilot(&w.user, &2, &ap);
        assert!(w.router.check(&w.user, &2).get(1).unwrap().ready);
    }

    #[test]
    fn illiquid_hub_caps_the_move() {
        let e = Env::default();
        let w = world(&e);
        w.pool.set_liquidity(&(30 * USDC), &(1_000 * USDC), &(900 * USDC));
        w.router.set_autopilot(&w.user, &1, &shield(&e));
        let ex = w.router.tick(&w.user, &1, &None).unwrap();
        assert_eq!(ex.rule_index, 1);
        assert_eq!(ex.amount, 30 * USDC - GRAIN);
        w.pool.set_liquidity(&(50 * USDC), &(1_000 * USDC), &(999 * USDC));
        w.controller.set(&(2 * WAD), &(100 * USDC), &0, &0, &0);
        e.ledger().set_sequence_number(2000);
        assert_eq!(w.router.tick(&w.user, &1, &None), None);
    }

    #[contract]
    pub struct MockAggregator;

    /// Pulls `total_in` of the route's input from the sender and pays `total_in * rate_ppm / 1e6` of its output.
    #[contractimpl]
    impl MockAggregator {
        pub fn set_rate(e: Env, rate_ppm: i128) {
            e.storage().instance().set(&MK::Price, &rate_ppm);
        }
        pub fn execute_strategy(e: Env, sender: Address, total_in: i128, swap_xdr: Bytes) -> i128 {
            sender.require_auth();
            let p = StrategyPayload::from_xdr(&e, &swap_xdr).unwrap();
            let tin = p.assets.get(p.ops.get(1).unwrap() as u32).unwrap();
            let tout = p.assets.get(p.ops.get(2).unwrap() as u32).unwrap();
            let rate: i128 = e.storage().instance().get(&MK::Price).unwrap();
            let me = e.current_contract_address();
            token::TokenClient::new(&e, &tin).transfer(&sender, &me, &total_in);
            let out = total_in * rate / 1_000_000;
            token::TokenClient::new(&e, &tout).transfer(&me, &sender, &out);
            out
        }
    }

    #[contract]
    pub struct MockPolicy;

    #[contractimpl]
    impl MockPolicy {
        pub fn end_session(e: Env, _smart_account: Address) {
            let n: u32 = e.storage().instance().get(&MK::Liq).unwrap_or(0);
            e.storage().instance().set(&MK::Liq, &(n + 1));
        }
        pub fn ended(e: Env) -> u32 {
            e.storage().instance().get(&MK::Liq).unwrap_or(0)
        }
    }

    const XLM_PRICE: i128 = 17_000_000_000_000; // 0.17 USD

    struct Swaps<'a> {
        xlm: soroban_sdk::token::StellarAssetClient<'a>,
        aggregator: MockAggregatorClient<'a>,
        policy: MockPolicyClient<'a>,
    }

    fn swaps<'a>(e: &'a Env, w: &World<'a>) -> Swaps<'a> {
        let xlm = e.register_stellar_asset_contract_v2(Address::generate(e)).address();
        let s = Swaps {
            xlm: soroban_sdk::token::StellarAssetClient::new(e, &xlm),
            aggregator: MockAggregatorClient::new(e, &e.register(MockAggregator, ())),
            policy: MockPolicyClient::new(e, &e.register(MockPolicy, ())),
        };
        w.router.set_feed(&w.usdc.address, &Feed { source: PriceSource::Fixed(PRICE_ONE), decimals: 7 });
        w.router.set_feed(&xlm, &Feed { source: PriceSource::Fixed(XLM_PRICE), decimals: 7 });
        w.router.set_aggregator(&s.aggregator.address);
        w.router.set_policy(&s.policy.address);
        w.usdc.mint(&s.aggregator.address, &(10_000 * USDC));
        s.xlm.mint(&s.aggregator.address, &(10_000 * USDC));
        s
    }

    /// A one-op route over `tin -> tout` in the aggregator's wire format; the router reads only the pair.
    fn route(e: &Env, tin: &Address, tout: &Address) -> Bytes {
        let ops = Bytes::from_array(e, &[1, 1, 2, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 2]);
        let pool = Address::generate(e);
        StrategyPayload { amounts: vec![e, 1], assets: vec![e, pool, tin.clone(), tout.clone()], ops }.to_xdr(e)
    }

    fn err<T>(code: RouterError) -> Result<T, Result<soroban_sdk::Error, soroban_sdk::InvokeError>> {
        Err(Ok(soroban_sdk::Error::from_contract_error(code as u32)))
    }

    #[test]
    fn floor_math() {
        // 50 XLM at 0.17 USD into USDC at 1.00, 1% slippage: 8.5 USDC expected, 8.415 floor.
        assert_eq!(swap_floor(50 * USDC, 7, XLM_PRICE, 7, PRICE_ONE, 100), 84_150_000);
        // 10 USDC into XLM: 58.82 XLM expected, 2% below.
        assert_eq!(swap_floor(10 * USDC, 7, PRICE_ONE, 7, XLM_PRICE, 200), 576_470_588);
        // An 18-decimal output token.
        assert_eq!(swap_floor(USDC, 7, PRICE_ONE, 18, 2 * PRICE_ONE, 0), 500_000_000_000_000_000);
        assert_eq!(usd_value(5 * USDC, 7, XLM_PRICE), 85_000_000_000_000);
        // 0.0016 ETH at 2338 USD is 3.74 USD: worth swapping, though far under 0.01 ETH.
        assert_eq!(usd_value(16_000, 7, 233_800_000_000_000_000), 374_080_000_000_000);
    }

    #[test]
    fn swap_from_wallet_checks_the_route_and_its_own_floor() {
        let e = Env::default();
        let w = world(&e);
        w.controller.set(&(2 * WAD), &0, &0, &0, &0);
        let s = swaps(&e, &w);
        let xlm = s.xlm.address.clone();
        let ap = Autopilot {
            account_id: 12,
            rules: vec![&e, rule(&e, vec![&e, Condition::TokenBalance(xlm.clone(), Cmp::AtOrAbove, 10 * USDC)], true, Action::SwapFromWallet(xlm.clone(), w.usdc.address.clone(), Amount::All, 100), 10)],
        };
        w.router.set_autopilot(&w.user, &5, &ap);
        assert_eq!(w.router.next_action(&w.user, &5), None);

        s.xlm.mint(&w.user, &(50 * USDC + 12_345));
        let planned = w.router.next_action(&w.user, &5).unwrap();
        // The whole balance, to the stroop: nothing snapped off a wallet swap.
        assert_eq!(planned, Planned { rule_index: 0, kind: Symbol::new(&e, "swap"), amount: 50 * USDC + 12_345, needs_route: true, token_in: xlm.clone(), token_out: w.usdc.address.clone(), min_out: swap_floor(50 * USDC + 12_345, 7, XLM_PRICE, 7, PRICE_ONE, 100) });

        assert_eq!(w.router.try_tick(&w.user, &5, &None), err(RouterError::RouteRequired));
        assert_eq!(w.router.try_tick(&w.user, &5, &Some(route(&e, &w.usdc.address, &xlm))), err(RouterError::RouteMismatch));
        // Bytes that are not XDR at all fail in the host's decoder; either way nothing moves.
        assert!(w.router.try_tick(&w.user, &5, &Some(Bytes::from_array(&e, &[1, 2, 3]))).is_err());
        let not_a_route = Symbol::new(&e, "route").to_xdr(&e);
        assert_eq!(w.router.try_tick(&w.user, &5, &Some(not_a_route)), err(RouterError::RouteMismatch));
        // A route paying 0.168 USDC per XLM is 1.2% under the oracle: the router refuses it whatever the route claims.
        s.aggregator.set_rate(&168_000);
        assert_eq!(w.router.try_tick(&w.user, &5, &Some(route(&e, &xlm, &w.usdc.address))), err(RouterError::BelowFloor));

        s.aggregator.set_rate(&200_000);
        let ex = w.router.tick(&w.user, &5, &Some(route(&e, &xlm, &w.usdc.address))).unwrap();
        assert_eq!(ex, Executed { rule_index: 0, kind: Symbol::new(&e, "swap"), amount: 50 * USDC + 12_345, from_hub: 0, to_hub: 0 });
        assert_eq!(soroban_sdk::token::TokenClient::new(&e, &xlm).balance(&w.user), 0);
        assert_eq!(soroban_sdk::token::TokenClient::new(&e, &w.usdc.address).balance(&w.user), (50 * USDC + 12_345) / 5);
        assert_eq!(s.policy.ended(), 1);
        // Cooling down, and the wallet holds no more XLM: nothing more to do.
        assert_eq!(w.router.tick(&w.user, &5, &None), None);
        assert_eq!(s.policy.ended(), 2);
    }

    #[test]
    fn withdraw_and_swap_moves_collateral_out_of_the_hub() {
        let e = Env::default();
        let w = world(&e);
        w.controller.set(&(2 * WAD), &(100 * USDC), &0, &0, &0);
        let s = swaps(&e, &w);
        let xlm = s.xlm.address.clone();
        let ap = Autopilot {
            account_id: 12,
            rules: vec![&e, rule(&e, vec![&e, Condition::TokenPrice(xlm.clone(), Cmp::Below, 20_000_000_000_000)], true, Action::WithdrawAndSwap(1, xlm.clone(), Amount::Percent(5_000), 200), 10)],
        };
        w.router.set_autopilot(&w.user, &6, &ap);
        let st = w.router.check(&w.user, &6);
        assert_eq!(st.get(0).unwrap().conditions.get(0).unwrap().observed, XLM_PRICE);
        let planned = w.router.next_action(&w.user, &6).unwrap();
        assert_eq!(planned.kind, Symbol::new(&e, "withdraw_swap"));
        assert_eq!(planned.amount, 50 * USDC);
        assert_eq!(planned.min_out, swap_floor(50 * USDC, 7, PRICE_ONE, 7, XLM_PRICE, 200));
        // The mock controller only books the withdrawal; the wallet receives the USDC as the real one would pay it.
        w.usdc.mint(&w.user, &(50 * USDC));
        s.aggregator.set_rate(&6_000_000);
        let ex = w.router.tick(&w.user, &6, &Some(route(&e, &w.usdc.address, &xlm))).unwrap();
        assert_eq!(ex, Executed { rule_index: 0, kind: Symbol::new(&e, "withdraw_swap"), amount: 50 * USDC, from_hub: 1, to_hub: 0 });
        assert_eq!(w.controller.get_collateral_amount(&12, &HubAssetKey { asset: w.usdc.address.clone(), hub_id: 1 }), 50 * USDC);
        assert_eq!(soroban_sdk::token::TokenClient::new(&e, &xlm).balance(&w.user), 300 * USDC);
    }

    #[test]
    fn swap_rules_need_known_tokens_and_fresh_prices() {
        let e = Env::default();
        let w = world(&e);
        let stranger = Address::generate(&e);
        let swap = |t: &Address| Autopilot { account_id: 12, rules: vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 0)], true, Action::SwapFromWallet(t.clone(), w.usdc.address.clone(), Amount::All, 100), 10)] };
        // No feeds and no aggregator yet.
        assert_eq!(w.router.try_set_autopilot(&w.user, &7, &swap(&stranger)), err(RouterError::UnknownToken));
        let s = swaps(&e, &w);
        assert_eq!(w.router.try_set_autopilot(&w.user, &7, &swap(&stranger)), err(RouterError::UnknownToken));
        let bad = Autopilot { account_id: 12, rules: vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 0)], true, Action::SwapFromWallet(s.xlm.address.clone(), s.xlm.address.clone(), Amount::All, 100), 10)] };
        assert_eq!(w.router.try_set_autopilot(&w.user, &7, &bad), err(RouterError::BadAutopilot));

        // An oracle feed older than its limit: the price condition is false and the swap plans nothing.
        w.router.set_feed(&s.xlm.address, &Feed { source: PriceSource::Oracle(w.oracle.address.clone(), OracleAsset::Other(Symbol::new(&e, "XLM")), 300), decimals: 7 });
        w.oracle.set_price(&XLM_PRICE, &9_000);
        let ap = Autopilot { account_id: 12, rules: vec![&e, rule(&e, vec![&e, Condition::TokenPrice(s.xlm.address.clone(), Cmp::AtOrAbove, 1)], true, Action::SwapFromWallet(s.xlm.address.clone(), w.usdc.address.clone(), Amount::All, 100), 10)] };
        w.router.set_autopilot(&w.user, &7, &ap);
        s.xlm.mint(&w.user, &(50 * USDC));
        assert!(!w.router.check(&w.user, &7).get(0).unwrap().holds);
        w.oracle.set_price(&XLM_PRICE, &9_900);
        assert!(w.router.check(&w.user, &7).get(0).unwrap().holds);
        assert_eq!(w.router.next_action(&w.user, &7).unwrap().min_out, 84_150_000);
        // Worth under 1 USD: nothing to do.
        let ap = Autopilot { account_id: 12, rules: vec![&e, rule(&e, vec![&e, Condition::IdleBalance(Cmp::AtOrAbove, 0)], true, Action::SwapFromWallet(s.xlm.address.clone(), w.usdc.address.clone(), Amount::Fixed(5 * USDC), 100), 10)] };
        w.router.set_autopilot(&w.user, &8, &ap);
        assert_eq!(w.router.next_action(&w.user, &8), None);
    }
}
