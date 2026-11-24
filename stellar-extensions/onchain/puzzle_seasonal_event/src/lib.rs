#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, token, Address, Env,
    String, Symbol, Vec,
};

const MAX_PARTICIPANTS: u32 = 100;
const MAX_REWARD_TIERS: u32 = 10;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    NextBadgeId,
    Event(u64),
    Leaderboard(u64),
    Badge(u64, Address),
    BadgeById(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LeaderboardEntry {
    pub participant: Address,
    pub score: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeasonalBadge {
    pub token_id: u64,
    pub season_id: u64,
    pub owner: Address,
    pub minted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SeasonalEvent {
    pub event_id: u64,
    pub name: String,
    pub starts_at: u64,
    pub ends_at: u64,
    pub reward_token: Address,
    pub reward_amounts: Vec<i128>,
    pub rewards_funded: i128,
    pub rewards_paid: i128,
    pub participants: u32,
    pub finalized: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EventStatus {
    Upcoming,
    Active,
    Ended,
    Finalized,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    EventAlreadyExists = 4,
    EventNotFound = 5,
    InvalidSchedule = 6,
    InvalidRewards = 7,
    EventNotActive = 8,
    InvalidScore = 9,
    ParticipantLimitReached = 10,
    EventAlreadyFinalized = 11,
    EventNotEnded = 12,
    InsufficientRewardFunding = 13,
    TokenTransferFailed = 14,
    ArithmeticOverflow = 15,
}

#[contract]
pub struct PuzzleSeasonalEvent;

#[contractimpl]
impl PuzzleSeasonalEvent {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::NextBadgeId, &0_u64);
    }

    pub fn create_event(
        env: Env,
        event_id: u64,
        name: String,
        starts_at: u64,
        ends_at: u64,
        reward_token: Address,
        reward_amounts: Vec<i128>,
    ) {
        let admin = Self::get_admin(&env);
        admin.require_auth();

        if env.storage().persistent().has(&DataKey::Event(event_id)) {
            panic_with_error!(&env, Error::EventAlreadyExists);
        }
        if starts_at >= ends_at {
            panic_with_error!(&env, Error::InvalidSchedule);
        }
        if reward_amounts.is_empty() || reward_amounts.len() > MAX_REWARD_TIERS {
            panic_with_error!(&env, Error::InvalidRewards);
        }
        for index in 0..reward_amounts.len() {
            if reward_amounts.get(index).unwrap() <= 0 {
                panic_with_error!(&env, Error::InvalidRewards);
            }
        }

        let event = SeasonalEvent {
            event_id,
            name,
            starts_at,
            ends_at,
            reward_token,
            reward_amounts,
            rewards_funded: 0,
            rewards_paid: 0,
            participants: 0,
            finalized: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Event(event_id), &event);
        env.storage()
            .persistent()
            .set(&DataKey::Leaderboard(event_id), &Vec::<LeaderboardEntry>::new(&env));
        env.events().publish((Symbol::new(&env, "event_created"),), (event_id,));
    }

    pub fn fund_rewards(env: Env, event_id: u64, funder: Address, amount: i128) {
        funder.require_auth();
        if amount <= 0 {
            panic_with_error!(&env, Error::InvalidRewards);
        }
        let mut event = Self::get_event_or_panic(&env, event_id);
        if event.finalized {
            panic_with_error!(&env, Error::EventAlreadyFinalized);
        }
        let total_funded = event
            .rewards_funded
            .checked_add(amount)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        let token_client = token::Client::new(&env, &event.reward_token);
        match token_client.try_transfer(&funder, &env.current_contract_address(), &amount) {
            Ok(Ok(())) => {}
            _ => panic_with_error!(&env, Error::TokenTransferFailed),
        }
        event.rewards_funded = total_funded;
        Self::save_event(&env, &event);
        env.events().publish(
            (Symbol::new(&env, "rewards_funded"),),
            (event_id, funder, amount),
        );
    }

    pub fn submit_score(env: Env, event_id: u64, participant: Address, score: i128) {
        Self::get_admin(&env).require_auth();
        if score < 0 {
            panic_with_error!(&env, Error::InvalidScore);
        }
        let mut event = Self::get_event_or_panic(&env, event_id);
        let now = env.ledger().timestamp();
        if event.finalized || now < event.starts_at || now >= event.ends_at {
            panic_with_error!(&env, Error::EventNotActive);
        }

        let leaderboard = Self::read_leaderboard(&env, event_id);
        let mut previous_score = None;
        let mut remaining = Vec::new(&env);
        for index in 0..leaderboard.len() {
            let entry = leaderboard.get(index).unwrap();
            if entry.participant == participant {
                previous_score = Some(entry.score);
            } else {
                remaining.push_back(entry);
            }
        }

        if previous_score.is_none() && leaderboard.len() >= MAX_PARTICIPANTS {
            panic_with_error!(&env, Error::ParticipantLimitReached);
        }
        if previous_score.is_some_and(|previous| score <= previous) {
            return;
        }

        let mut position = 0;
        while position < remaining.len() && remaining.get(position).unwrap().score >= score {
            position += 1;
        }
        let mut updated = Vec::new(&env);
        for index in 0..position {
            updated.push_back(remaining.get(index).unwrap());
        }
        updated.push_back(LeaderboardEntry {
            participant: participant.clone(),
            score,
        });
        for index in position..remaining.len() {
            updated.push_back(remaining.get(index).unwrap());
        }

        if previous_score.is_none() {
            event.participants = event
                .participants
                .checked_add(1)
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
            Self::save_event(&env, &event);
        }
        env.storage()
            .persistent()
            .set(&DataKey::Leaderboard(event_id), &updated);
        env.events().publish(
            (Symbol::new(&env, "score_submitted"),),
            (event_id, participant, score),
        );
    }

    pub fn distribute_rewards(env: Env, event_id: u64) {
        let mut event = Self::get_event_or_panic(&env, event_id);
        if event.finalized {
            panic_with_error!(&env, Error::EventAlreadyFinalized);
        }
        if env.ledger().timestamp() < event.ends_at {
            panic_with_error!(&env, Error::EventNotEnded);
        }

        let leaderboard = Self::read_leaderboard(&env, event_id);
        let winners = core::cmp::min(leaderboard.len(), event.reward_amounts.len());
        let mut payout_total = 0_i128;
        for rank in 0..winners {
            payout_total = payout_total
                .checked_add(event.reward_amounts.get(rank).unwrap())
                .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        }
        if event.rewards_funded < payout_total {
            panic_with_error!(&env, Error::InsufficientRewardFunding);
        }

        let token_client = token::Client::new(&env, &event.reward_token);
        let contract_address = env.current_contract_address();
        for rank in 0..winners {
            let entry = leaderboard.get(rank).unwrap();
            let amount = event.reward_amounts.get(rank).unwrap();
            match token_client.try_transfer(&contract_address, &entry.participant, &amount) {
                Ok(Ok(())) => {}
                _ => panic_with_error!(&env, Error::TokenTransferFailed),
            }
            env.events().publish(
                (Symbol::new(&env, "reward_paid"),),
                (event_id, entry.participant, amount, rank),
            );
        }

        for index in 0..leaderboard.len() {
            let entry = leaderboard.get(index).unwrap();
            let badge_key = DataKey::Badge(event_id, entry.participant.clone());
            if !env.storage().persistent().has(&badge_key) {
                let token_id: u64 = env
                    .storage()
                    .instance()
                    .get(&DataKey::NextBadgeId)
                    .unwrap_or(0);
                let next_id = token_id
                    .checked_add(1)
                    .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
                let badge = SeasonalBadge {
                    token_id,
                    season_id: event_id,
                    owner: entry.participant,
                    minted_at: env.ledger().timestamp(),
                };
                env.storage().persistent().set(&badge_key, &badge);
                env.storage()
                    .persistent()
                    .set(&DataKey::BadgeById(token_id), &badge);
                env.storage()
                    .instance()
                    .set(&DataKey::NextBadgeId, &next_id);
                env.events().publish(
                    (Symbol::new(&env, "season_badge_minted"),),
                    (event_id, badge.owner, token_id),
                );
            }
        }

        event.rewards_paid = payout_total;
        event.finalized = true;
        Self::save_event(&env, &event);
        env.events()
            .publish((Symbol::new(&env, "event_finalized"),), (event_id,));
    }

    pub fn get_event(env: Env, event_id: u64) -> Option<SeasonalEvent> {
        env.storage().persistent().get(&DataKey::Event(event_id))
    }

    pub fn get_event_status(env: Env, event_id: u64) -> Option<EventStatus> {
        let event: SeasonalEvent = env.storage().persistent().get(&DataKey::Event(event_id))?;
        if event.finalized {
            Some(EventStatus::Finalized)
        } else if env.ledger().timestamp() < event.starts_at {
            Some(EventStatus::Upcoming)
        } else if env.ledger().timestamp() < event.ends_at {
            Some(EventStatus::Active)
        } else {
            Some(EventStatus::Ended)
        }
    }

    pub fn get_leaderboard(env: Env, event_id: u64) -> Vec<LeaderboardEntry> {
        Self::read_leaderboard(&env, event_id)
    }

    pub fn get_badge(env: Env, event_id: u64, owner: Address) -> Option<SeasonalBadge> {
        env.storage()
            .persistent()
            .get(&DataKey::Badge(event_id, owner))
    }

    pub fn get_badge_by_id(env: Env, token_id: u64) -> Option<SeasonalBadge> {
        env.storage()
            .persistent()
            .get(&DataKey::BadgeById(token_id))
    }

    fn get_admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn get_event_or_panic(env: &Env, event_id: u64) -> SeasonalEvent {
        env.storage()
            .persistent()
            .get(&DataKey::Event(event_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::EventNotFound))
    }

    fn read_leaderboard(env: &Env, event_id: u64) -> Vec<LeaderboardEntry> {
        env.storage()
            .persistent()
            .get(&DataKey::Leaderboard(event_id))
            .unwrap_or_else(|| Vec::new(env))
    }

    fn save_event(env: &Env, event: &SeasonalEvent) {
        env.storage()
            .persistent()
            .set(&DataKey::Event(event.event_id), event);
    }
}

#[cfg(test)]
mod test;
