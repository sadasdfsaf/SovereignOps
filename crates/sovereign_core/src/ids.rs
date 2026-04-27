use core::fmt;
use core::str::FromStr;

const MAX_ID_LEN: usize = 96;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IdParseError {
    Empty,
    WrongPrefix { expected: &'static str },
    TooLong { max: usize },
    InvalidChar { ch: char },
}

impl fmt::Display for IdParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Empty => write!(f, "identifier is empty"),
            Self::WrongPrefix { expected } => write!(f, "identifier must start with {expected}_"),
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
    for ch in value.chars() {
        if !(ch.is_ascii_alphanumeric() || ch == '_' || ch == '-') {
            return Err(IdParseError::InvalidChar { ch });
        }
    }
    Ok(value.to_owned())
}

macro_rules! id_type {
    ($name:ident, $prefix:literal) => {
        #[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub struct $name(String);

        impl $name {
            pub fn parse(value: &str) -> Result<Self, IdParseError> {
                validate($prefix, value).map(Self)
            }

            pub fn as_str(&self) -> &str {
                &self.0
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
    fn parses_prefixed_ids() {
        let id = WorkspaceId::parse("wsp_local-123").unwrap();
        assert_eq!(id.as_str(), "wsp_local-123");
    }

    #[test]
    fn rejects_wrong_prefix() {
        let err = ActorId::parse("wsp_local").unwrap_err();
        assert_eq!(err, IdParseError::WrongPrefix { expected: "act" });
    }

    #[test]
    fn rejects_path_like_chars() {
        let err = ObjectId::parse("obj_../secret").unwrap_err();
        assert_eq!(err, IdParseError::InvalidChar { ch: '.' });
    }
}

