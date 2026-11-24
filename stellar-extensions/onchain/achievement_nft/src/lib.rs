#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol, Vec,
};

const MAX_QUERY_LIMIT: u32 = 100;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Minter(Address),
    NextTokenId,
    Nft(u64),
    Minted(Address, String),
    AchievementCount(String),
    AchievementIndex(String, u32),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AchievementNft {
    pub token_id: u64,
    pub owner: Address,
    pub achievement_type: String,
    pub name: String,
    pub tier: String,
    pub minted_at: u64,
    pub image_ipfs_hash: String,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    NotAuthorized = 3,
    DuplicateAchievement = 4,
    NftNotFound = 5,
    NotOwner = 6,
    InvalidQueryLimit = 7,
    ArithmeticOverflow = 8,
}

#[contract]
pub struct AchievementNftContract;

#[contractimpl]
impl AchievementNftContract {
    pub fn init(env: Env, admin: Address, minter: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage()
            .instance()
            .set(&DataKey::Minter(minter), &true);
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &1_u64);
    }

    pub fn grant_minter(env: Env, minter: Address) {
        Self::admin(&env).require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Minter(minter.clone()), &true);
        env.events()
            .publish((Symbol::new(&env, "minter_granted"),), (minter,));
    }

    pub fn mint_achievement(
        env: Env,
        minter: Address,
        recipient: Address,
        achievement_type: String,
        name: String,
        tier: String,
        image_ipfs_hash: String,
    ) -> u64 {
        minter.require_auth();
        if !env
            .storage()
            .instance()
            .get(&DataKey::Minter(minter.clone()))
            .unwrap_or(false)
        {
            panic_with_error!(&env, Error::NotAuthorized);
        }

        let minted_key = DataKey::Minted(recipient.clone(), achievement_type.clone());
        if env.storage().persistent().has(&minted_key) {
            panic_with_error!(&env, Error::DuplicateAchievement);
        }

        let token_id: u64 = env
            .storage()
            .instance()
            .get(&DataKey::NextTokenId)
            .unwrap_or(1);
        let next_id = token_id
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        let nft = AchievementNft {
            token_id,
            owner: recipient.clone(),
            achievement_type: achievement_type.clone(),
            name: name.clone(),
            tier,
            minted_at: env.ledger().timestamp(),
            image_ipfs_hash,
        };

        env.storage().persistent().set(&minted_key, &token_id);
        env.storage()
            .persistent()
            .set(&DataKey::Nft(token_id), &nft);
        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::AchievementCount(achievement_type.clone()))
            .unwrap_or(0);
        let next_count = count
            .checked_add(1)
            .unwrap_or_else(|| panic_with_error!(&env, Error::ArithmeticOverflow));
        env.storage().persistent().set(
            &DataKey::AchievementIndex(achievement_type.clone(), count),
            &token_id,
        );
        env.storage()
            .persistent()
            .set(&DataKey::AchievementCount(achievement_type), &next_count);
        env.storage()
            .instance()
            .set(&DataKey::NextTokenId, &next_id);
        env.events().publish(
            (Symbol::new(&env, "achievement_minted"),),
            (token_id, recipient, name),
        );
        token_id
    }

    pub fn transfer(env: Env, from: Address, to: Address, token_id: u64) {
        from.require_auth();
        let mut nft = Self::get_nft_or_panic(&env, token_id);
        if nft.owner != from {
            panic_with_error!(&env, Error::NotOwner);
        }
        nft.owner = to.clone();
        env.storage()
            .persistent()
            .set(&DataKey::Nft(token_id), &nft);
        env.events().publish(
            (Symbol::new(&env, "achievement_transferred"),),
            (token_id, from, to),
        );
    }

    pub fn get_nft(env: Env, token_id: u64) -> Option<AchievementNft> {
        env.storage().persistent().get(&DataKey::Nft(token_id))
    }

    pub fn has_minted(env: Env, owner: Address, achievement_type: String) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Minted(owner, achievement_type))
    }

    pub fn get_by_achievement_type(
        env: Env,
        achievement_type: String,
        offset: u32,
        limit: u32,
    ) -> Vec<AchievementNft> {
        if limit == 0 || limit > MAX_QUERY_LIMIT {
            panic_with_error!(&env, Error::InvalidQueryLimit);
        }
        let count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::AchievementCount(achievement_type.clone()))
            .unwrap_or(0);
        let mut result = Vec::new(&env);
        let end = core::cmp::min(offset.saturating_add(limit), count);
        for index in offset..end {
            let token_id: u64 = env
                .storage()
                .persistent()
                .get(&DataKey::AchievementIndex(achievement_type.clone(), index))
                .unwrap();
            if let Some(nft) = env.storage().persistent().get(&DataKey::Nft(token_id)) {
                result.push_back(nft);
            }
        }
        result
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn get_nft_or_panic(env: &Env, token_id: u64) -> AchievementNft {
        env.storage()
            .persistent()
            .get(&DataKey::Nft(token_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::NftNotFound))
    }
}

#[cfg(test)]
mod test;
