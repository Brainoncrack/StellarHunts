use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

fn setup() -> (Env, Address, Address, Address) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1234);
    let admin = Address::generate(&env);
    let minter = Address::generate(&env);
    let contract_id = env.register_contract(None, AchievementNftContract);
    AchievementNftContractClient::new(&env, &contract_id).init(&admin, &minter);
    (env, admin, minter, contract_id)
}

#[test]
fn mint_stores_metadata_and_indexes_by_type() {
    let (env, _, minter, contract_id) = setup();
    let client = AchievementNftContractClient::new(&env, &contract_id);
    let recipient = Address::generate(&env);
    let token_id = client.mint_achievement(
        &minter,
        &recipient,
        &String::from_str(&env, "first_solve"),
        &String::from_str(&env, "First Solve"),
        &String::from_str(&env, "gold"),
        &String::from_str(&env, "bafy-image-cid"),
    );

    let nft = client.get_nft(&token_id).unwrap();
    assert_eq!(nft.owner, recipient);
    assert_eq!(nft.tier, String::from_str(&env, "gold"));
    assert_eq!(nft.minted_at, 1234);
    assert_eq!(nft.image_ipfs_hash, String::from_str(&env, "bafy-image-cid"));
    assert_eq!(
        client
            .get_by_achievement_type(&String::from_str(&env, "first_solve"), &0, &10)
            .len(),
        1
    );
}

#[test]
fn transfer_preserves_duplicate_mint_protection() {
    let (env, _, minter, contract_id) = setup();
    let client = AchievementNftContractClient::new(&env, &contract_id);
    let recipient = Address::generate(&env);
    let next_owner = Address::generate(&env);
    let achievement = String::from_str(&env, "first_solve");
    let token_id = client.mint_achievement(
        &minter,
        &recipient,
        &achievement,
        &String::from_str(&env, "First Solve"),
        &String::from_str(&env, "silver"),
        &String::from_str(&env, "cid"),
    );

    client.transfer(&recipient, &next_owner, &token_id);
    assert_eq!(client.get_nft(&token_id).unwrap().owner, next_owner);
    assert!(client.has_minted(&recipient, &achievement));
    assert!(client
        .try_mint_achievement(
            &minter,
            &recipient,
            &achievement,
            &String::from_str(&env, "First Solve"),
            &String::from_str(&env, "silver"),
            &String::from_str(&env, "cid"),
        )
        .is_err());
}
