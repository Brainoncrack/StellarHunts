#![cfg_attr(not(test), no_std)]

use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, String,
    Symbol, Vec,
};

const MAX_BATCH_SIZE: u32 = 50;

#[contracttype]
#[derive(Clone)]
enum DataKey {
    Admin,
    Puzzle(u64),
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Puzzle {
    pub puzzle_id: u64,
    pub encrypted_content: String,
    pub reveal_at: u64,
    pub revealed: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PuzzleReveal {
    pub puzzle_id: u64,
    pub encrypted_content: String,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    PuzzleAlreadyExists = 3,
    PuzzleNotFound = 4,
    RevealTooEarly = 5,
    AlreadyRevealed = 6,
    BatchTooLarge = 7,
}

#[contract]
pub struct PuzzleTimeLock;

#[contractimpl]
impl PuzzleTimeLock {
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }
        admin.require_auth();
        env.storage().instance().set(&DataKey::Admin, &admin);
    }

    pub fn add_puzzle(
        env: Env,
        puzzle_id: u64,
        encrypted_content: String,
        reveal_at: u64,
    ) {
        Self::admin(&env).require_auth();
        if env.storage().persistent().has(&DataKey::Puzzle(puzzle_id)) {
            panic_with_error!(&env, Error::PuzzleAlreadyExists);
        }
        let puzzle = Puzzle {
            puzzle_id,
            encrypted_content,
            reveal_at,
            revealed: false,
        };
        env.storage()
            .persistent()
            .set(&DataKey::Puzzle(puzzle_id), &puzzle);
        env.events().publish(
            (Symbol::new(&env, "puzzle_locked"),),
            (puzzle_id, reveal_at),
        );
    }

    pub fn set_reveal_time(env: Env, puzzle_id: u64, reveal_at: u64) {
        Self::admin(&env).require_auth();
        let mut puzzle = Self::get_puzzle_or_panic(&env, puzzle_id);
        if puzzle.revealed {
            panic_with_error!(&env, Error::AlreadyRevealed);
        }
        puzzle.reveal_at = reveal_at;
        env.storage()
            .persistent()
            .set(&DataKey::Puzzle(puzzle_id), &puzzle);
        env.events().publish(
            (Symbol::new(&env, "puzzle_reveal_time_set"),),
            (puzzle_id, reveal_at),
        );
    }

    pub fn reveal_puzzle(env: Env, puzzle_id: u64) -> String {
        Self::reveal(&env, puzzle_id).encrypted_content
    }

    pub fn reveal_batch(env: Env, puzzle_ids: Vec<u64>) -> Vec<PuzzleReveal> {
        if puzzle_ids.len() > MAX_BATCH_SIZE {
            panic_with_error!(&env, Error::BatchTooLarge);
        }
        let mut reveals = Vec::new(&env);
        for index in 0..puzzle_ids.len() {
            let puzzle_id = puzzle_ids.get(index).unwrap();
            if env.storage().persistent().has(&DataKey::Puzzle(puzzle_id)) {
                let puzzle: Puzzle = env
                    .storage()
                    .persistent()
                    .get(&DataKey::Puzzle(puzzle_id))
                    .unwrap();
                if env.ledger().timestamp() >= puzzle.reveal_at {
                    let revealed = Self::reveal(&env, puzzle_id);
                    reveals.push_back(PuzzleReveal {
                        puzzle_id,
                        encrypted_content: revealed.encrypted_content,
                    });
                }
            } else {
                panic_with_error!(&env, Error::PuzzleNotFound);
            }
        }
        reveals
    }

    pub fn get_reveal_time(env: Env, puzzle_id: u64) -> Option<u64> {
        let puzzle: Option<Puzzle> = env.storage().persistent().get(&DataKey::Puzzle(puzzle_id));
        puzzle.map(|value| value.reveal_at)
    }

    pub fn is_revealed(env: Env, puzzle_id: u64) -> bool {
        env.storage()
            .persistent()
            .get::<_, Puzzle>(&DataKey::Puzzle(puzzle_id))
            .is_some_and(|puzzle| puzzle.revealed)
    }

    fn reveal(env: &Env, puzzle_id: u64) -> Puzzle {
        let mut puzzle = Self::get_puzzle_or_panic(env, puzzle_id);
        if env.ledger().timestamp() < puzzle.reveal_at {
            panic_with_error!(env, Error::RevealTooEarly);
        }
        if !puzzle.revealed {
            puzzle.revealed = true;
            env.storage()
                .persistent()
                .set(&DataKey::Puzzle(puzzle_id), &puzzle);
            env.events().publish(
                (Symbol::new(env, "puzzle_revealed"),),
                (puzzle_id, puzzle.reveal_at),
            );
        }
        puzzle
    }

    fn admin(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .unwrap_or_else(|| panic_with_error!(env, Error::NotInitialized))
    }

    fn get_puzzle_or_panic(env: &Env, puzzle_id: u64) -> Puzzle {
        env.storage()
            .persistent()
            .get(&DataKey::Puzzle(puzzle_id))
            .unwrap_or_else(|| panic_with_error!(env, Error::PuzzleNotFound))
    }
}

#[cfg(test)]
mod test;
