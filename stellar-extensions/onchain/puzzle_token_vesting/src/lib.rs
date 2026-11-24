#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    Symbol,
};

const CANCELLATION_PENALTY_BPS: i128 = 1_000;
const BASIS_POINTS: i128 = 10_000;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Treasury,
    Grant(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum VestingType {
    Linear,
    Cliff,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingGrant {
    pub grant_id: u64,
    pub recipient: Address,
    pub token: Address,
    pub total_amount: i128,
    pub claimed_amount: i128,
    pub start_at: u64,
    pub cliff_at: u64,
    pub end_at: u64,
    pub vesting_type: VestingType,
    pub cancelled: bool,
    pub vested_at_cancel: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VestingStatus {
    pub total_amount: i128,
    pub vested_amount: i128,
    pub claimed_amount: i128,
    pub claimable_amount: i128,
    pub cancelled: bool,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    GrantAlreadyExists = 3,
    GrantNotFound = 4,
    InvalidSchedule = 5,
    InvalidAmount = 6,
    NothingToClaim = 7,
    GrantAlreadyCancelled = 8,
    TokenTransferFailed = 9,
    ArithmeticOverflow = 10,
}

#[contract]
pub struct PuzzleTokenVesting;

#[contractimpl]
impl PuzzleTokenVesting {
    pub fn init(env: Env, admin: Address, treasury: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Treasury, &treasury);
    }

    pub fn create_grant(
        env: Env,
        grant_id: u64,
        recipient: Address,
        token_address: Address,
        total_amount: i128,
        start_at: u64,
        cliff_at: u64,
        end_at: u64,
        vesting_type: VestingType,
    ) {
        let admin = Self::admin(&env);
        admin.require_auth();
        if env.storage().persistent().has(&DataKey::Grant(grant_id)) {
            panic_with_error!(&env, Error::GrantAlreadyExists);
        }
        if total_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }
        if start_at > cliff_at
            || cliff_at > end_at
            || (vesting_type == VestingType::Linear && start_at == end_at)
            || (vesting_type == VestingType::Cliff && cliff_at != end_at)
        {
            panic_with_error!(&env, Error::InvalidSchedule);
        }

        let token_client = token::Client::new(&env, &token_address);
        match token_client.try_transfer(&admin, &env.current_contract_address(), &total_amount) {
            Ok(Ok(())) => {}
            _ => panic_with_error!(&env, Error::TokenTransferFailed),
        }

        let grant = VestingGrant {
            grant_id,
            recipient: recipient.clone(),
            token: token_address,
            total_amount,
            claimed_amount: 0,
            start_at,
            cliff_at,
            end_at,
            vesting_type,
            cancelled: false,
            vested_at_cancel: 0,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Grant(grant_id), &grant);
        env.events().publish(
            (Symbol::new(&env, "vesting_grant_created"),),
            (grant_id, recipient, total_amount),
        );
    }

    pub fn claim(env: Env, grant_id: u64) -> i128 {
        let mut grant = Self::get_grant_or_panic(&env, grant_id);
        grant.recipient.require_auth();
        let vested = Self::vested_amount(&env, &grant);
        let claimable = vested
            .checked_sub(grant.claimed_amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        if claimable <= 0 {
            panic_with_error!(&env, Error::NothingToClaim);
        }

        let token_client = token::Client::new(&env, &grant.token);
        match token_client.try_transfer(
            &env.current_contract_address(),
            &grant.recipient,
            &claimable,
        ) {
            Ok(Ok(())) => {}
            _ => panic_with_error!(&env, Error::TokenTransferFailed),
        }
        grant.claimed_amount = grant
            .claimed_amount
            .checked_add(claimable)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage()
            .persistent()
            .set(&DataKey::Grant(grant_id), &grant);
        env.events().publish(
            (Symbol::new(&env, "vesting_tokens_claimed"),),
            (grant_id, grant.recipient, claimable),
        );
        claimable
    }

    pub fn cancel_grant(env: Env, grant_id: u64) {
        let admin = Self::admin(&env);
        admin.require_auth();
        let mut grant = Self::get_grant_or_panic(&env, grant_id);
        if grant.cancelled {
            panic_with_error!(&env, Error::GrantAlreadyCancelled);
        }

        let vested = Self::vested_amount(&env, &grant);
        let unvested = grant
            .total_amount
            .checked_sub(vested)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        let penalty = unvested
            .checked_mul(CANCELLATION_PENALTY_BPS)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow))
            / BASIS_POINTS;
        let refund = unvested
            .checked_sub(penalty)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        let token_client = token::Client::new(&env, &grant.token);
        if refund > 0 {
            match token_client.try_transfer(&env.current_contract_address(), &admin, &refund) {
                Ok(Ok(())) => {}
                _ => panic_with_error!(&env, Error::TokenTransferFailed),
            }
        }
        if penalty > 0 {
            let treasury: Address = env
                .storage()
                .instance()
                .get(&DataKey::Treasury)
                .unwrap_or_else(|| panic_with_error!(&env, Error::NotInitialized));
            match token_client.try_transfer(
                &env.current_contract_address(),
                &treasury,
                &penalty,
            ) {
                Ok(Ok(())) => {}
                _ => panic_with_error!(&env, Error::TokenTransferFailed),
            }
        }

        grant.cancelled = true;
        grant.vested_at_cancel = vested;
        env.storage()
            .persistent()
            .set(&DataKey::Grant(grant_id), &grant);
        env.events().publish(
            (Symbol::new(&env, "vesting_grant_cancelled"),),
            (grant_id, vested, refund, penalty),
        );
    }

    pub fn get_grant(env: Env, grant_id: u64) -> Option<VestingGrant> {
        env.storage().persistent().get(&DataKey::Grant(grant_id))
    }

    pub fn get_status(env: Env, grant_id: u64) -> Option<VestingStatus> {
        let grant: VestingGrant = env.storage().persistent().get(&DataKey::Grant(grant_id))?;
        let vested = Self::vested_amount(&env, &grant);
        let claimable = vested.saturating_sub(grant.claimed_amount);
        Some(VestingStatus {
            total_amount: grant.total_amount,
            vested_amount: vested,
            claimed_amount: grant.claimed_amount,
            claimable_amount: claimable,
            cancelled: grant.cancelled,
        })
    }

    fn vested_amount(env: &Env, grant: &VestingGrant) -> i128 {
        if grant.cancelled {
            return grant.vested_at_cancel;
        }
        let now = env.ledger().timestamp();
        if now < grant.cliff_at {
            return 0;
        }
        match grant.vesting_type {
            VestingType::Cliff => {
                if now >= grant.end_at {
                    grant.total_amount
                } else {
                    0
                }
            }
            VestingType::Linear => {
                if now >= grant.end_at {
                    return grant.total_amount;
                }
                let elapsed = (now - grant.start_at) as i128;
                let duration = (grant.end_at - grant.start_at) as i128;
                grant
                    .total_amount
                    .checked_mul(elapsed)
                    .unwrap_or_else(|| panic_with_error!(env, Error::ArithmeticOverflow))
                    / duration
            }
        }
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn get_grant_or_panic(env: &Env, grant_id: u64) -> VestingGrant {
        env.storage()
            .persistent()
            .get(&DataKey::Grant(grant_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::GrantNotFound))
    }
}

#[cfg(test)]
mod test;
