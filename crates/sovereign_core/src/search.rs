//! Search index document models and deterministic fixture encoding.

use core::fmt;

/// Current schema version for serialized search index document fixtures.
pub const SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION: u32 = 1;

const SHA256_PREFIX: &str = "sha256:";

/// A cited source attached to a search index document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexCitation {
    /// Stable citation identifier within the indexed document.
    pub citation_id: String,
    /// URI for the cited source.
    pub source_uri: String,
    /// Human-readable cited source title.
    pub title: String,
    /// Content checksum for the cited source.
    pub checksum: String,
}

impl IndexCitation {
    /// Build and validate a citation.
    pub fn new(
        citation_id: impl Into<String>,
        source_uri: impl Into<String>,
        title: impl Into<String>,
        checksum: impl Into<String>,
    ) -> Result<Self, SearchIndexError> {
        let citation = Self {
            citation_id: citation_id.into(),
            source_uri: source_uri.into(),
            title: title.into(),
            checksum: checksum.into(),
        };
        citation.validate()?;
        Ok(citation)
    }

    /// Validate citation fields.
    pub fn validate(&self) -> Result<(), SearchIndexError> {
        validate_required("citations.citation_id", &self.citation_id)?;
        validate_source_uri("citations.source_uri", &self.source_uri)?;
        validate_required("citations.title", &self.title)?;
        validate_checksum("citations.checksum", &self.checksum)
    }
}

/// A single document prepared for search indexing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexDocument {
    /// Fixture schema version.
    pub schema_version: u32,
    /// Stable document identifier in the index.
    pub document_id: String,
    /// URI for the indexed source document.
    pub source_uri: String,
    /// BCP-47-style language tag for indexed text.
    pub language: String,
    /// Content checksum for the indexed source document.
    pub checksum: String,
    /// Searchable document title.
    pub title: String,
    /// Searchable document body.
    pub body: String,
    /// Sources cited by the indexed document.
    pub citations: Vec<IndexCitation>,
}

impl IndexDocument {
    /// Build an index document using the current schema version.
    pub fn new(
        document_id: impl Into<String>,
        source_uri: impl Into<String>,
        language: impl Into<String>,
        checksum: impl Into<String>,
        title: impl Into<String>,
        body: impl Into<String>,
        citations: Vec<IndexCitation>,
    ) -> Result<Self, SearchIndexError> {
        let document = Self {
            schema_version: SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION,
            document_id: document_id.into(),
            source_uri: source_uri.into(),
            language: language.into(),
            checksum: checksum.into(),
            title: title.into(),
            body: body.into(),
            citations,
        };
        document.validate()?;
        Ok(document)
    }

    /// Validate document fields and citation metadata.
    pub fn validate(&self) -> Result<(), SearchIndexError> {
        if self.schema_version != SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION {
            return Err(SearchIndexError::UnsupportedSchemaVersion {
                version: self.schema_version,
            });
        }
        validate_required("document_id", &self.document_id)?;
        validate_source_uri("source_uri", &self.source_uri)?;
        validate_language(&self.language)?;
        validate_checksum("checksum", &self.checksum)?;
        validate_required("title", &self.title)?;
        validate_required("body", &self.body)?;
        for citation in &self.citations {
            citation.validate()?;
        }
        Ok(())
    }

    /// Render the stable fixture JSON representation.
    pub fn to_fixture_json(&self) -> String {
        let mut out = String::new();
        out.push_str("{\n");
        out.push_str("  \"schema_version\": ");
        out.push_str(&self.schema_version.to_string());
        out.push_str(",\n");
        append_string_field(&mut out, 1, "document_id", &self.document_id, true);
        append_string_field(&mut out, 1, "source_uri", &self.source_uri, true);
        append_string_field(&mut out, 1, "language", &self.language, true);
        append_string_field(&mut out, 1, "checksum", &self.checksum, true);
        append_string_field(&mut out, 1, "title", &self.title, true);
        append_string_field(&mut out, 1, "body", &self.body, true);
        out.push_str("  \"citations\": ");
        append_citations(&mut out, &self.citations);
        out.push_str("\n}\n");
        out
    }

    /// Parse the stable fixture JSON representation.
    pub fn from_fixture_json(input: &str) -> Result<Self, SearchFixtureError> {
        JsonCursor::new(input).parse_document()
    }
}

/// Search index validation failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchIndexError {
    /// A required field was empty or contained only whitespace.
    EmptyField {
        /// Field that failed validation.
        field: &'static str,
    },
    /// A field had a value outside the accepted search index subset.
    InvalidField {
        /// Field that failed validation.
        field: &'static str,
        /// Stable reason for the validation failure.
        reason: &'static str,
    },
    /// The fixture schema version is not supported by this crate version.
    UnsupportedSchemaVersion {
        /// Unsupported schema version.
        version: u32,
    },
}

impl fmt::Display for SearchIndexError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyField { field } => write!(f, "search index field {field} must not be empty"),
            Self::InvalidField { field, reason } => {
                write!(f, "search index field {field} is invalid: {reason}")
            }
            Self::UnsupportedSchemaVersion { version } => {
                write!(f, "unsupported search index schema version {version}")
            }
        }
    }
}

impl std::error::Error for SearchIndexError {}

/// Fixture parsing failures for the stable search index document JSON subset.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SearchFixtureError {
    /// The JSON subset parser found a different token than expected.
    Expected {
        /// Byte offset where parsing failed.
        offset: usize,
        /// Description of the expected token.
        expected: &'static str,
    },
    /// The JSON subset parser found a string escape it does not accept.
    InvalidEscape {
        /// Byte offset of the invalid escape code.
        offset: usize,
        /// Escape code that was rejected.
        escape: char,
    },
    /// The JSON subset parser found invalid Unicode escape data.
    InvalidUnicodeEscape {
        /// Byte offset where the invalid Unicode escape began.
        offset: usize,
    },
    /// The JSON subset parser found an unsupported unsigned integer.
    InvalidNumber {
        /// Byte offset where the invalid number began.
        offset: usize,
    },
    /// Parsed JSON did not satisfy search index validation.
    InvalidDocument {
        /// Validation failure.
        source: SearchIndexError,
    },
    /// Non-whitespace data followed a complete fixture document.
    TrailingData {
        /// Byte offset where trailing data began.
        offset: usize,
    },
}

impl fmt::Display for SearchFixtureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Expected { offset, expected } => {
                write!(f, "expected {expected} at byte offset {offset}")
            }
            Self::InvalidEscape { offset, escape } => {
                write!(f, "invalid JSON escape {escape:?} at byte offset {offset}")
            }
            Self::InvalidUnicodeEscape { offset } => {
                write!(f, "invalid JSON unicode escape at byte offset {offset}")
            }
            Self::InvalidNumber { offset } => {
                write!(f, "invalid JSON unsigned integer at byte offset {offset}")
            }
            Self::InvalidDocument { source } => fmt::Display::fmt(source, f),
            Self::TrailingData { offset } => {
                write!(f, "trailing data after fixture document at byte offset {offset}")
            }
        }
    }
}

impl std::error::Error for SearchFixtureError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidDocument { source } => Some(source),
            _ => None,
        }
    }
}

impl From<SearchIndexError> for SearchFixtureError {
    fn from(source: SearchIndexError) -> Self {
        Self::InvalidDocument { source }
    }
}

fn validate_required(field: &'static str, value: &str) -> Result<(), SearchIndexError> {
    if value.trim().is_empty() {
        return Err(SearchIndexError::EmptyField { field });
    }
    Ok(())
}

fn validate_source_uri(field: &'static str, value: &str) -> Result<(), SearchIndexError> {
    validate_required(field, value)?;
    if value.trim() != value {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "must not have surrounding whitespace",
        });
    }
    if value.chars().any(char::is_whitespace) {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "must not contain whitespace",
        });
    }
    if !value.contains(':') {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "must include a URI scheme",
        });
    }
    Ok(())
}

fn validate_language(value: &str) -> Result<(), SearchIndexError> {
    validate_required("language", value)?;
    if value.len() > 35 {
        return Err(SearchIndexError::InvalidField {
            field: "language",
            reason: "must be 35 characters or fewer",
        });
    }

    let mut previous_was_separator = true;
    for ch in value.chars() {
        if ch == '-' {
            if previous_was_separator {
                return Err(SearchIndexError::InvalidField {
                    field: "language",
                    reason: "must not contain empty subtags",
                });
            }
            previous_was_separator = true;
        } else if ch.is_ascii_alphanumeric() {
            previous_was_separator = false;
        } else {
            return Err(SearchIndexError::InvalidField {
                field: "language",
                reason: "must contain only ASCII letters, digits, or hyphens",
            });
        }
    }

    if previous_was_separator {
        return Err(SearchIndexError::InvalidField {
            field: "language",
            reason: "must not end with a hyphen",
        });
    }

    Ok(())
}

fn validate_checksum(field: &'static str, value: &str) -> Result<(), SearchIndexError> {
    validate_required(field, value)?;
    if !value.starts_with(SHA256_PREFIX) {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "must start with sha256:",
        });
    }

    let digest = &value[SHA256_PREFIX.len()..];
    if digest.len() != 64 {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "sha256 digest must contain 64 lowercase hex characters",
        });
    }

    if !digest
        .chars()
        .all(|ch| ch.is_ascii_digit() || ('a'..='f').contains(&ch))
    {
        return Err(SearchIndexError::InvalidField {
            field,
            reason: "sha256 digest must contain 64 lowercase hex characters",
        });
    }

    Ok(())
}

fn append_string_field(
    out: &mut String,
    indent: usize,
    key: &'static str,
    value: &str,
    trailing_comma: bool,
) {
    append_indent(out, indent);
    append_json_string(out, key);
    out.push_str(": ");
    append_json_string(out, value);
    if trailing_comma {
        out.push(',');
    }
    out.push('\n');
}

fn append_citations(out: &mut String, citations: &[IndexCitation]) {
    if citations.is_empty() {
        out.push_str("[]");
        return;
    }

    out.push_str("[\n");
    for (index, citation) in citations.iter().enumerate() {
        append_indent(out, 2);
        out.push_str("{\n");
        append_string_field(out, 3, "citation_id", &citation.citation_id, true);
        append_string_field(out, 3, "source_uri", &citation.source_uri, true);
        append_string_field(out, 3, "title", &citation.title, true);
        append_string_field(out, 3, "checksum", &citation.checksum, false);
        append_indent(out, 2);
        out.push('}');
        if index + 1 < citations.len() {
            out.push(',');
        }
        out.push('\n');
    }
    append_indent(out, 1);
    out.push(']');
}

fn append_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push_str("  ");
    }
}

fn append_json_string(out: &mut String, value: &str) {
    const HEX: &[u8; 16] = b"0123456789abcdef";

    out.push('"');
    for ch in value.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\u{08}' => out.push_str("\\b"),
            '\u{0c}' => out.push_str("\\f"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            ch if ch < '\u{20}' => {
                let value = ch as u32;
                out.push_str("\\u00");
                out.push(char::from(HEX[((value >> 4) & 0x0f) as usize]));
                out.push(char::from(HEX[(value & 0x0f) as usize]));
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

struct JsonCursor<'a> {
    input: &'a str,
    offset: usize,
}

impl<'a> JsonCursor<'a> {
    fn new(input: &'a str) -> Self {
        Self { input, offset: 0 }
    }

    fn parse_document(mut self) -> Result<IndexDocument, SearchFixtureError> {
        self.expect_char('{')?;
        self.expect_key("schema_version")?;
        let schema_version = self.parse_u32()?;
        self.expect_char(',')?;
        self.expect_key("document_id")?;
        let document_id = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("source_uri")?;
        let source_uri = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("language")?;
        let language = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("checksum")?;
        let checksum = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("title")?;
        let title = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("body")?;
        let body = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("citations")?;
        let citations = self.parse_citations()?;
        self.expect_char('}')?;
        self.skip_ws();
        if self.offset != self.input.len() {
            return Err(SearchFixtureError::TrailingData {
                offset: self.offset,
            });
        }

        let document = IndexDocument {
            schema_version,
            document_id,
            source_uri,
            language,
            checksum,
            title,
            body,
            citations,
        };
        document.validate().map_err(SearchFixtureError::from)?;
        Ok(document)
    }

    fn parse_citations(&mut self) -> Result<Vec<IndexCitation>, SearchFixtureError> {
        self.expect_char('[')?;
        let mut citations = Vec::new();
        self.skip_ws();
        if self.consume_char(']') {
            return Ok(citations);
        }

        loop {
            citations.push(self.parse_citation()?);
            self.skip_ws();
            if self.consume_char(',') {
                continue;
            }
            self.expect_char(']')?;
            break;
        }
        Ok(citations)
    }

    fn parse_citation(&mut self) -> Result<IndexCitation, SearchFixtureError> {
        self.expect_char('{')?;
        self.expect_key("citation_id")?;
        let citation_id = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("source_uri")?;
        let source_uri = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("title")?;
        let title = self.parse_string()?;
        self.expect_char(',')?;
        self.expect_key("checksum")?;
        let checksum = self.parse_string()?;
        self.expect_char('}')?;

        IndexCitation::new(citation_id, source_uri, title, checksum)
            .map_err(SearchFixtureError::from)
    }

    fn expect_key(&mut self, key: &'static str) -> Result<(), SearchFixtureError> {
        let parsed = self.parse_string()?;
        if parsed != key {
            return Err(SearchFixtureError::Expected {
                offset: self.offset,
                expected: key,
            });
        }
        self.expect_char(':')
    }

    fn parse_u32(&mut self) -> Result<u32, SearchFixtureError> {
        self.skip_ws();
        let start = self.offset;
        let mut value = 0_u32;
        let mut saw_digit = false;

        while let Some(ch) = self.peek_char() {
            if !ch.is_ascii_digit() {
                break;
            }
            saw_digit = true;
            self.offset += ch.len_utf8();
            let digit = ch as u32 - '0' as u32;
            value = value
                .checked_mul(10)
                .and_then(|current| current.checked_add(digit))
                .ok_or(SearchFixtureError::InvalidNumber { offset: start })?;
        }

        if !saw_digit {
            return Err(SearchFixtureError::Expected {
                offset: start,
                expected: "unsigned integer",
            });
        }

        Ok(value)
    }

    fn parse_string(&mut self) -> Result<String, SearchFixtureError> {
        self.skip_ws();
        let start = self.offset;
        if self.read_char() != Some('"') {
            return Err(SearchFixtureError::Expected {
                offset: start,
                expected: "string",
            });
        }

        let mut out = String::new();
        loop {
            let offset = self.offset;
            let ch = self.read_char().ok_or(SearchFixtureError::Expected {
                offset,
                expected: "string terminator",
            })?;
            match ch {
                '"' => return Ok(out),
                '\\' => self.parse_escape(&mut out)?,
                ch if ch < '\u{20}' => {
                    return Err(SearchFixtureError::Expected {
                        offset,
                        expected: "escaped control character",
                    });
                }
                ch => out.push(ch),
            }
        }
    }

    fn parse_escape(&mut self, out: &mut String) -> Result<(), SearchFixtureError> {
        let offset = self.offset;
        let escape = self.read_char().ok_or(SearchFixtureError::Expected {
            offset,
            expected: "escape code",
        })?;
        match escape {
            '"' => out.push('"'),
            '\\' => out.push('\\'),
            '/' => out.push('/'),
            'b' => out.push('\u{08}'),
            'f' => out.push('\u{0c}'),
            'n' => out.push('\n'),
            'r' => out.push('\r'),
            't' => out.push('\t'),
            'u' => out.push(self.parse_unicode_escape(offset)?),
            escape => return Err(SearchFixtureError::InvalidEscape { offset, escape }),
        }
        Ok(())
    }

    fn parse_unicode_escape(&mut self, offset: usize) -> Result<char, SearchFixtureError> {
        let first = self.parse_hex_quad(offset)?;
        let scalar = if (0xd800_u16..=0xdbff_u16).contains(&first) {
            let slash_offset = self.offset;
            if self.read_char() != Some('\\') || self.read_char() != Some('u') {
                return Err(SearchFixtureError::InvalidUnicodeEscape {
                    offset: slash_offset,
                });
            }
            let second = self.parse_hex_quad(slash_offset)?;
            if !(0xdc00_u16..=0xdfff_u16).contains(&second) {
                return Err(SearchFixtureError::InvalidUnicodeEscape {
                    offset: slash_offset,
                });
            }
            0x10000_u32
                + (((first - 0xd800_u16) as u32) << 10)
                + ((second - 0xdc00_u16) as u32)
        } else if (0xdc00_u16..=0xdfff_u16).contains(&first) {
            return Err(SearchFixtureError::InvalidUnicodeEscape { offset });
        } else {
            first as u32
        };

        char::from_u32(scalar).ok_or(SearchFixtureError::InvalidUnicodeEscape { offset })
    }

    fn parse_hex_quad(&mut self, offset: usize) -> Result<u16, SearchFixtureError> {
        let mut value = 0_u16;
        for _ in 0..4 {
            let ch_offset = self.offset;
            let ch = self.read_char().ok_or(SearchFixtureError::InvalidUnicodeEscape {
                offset,
            })?;
            let digit = ch
                .to_digit(16)
                .ok_or(SearchFixtureError::InvalidUnicodeEscape { offset: ch_offset })?;
            value = (value << 4) + digit as u16;
        }
        Ok(value)
    }

    fn expect_char(&mut self, expected: char) -> Result<(), SearchFixtureError> {
        self.skip_ws();
        let offset = self.offset;
        match self.read_char() {
            Some(ch) if ch == expected => Ok(()),
            _ => Err(SearchFixtureError::Expected {
                offset,
                expected: match expected {
                    '{' => "{",
                    '}' => "}",
                    '[' => "[",
                    ']' => "]",
                    ':' => ":",
                    ',' => ",",
                    _ => "expected character",
                },
            }),
        }
    }

    fn consume_char(&mut self, expected: char) -> bool {
        self.skip_ws();
        if self.peek_char() == Some(expected) {
            self.offset += expected.len_utf8();
            return true;
        }
        false
    }

    fn skip_ws(&mut self) {
        while let Some(ch) = self.peek_char() {
            if !matches!(ch, ' ' | '\n' | '\r' | '\t') {
                return;
            }
            self.offset += ch.len_utf8();
        }
    }

    fn peek_char(&self) -> Option<char> {
        self.input.get(self.offset..)?.chars().next()
    }

    fn read_char(&mut self) -> Option<char> {
        let ch = self.peek_char()?;
        self.offset += ch.len_utf8();
        Some(ch)
    }
}
