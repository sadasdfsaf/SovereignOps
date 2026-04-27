//! Validated identifiers used across workspace, actor, device, object, and key boundaries.

use core::fmt;
use core::str::FromStr;

/// Maximum accepted identifier length, including the prefix.
pub const MAX_ID_LEN: usize = 96;

/// Identifier validation failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdParseError {
    /// The provided identifier was empty.
    Empty,
    /// The identifier had a valid shape but the wrong type prefix.
    WrongPrefix { expected: &'static str },
    /// The identifier ended immediately after the required prefix separator.
    MissingBody { expected: &'static str },
    /// The identifier exceeded the maximum accepted length.
    TooLong { max: usize },
    /// The identifier contained a character outside the portable safe set.
    InvalidChar { ch: char },
}

impl fmt::Display for IdParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "identifier is empty"),
            Self::WrongPrefix { expected } => write!(f, "identifier must start with {expected}_"),
            Self::MissingBody { expected } => write!(f, "identifier must include a value after {expected}_"),
            Self::TooLong { max } => write!(f, "identifier exceeds {max} characters"),
            Self::InvalidChar { ch } => write!(f, "identifier contains invalid character {ch:?}"),
        }
    }
}

impl std::error::Error for IdParseError {}

fn validate(prefix: &'static str, value: &str) -> Result<String, IdParseError> {
    if value.is_empty() {
        return Err(IdParseError::Empty);
    }
    if value.len() > MAX_ID_LEN {
        return Err(IdParseError::TooLong { max: MAX_ID_LEN });
    }
    let required = format!("{prefix}_");
    if !value.starts_with(&required) {
        return Err(IdParseError::WrongPrefix { expected: prefix });
    }
    if value.len() == required.len() {
        return Err(IdParseError::MissingBody { expected: prefix });
    }
    for ch in value.chars() {
        if !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') {
            return Err(IdParseError::InvalidChar { ch });
        }
    }
    Ok(value.to_owned())
}

macro_rules! id_type {
    ($name:ident, $prefix:literal) => {
        #[doc = concat!("Validated SovereignOps identifier with the `", $prefix, "_` prefix.")]
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(String);

        impl $name {
            #[doc = concat!("Parse and validate a `", $prefix, "_` identifier.")]
            pub fn parse(value: &str) -> Result<Self, IdParseError> {
                validate($prefix, value).map(Self)
            }

            /// Borrow the validated identifier as a string slice.
            pub fn as_str(&self) -> &str {
                &self.0
            }

            /// Return the required prefix for this identifier type.
            pub fn prefix() -> &'static str {
                $prefix
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(self.as_str())
            }
        }

        impl FromStr for $name {
            type Err = IdParseError;

            fn from_str(value: &str) -> Result<Self, Self::Err> {
                Self::parse(value)
            }
        }
    };
}

id_type!(WorkspaceId, "wsp");
id_type!(ActorId, "act");
id_type!(DeviceId, "dev");
id_type!(ObjectId, "obj");
id_type!(KeyId, "key");

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_prefixed_ids() -> Result<(), IdParseError> {
        let id = WorkspaceId::parse("wsp_local-123")?;
        assert_eq!(id.as_str(), "wsp_local-123");
        assert_eq!(WorkspaceId::prefix(), "wsp");
        Ok(())
    }

    #[test]
    fn rejects_wrong_prefix() {
        let result = ActorId::parse("wsp_local");
        assert!(matches!(result, Err(IdParseError::WrongPrefix { expected: "act" })));
    }

    #[test]
    fn rejects_missing_body() {
        let result = DeviceId::parse("dev_");
        assert!(matches!(result, Err(IdParseError::MissingBody { expected: "dev" })));
    }

    #[test]
    fn rejects_path_like_chars() {
        let result = ObjectId::parse("obj_../secret");
        assert!(matches!(result, Err(IdParseError::InvalidChar { ch: '.' })));
    }
}
