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

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(100);
    let admin = Address::generate(&env);
    let treasury = Address::generate(&env);
    let recipient = Address::generate(&env);
    let vesting_id = env.register_contract(None, PuzzleTokenVesting);
    PuzzleTokenVestingClient::new(&env, &vesting_id).init(&admin, &treasury);
    (env, admin, treasury, recipient, vesting_id)
}

#[test]
fn linear_grant_vests_and_can_be_claimed() {
    let (env, admin, _, recipient, vesting_id) = setup();
    let client = PuzzleTokenVestingClient::new(&env, &vesting_id);
    let token_id = env.register_contract(None, MockToken);
    MockTokenClient::new(&env, &token_id).mint(&admin, &1_000);
    client.create_grant(
        &1,
        &recipient,
        &token_id,
        &1_000,
        &100,
        &100,
        &200,
        &VestingType::Linear,
    );

    env.ledger().set_timestamp(150);
    assert_eq!(client.get_status(&1).unwrap().vested_amount, 500);
    assert_eq!(client.claim(&1), 500);
    assert_eq!(
        MockTokenClient::new(&env, &token_id).balance(&recipient),
        500
    );
    assert_eq!(client.get_status(&1).unwrap().claimable_amount, 0);
}

#[test]
fn cliff_grant_and_admin_cancellation_apply_penalty() {
    let (env, admin, treasury, recipient, vesting_id) = setup();
    let client = PuzzleTokenVestingClient::new(&env, &vesting_id);
    let token_id = env.register_contract(None, MockToken);
    MockTokenClient::new(&env, &token_id).mint(&admin, &1_000);
    client.create_grant(
        &2,
        &recipient,
        &token_id,
        &1_000,
        &100,
        &200,
        &200,
        &VestingType::Cliff,
    );
    assert_eq!(client.get_status(&2).unwrap().vested_amount, 0);

    env.ledger().set_timestamp(150);
    client.cancel_grant(&2);
    let token = MockTokenClient::new(&env, &token_id);
    assert_eq!(token.balance(&treasury), 100);
    assert_eq!(token.balance(&admin), 900);
    let status = client.get_status(&2).unwrap();
    assert_eq!(status.vested_amount, 0);
    assert!(status.cancelled);
}
