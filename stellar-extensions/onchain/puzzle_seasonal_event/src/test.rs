use super::*;
use soroban_sdk::{
    contract, contractimpl, contracttype,
    testutils::{Address as _, Ledger},
};

#[contracttype]
#[derive(Clone)]
enum TokenKey {
    Balance(Address),
}

#[contract]
struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn mint(env: Env, to: Address, amount: i128) {
        let balance: i128 = env
            .storage()
            .persistent()
            .get(&TokenKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(to), &(balance + amount));
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        let from_balance: i128 = env
            .storage()
            .persistent()
            .get(&TokenKey::Balance(from.clone()))
            .unwrap_or(0);
        if amount < 0 || from_balance < amount {
            panic!("insufficient mock token balance");
        }
        let to_balance: i128 = env
            .storage()
            .persistent()
            .get(&TokenKey::Balance(to.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(from), &(from_balance - amount));
        env.storage()
            .persistent()
            .set(&TokenKey::Balance(to), &(to_balance + amount));
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&TokenKey::Balance(id))
            .unwrap_or(0)
    }
}

fn setup() -> (
    Env,
    Address,
    Address,
    Address,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(100);

    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, PuzzleSeasonalEvent);
    let token_id = env.register_contract(None, MockToken);
    let client = PuzzleSeasonalEventClient::new(&env, &contract_id);
    client.init(&admin);

    let payouts = Vec::from_array(&env, [100_i128, 50_i128]);
    client.create_event(
        &7,
        &String::from_str(&env, "Spring Puzzle"),
        &100,
        &200,
        &token_id,
        &payouts,
    );

    (env, admin, contract_id, token_id)
}

#[test]
fn event_status_tracks_schedule_and_finalization() {
    let (env, _, contract_id, _) = setup();
    let client = PuzzleSeasonalEventClient::new(&env, &contract_id);
    env.ledger().set_timestamp(99);
    assert_eq!(client.get_event_status(&7), Some(EventStatus::Upcoming));
    env.ledger().set_timestamp(100);
    assert_eq!(client.get_event_status(&7), Some(EventStatus::Active));
    env.ledger().set_timestamp(200);
    assert_eq!(client.get_event_status(&7), Some(EventStatus::Ended));
}

#[test]
fn scores_keep_best_result_and_sort_leaderboard() {
    let (env, _, contract_id, _) = setup();
    let client = PuzzleSeasonalEventClient::new(&env, &contract_id);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    client.submit_score(&7, &first, &20);
    client.submit_score(&7, &second, &30);
    client.submit_score(&7, &first, &40);
    client.submit_score(&7, &first, &10);

    let leaderboard = client.get_leaderboard(&7);
    assert_eq!(leaderboard.len(), 2);
    assert_eq!(leaderboard.get(0).unwrap().participant, first);
    assert_eq!(leaderboard.get(0).unwrap().score, 40);
    assert_eq!(leaderboard.get(1).unwrap().participant, second);
}

#[test]
fn finalization_pays_prizes_and_mints_badges_for_all_participants() {
    let (env, _, contract_id, token_id) = setup();
    let client = PuzzleSeasonalEventClient::new(&env, &contract_id);
    let token_client = soroban_sdk::token::Client::new(&env, &token_id);
    let mock_token = MockTokenClient::new(&env, &token_id);
    let first = Address::generate(&env);
    let second = Address::generate(&env);
    let third = Address::generate(&env);
    mock_token.mint(&first, &300);
    client.submit_score(&7, &first, &100);
    client.submit_score(&7, &second, &90);
    client.submit_score(&7, &third, &80);
    client.fund_rewards(&7, &first, &150);

    assert_eq!(token_client.balance(&contract_id), 150);
    env.ledger().set_timestamp(200);
    client.distribute_rewards(&7);

    assert_eq!(token_client.balance(&first), 250);
    assert_eq!(token_client.balance(&second), 50);
    assert_eq!(token_client.balance(&third), 0);
    let first_badge = client.get_badge(&7, &first).unwrap();
    let third_badge = client.get_badge(&7, &third).unwrap();
    assert_ne!(first_badge.token_id, third_badge.token_id);
    assert_eq!(
        client.get_badge_by_id(&first_badge.token_id).unwrap().owner,
        first
    );
    assert_eq!(client.get_event(&7).unwrap().rewards_paid, 150);
    assert_eq!(
        client.get_event_status(&7),
        Some(EventStatus::Finalized)
    );
    assert_eq!(token_client.balance(&token_id), 0);
}
