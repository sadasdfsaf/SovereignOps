use core::fmt;
use std::error::Error;

use sovereign_core::{Aad, CryptoError, CryptoProvider, DeterministicTestProvider, KeyRef, Nonce};

#[derive(Debug)]
struct TestError(String);

impl fmt::Display for TestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Error for TestError {}

#[test]
fn rejects_decrypt_when_aad_differs() -> Result<(), Box<dyn Error>> {
    let provider = provider()?;
    let key_ref = key_ref()?;
    let nonce = nonce()?;
    let ciphertext = provider.encrypt(
        &key_ref,
        &nonce,
        &Aad::from_bytes(b"context-a".to_vec()),
        b"payload",
    )?;

    let result = provider.decrypt(
        &key_ref,
        &nonce,
        &Aad::from_bytes(b"context-b".to_vec()),
        &ciphertext,
    );

    match result {
        Err(CryptoError::AadMismatch) => Ok(()),
        Ok(_) => Err(test_error("decrypt accepted mismatched AAD")),
        Err(error) => Err(test_error(format!("wrong error: {error}"))),
    }
}

#[test]
fn rejects_encrypt_when_key_is_missing() -> Result<(), Box<dyn Error>> {
    let provider = DeterministicTestProvider::new();
    let key_ref = KeyRef::new("key_missing")?;
    let result = provider.encrypt(
        &key_ref,
        &nonce()?,
        &Aad::from_bytes(b"context".to_vec()),
        b"payload",
    );

    match result {
        Err(CryptoError::MissingKey { key_ref }) if key_ref == "key_missing" => Ok(()),
        Ok(_) => Err(test_error("encrypt accepted missing key")),
        Err(error) => Err(test_error(format!("wrong error: {error}"))),
    }
}

#[test]
fn encrypt_is_deterministic_for_same_inputs() -> Result<(), Box<dyn Error>> {
    let provider = provider()?;
    let key_ref = key_ref()?;
    let nonce = nonce()?;
    let aad = Aad::from_bytes(b"context".to_vec());

    let first = provider.encrypt(&key_ref, &nonce, &aad, b"payload")?;
    let second = provider.encrypt(&key_ref, &nonce, &aad, b"payload")?;

    check_eq(first.clone(), second, "ciphertext determinism")?;
    check_eq(
        provider.decrypt(&key_ref, &nonce, &aad, &first)?,
        b"payload".to_vec(),
        "round trip plaintext",
    )
}

fn provider() -> Result<DeterministicTestProvider, Box<dyn Error>> {
    let provider = DeterministicTestProvider::new().with_key(
        key_ref()?,
        b"test-key-material".to_vec(),
    )?;
    Ok(provider)
}

fn key_ref() -> Result<KeyRef, CryptoError> {
    KeyRef::new("key_primary")
}

fn nonce() -> Result<Nonce, CryptoError> {
    Nonce::from_bytes(b"nonce-0001".to_vec())
}

fn check_eq<T>(actual: T, wanted: T, context: &str) -> Result<(), Box<dyn Error>>
where
    T: fmt::Debug + PartialEq,
{
    if actual == wanted {
        Ok(())
    } else {
        Err(test_error(format!(
            "{context}: wanted {wanted:?}, got {actual:?}"
        )))
    }
}

fn test_error(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(TestError(message.into()))
}
