use core::fmt;

use sovereign_core::{
    IndexCitation, IndexDocument, SearchFixtureError, SearchIndexError,
    SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION,
};

const SEARCH_INDEX_DOCUMENT_FIXTURE: &str = include_str!("../fixtures/search_index_document.json");

#[derive(Debug)]
struct TestFailure {
    message: String,
}

impl TestFailure {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for TestFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for TestFailure {}

fn require_eq<T>(label: &'static str, actual: &T, expected: &T) -> Result<(), TestFailure>
where
    T: fmt::Debug + PartialEq,
{
    if actual == expected {
        return Ok(());
    }

    Err(TestFailure::new(format!(
        "{label} mismatch: actual {actual:?}, expected {expected:?}"
    )))
}

fn fixture_document() -> Result<IndexDocument, SearchIndexError> {
    IndexDocument::new(
        "doc_workspace-notes",
        "sovereign://workspace/demo/documents/workspace-notes",
        "en",
        "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
        "Workspace Notes",
        "Offline-first notes describe local updates, sync state, and citation links.",
        vec![
            IndexCitation::new(
                "cite_local-updates",
                "sovereign://workspace/demo/documents/local-updates",
                "Local Updates",
                "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            )?,
            IndexCitation::new(
                "cite_sync-state",
                "sovereign://workspace/demo/documents/sync-state",
                "Sync State",
                "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            )?,
        ],
    )
}

#[test]
fn fixture_parses_and_renders_without_drift() -> Result<(), Box<dyn std::error::Error>> {
    let document = IndexDocument::from_fixture_json(SEARCH_INDEX_DOCUMENT_FIXTURE)?;

    require_eq(
        "schema version",
        &document.schema_version,
        &SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION,
    )?;
    require_eq(
        "source uri",
        &document.source_uri,
        &"sovereign://workspace/demo/documents/workspace-notes".to_owned(),
    )?;
    require_eq("language", &document.language, &"en".to_owned())?;
    require_eq(
        "checksum",
        &document.checksum,
        &"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
            .to_owned(),
    )?;
    require_eq("citation count", &document.citations.len(), &2_usize)?;

    let rendered = document.to_fixture_json();
    require_eq(
        "rendered fixture",
        &rendered,
        &SEARCH_INDEX_DOCUMENT_FIXTURE.to_owned(),
    )?;

    let reparsed = IndexDocument::from_fixture_json(&rendered)?;
    require_eq("reparsed document", &reparsed, &document)?;
    Ok(())
}

#[test]
fn constructed_document_renders_to_fixture() -> Result<(), Box<dyn std::error::Error>> {
    let document = fixture_document()?;
    let rendered = document.to_fixture_json();

    require_eq(
        "constructed fixture",
        &rendered,
        &SEARCH_INDEX_DOCUMENT_FIXTURE.to_owned(),
    )?;
    Ok(())
}

#[test]
fn fixture_parser_rejects_invalid_document_values() -> Result<(), Box<dyn std::error::Error>> {
    let invalid = SEARCH_INDEX_DOCUMENT_FIXTURE.replace(
        "\"checksum\": \"sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\"",
        "\"checksum\": \"sha256:not-a-valid-digest\"",
    );

    let result = IndexDocument::from_fixture_json(&invalid);
    match result {
        Err(SearchFixtureError::InvalidDocument { source }) => require_eq(
            "invalid checksum error",
            &source,
            &SearchIndexError::InvalidField {
                field: "checksum",
                reason: "sha256 digest must contain 64 lowercase hex characters",
            },
        )?,
        other => {
            return Err(TestFailure::new(format!(
                "expected invalid document error, got {other:?}"
            ))
            .into());
        }
    }

    Ok(())
}
