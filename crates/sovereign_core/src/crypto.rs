//! Minimal crypto provider contracts and deterministic test support.
//!
//! The deterministic provider in this module is intended for repeatable interface tests. It does
//! not provide real confidentiality or authentication strength.

use core::fmt;
use std::collections::BTreeMap;

const TAG_LEN: usize = 16;

/// Reference to key material held by a provider.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct KeyRef(String);

impl KeyRef {
    /// Create a key reference from a non-empty identifier.
    pub fn new(value: impl Into<String>) -> Result<Self, CryptoError> {
        let value = value.into();
        if value.trim().is_empty() {
            Err(CryptoError::EmptyKeyRef)
        } else {
            Ok(Self(value))
        }
    }

    /// Borrow the provider-local key reference.
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Nonce bytes supplied for an encryption operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Nonce(Vec<u8>);

impl Nonce {
    /// Create a nonce from non-empty bytes.
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Result<Self, CryptoError> {
        let bytes = bytes.into();
        if bytes.is_empty() {
            Err(CryptoError::EmptyNonce)
        } else {
            Ok(Self(bytes))
        }
    }

    /// Borrow the nonce bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

/// Additional authenticated data bound to a ciphertext.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Aad(Vec<u8>);

impl Aad {
    /// Create AAD from bytes. Empty AAD is valid.
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Self {
        Self(bytes.into())
    }

    /// Borrow the AAD bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }
}

/// Provider-produced ciphertext bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Ciphertext(Vec<u8>);

impl Ciphertext {
    /// Create ciphertext from provider-produced bytes.
    pub fn from_bytes(bytes: impl Into<Vec<u8>>) -> Self {
        Self(bytes.into())
    }

    /// Borrow the ciphertext bytes.
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// Consume the wrapper and return the ciphertext bytes.
    pub fn into_bytes(self) -> Vec<u8> {
        self.0
    }

    /// Return the ciphertext length.
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// Return true when no ciphertext bytes are present.
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

/// Crypto provider failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CryptoError {
    /// A key reference was empty or whitespace-only.
    EmptyKeyRef,
    /// A nonce was empty.
    EmptyNonce,
    /// Key material was empty for the named key reference.
    EmptyKeyMaterial {
        /// Key reference rejected by the provider.
        key_ref: String,
    },
    /// The provider did not have key material for the named reference.
    MissingKey {
        /// Key reference that could not be resolved.
        key_ref: String,
    },
    /// The ciphertext was shorter than the provider format requires.
    MalformedCiphertext {
        /// Minimum accepted ciphertext length.
        min_len: usize,
        /// Actual ciphertext length.
        actual_len: usize,
    },
    /// The AAD supplied for decrypt did not match the AAD used for encrypt.
    AadMismatch,
}

impl fmt::Display for CryptoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyKeyRef => write!(f, "key reference must not be empty"),
            Self::EmptyNonce => write!(f, "nonce must not be empty"),
            Self::EmptyKeyMaterial { key_ref } => {
                write!(f, "key material for {key_ref} must not be empty")
            }
            Self::MissingKey { key_ref } => write!(f, "missing key material for {key_ref}"),
            Self::MalformedCiphertext {
                min_len,
                actual_len,
            } => write!(
                f,
                "ciphertext must be at least {min_len} bytes, got {actual_len}"
            ),
            Self::AadMismatch => write!(f, "ciphertext AAD did not match"),
        }
    }
}

impl std::error::Error for CryptoError {}

/// Authenticated encryption boundary implemented by concrete crypto providers.
pub trait CryptoProvider {
    /// Encrypt plaintext with the selected key, nonce, and AAD.
    fn encrypt(
        &self,
        key_ref: &KeyRef,
        nonce: &Nonce,
        aad: &Aad,
        plaintext: &[u8],
    ) -> Result<Ciphertext, CryptoError>;

    /// Decrypt ciphertext with the selected key, nonce, and AAD.
    fn decrypt(
        &self,
        key_ref: &KeyRef,
        nonce: &Nonce,
        aad: &Aad,
        ciphertext: &Ciphertext,
    ) -> Result<Vec<u8>, CryptoError>;
}

/// Deterministic provider for repeatable interface tests.
#[derive(Debug, Clone, Default)]
pub struct DeterministicTestProvider {
    keys: BTreeMap<KeyRef, Vec<u8>>,
}

impl DeterministicTestProvider {
    /// Create a provider with no keys.
    pub fn new() -> Self {
        Self {
            keys: BTreeMap::new(),
        }
    }

    /// Return a copy of this provider with one key inserted.
    pub fn with_key(
        mut self,
        key_ref: KeyRef,
        key_material: impl Into<Vec<u8>>,
    ) -> Result<Self, CryptoError> {
        self.insert_key(key_ref, key_material)?;
        Ok(self)
    }

    /// Insert or replace key material.
    pub fn insert_key(
        &mut self,
        key_ref: KeyRef,
        key_material: impl Into<Vec<u8>>,
    ) -> Result<(), CryptoError> {
        let key_material = key_material.into();
        if key_material.is_empty() {
            return Err(CryptoError::EmptyKeyMaterial {
                key_ref: key_ref.as_str().to_owned(),
            });
        }
        self.keys.insert(key_ref, key_material);
        Ok(())
    }

    fn key_material(&self, key_ref: &KeyRef) -> Result<&[u8], CryptoError> {
        self.keys
            .get(key_ref)
            .map(Vec::as_slice)
            .ok_or_else(|| CryptoError::MissingKey {
                key_ref: key_ref.as_str().to_owned(),
            })
    }
}

impl CryptoProvider for DeterministicTestProvider {
    fn encrypt(
        &self,
        key_ref: &KeyRef,
        nonce: &Nonce,
        aad: &Aad,
        plaintext: &[u8],
    ) -> Result<Ciphertext, CryptoError> {
        let key_material = self.key_material(key_ref)?;
        let body = xor_payload(key_material, nonce.as_bytes(), aad.as_bytes(), plaintext);
        let tag = make_tag(key_material, nonce.as_bytes(), aad.as_bytes(), &body);
        let mut output = Vec::with_capacity(TAG_LEN + body.len());
        output.extend_from_slice(&tag);
        output.extend_from_slice(&body);
        Ok(Ciphertext(output))
    }

    fn decrypt(
        &self,
        key_ref: &KeyRef,
        nonce: &Nonce,
        aad: &Aad,
        ciphertext: &Ciphertext,
    ) -> Result<Vec<u8>, CryptoError> {
        let key_material = self.key_material(key_ref)?;
        let bytes = ciphertext.as_bytes();
        let tag_bytes = bytes
            .get(..TAG_LEN)
            .ok_or(CryptoError::MalformedCiphertext {
                min_len: TAG_LEN,
                actual_len: bytes.len(),
            })?;
        let body = bytes
            .get(TAG_LEN..)
            .ok_or(CryptoError::MalformedCiphertext {
                min_len: TAG_LEN,
                actual_len: bytes.len(),
            })?;

        let expected_tag = make_tag(key_material, nonce.as_bytes(), aad.as_bytes(), body);
        let mut actual_tag = [0u8; TAG_LEN];
        actual_tag.copy_from_slice(tag_bytes);
        if !constant_time_eq(&actual_tag, &expected_tag) {
            return Err(CryptoError::AadMismatch);
        }

        Ok(xor_payload(
            key_material,
            nonce.as_bytes(),
            aad.as_bytes(),
            body,
        ))
    }
}

fn xor_payload(key_material: &[u8], nonce: &[u8], aad: &[u8], input: &[u8]) -> Vec<u8> {
    let mut output = Vec::with_capacity(input.len());
    let mut counter = 0u64;
    for byte in input {
        output.push(*byte ^ stream_byte(key_material, nonce, aad, counter));
        counter = counter.wrapping_add(1);
    }
    output
}

fn stream_byte(key_material: &[u8], nonce: &[u8], aad: &[u8], counter: u64) -> u8 {
    let counter_bytes = counter.to_le_bytes();
    let state = hash_parts(
        0x484f_6f87_51f1_4d2d,
        &[b"stream", key_material, nonce, aad, &counter_bytes],
    );
    state.to_le_bytes()[0]
}

fn make_tag(key_material: &[u8], nonce: &[u8], aad: &[u8], body: &[u8]) -> [u8; TAG_LEN] {
    let left = hash_parts(
        0xa076_1d64_78bd_642f,
        &[b"tag-left", key_material, nonce, aad, body],
    );
    let right = hash_parts(
        0xe703_7ed1_a0b4_28db,
        &[b"tag-right", body, aad, nonce, key_material],
    );

    let mut tag = [0u8; TAG_LEN];
    for (slot, byte) in tag.iter_mut().take(8).zip(left.to_le_bytes()) {
        *slot = byte;
    }
    for (slot, byte) in tag.iter_mut().skip(8).zip(right.to_le_bytes()) {
        *slot = byte;
    }
    tag
}

fn hash_parts(seed: u64, parts: &[&[u8]]) -> u64 {
    let mut state = seed;
    for part in parts {
        let part = *part;
        mix_bytes(&mut state, &part.len().to_le_bytes());
        mix_bytes(&mut state, part);
    }
    state
}

fn mix_bytes(state: &mut u64, bytes: &[u8]) {
    for byte in bytes {
        *state ^= u64::from(*byte);
        *state = state.wrapping_mul(0x0000_0100_0000_01b3);
        *state ^= *state >> 32;
    }
}

fn constant_time_eq(left: &[u8; TAG_LEN], right: &[u8; TAG_LEN]) -> bool {
    let mut diff = 0u8;
    for (left_byte, right_byte) in left.iter().zip(right.iter()) {
        diff |= *left_byte ^ *right_byte;
    }
    diff == 0
}
