use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(100);
    let admin = Address::generate(&env);
    let contract_id = env.register_contract(None, PuzzleTimeLock);
    PuzzleTimeLockClient::new(&env, &contract_id).init(&admin);
    (env, admin, contract_id)
}

#[test]
fn content_is_not_revealed_before_its_time_and_is_afterward() {
    let (env, _, contract_id) = setup();
    let client = PuzzleTimeLockClient::new(&env, &contract_id);
    client.add_puzzle(&1, &String::from_str(&env, "ciphertext"), &200);
    assert!(client.try_reveal_puzzle(&1).is_err());
    assert!(!client.is_revealed(&1));

    env.ledger().set_timestamp(200);
    assert_eq!(
        client.reveal_puzzle(&1),
        String::from_str(&env, "ciphertext")
    );
    assert!(client.is_revealed(&1));
}

#[test]
fn admin_can_reschedule_and_batch_reveal_due_puzzles() {
    let (env, admin, contract_id) = setup();
    let client = PuzzleTimeLockClient::new(&env, &contract_id);
    client.add_puzzle(&1, &String::from_str(&env, "one"), &300);
    client.add_puzzle(&2, &String::from_str(&env, "two"), &150);
    client.set_reveal_time(&admin, &1, &150);
    env.ledger().set_timestamp(150);

    let ids = Vec::from_array(&env, [1_u64, 2_u64]);
    let reveals = client.reveal_batch(&ids);
    assert_eq!(reveals.len(), 2);
    assert_eq!(reveals.get(0).unwrap().puzzle_id, 1);
    assert_eq!(reveals.get(1).unwrap().puzzle_id, 2);
}
