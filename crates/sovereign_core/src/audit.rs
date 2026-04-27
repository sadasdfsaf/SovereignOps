//! Audit records and redaction helpers for sensitive metadata.

use crate::ids::{ActorId, ObjectId, WorkspaceId};

/// Why a field was removed or replaced before audit serialization.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RedactionReason {
    /// The field name indicates credential-like material.
    SensitiveFieldName,
    /// The field value looks like a bearer-style credential.
    SensitiveValueShape,
}

impl RedactionReason {
    /// Return a stable string for audit output.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SensitiveFieldName => "sensitive field name",
            Self::SensitiveValueShape => "sensitive value shape",
        }
    }
}

/// A redacted audit field path and reason.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedactedField {
    /// Field path that was redacted.
    pub path: String,
    /// Human-readable redaction reason.
    pub reason: String,
}

/// One audit record describing an action, its target, decision, and redactions.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditRecord {
    /// Workspace where the action occurred.
    pub workspace_id: WorkspaceId,
    /// Actor responsible for the action.
    pub actor_id: ActorId,
    /// Optional object affected by the action.
    pub object_id: Option<ObjectId>,
    /// Stable action name.
    pub action: String,
    /// Policy decision applied to the action.
    pub decision: String,
    /// Fields removed before durable audit serialization.
    pub redactions: Vec<RedactedField>,
}

const SENSITIVE_KEYS: &[&str] = &[
    "access_token",
    "api_key",
    "client_secret",
    "password",
    "private_key",
    "refresh_token",
    "secret",
];

/// Redact a flat list of key-value fields before audit serialization.
pub fn redact_fields(fields: &[(String, String)]) -> (Vec<(String, String)>, Vec<RedactedField>) {
    let mut safe_fields = Vec::with_capacity(fields.len());
    let mut redactions = Vec::new();

    for (key, value) in fields {
        let reason = redaction_reason(key, value);
        if let Some(reason) = reason {
            safe_fields.push((key.clone(), "[redacted]".to_owned()));
            redactions.push(RedactedField {
                path: key.clone(),
                reason: reason.as_str().to_owned(),
            });
        } else {
            safe_fields.push((key.clone(), value.clone()));
        }
    }

    (safe_fields, redactions)
}

/// Return true when a field name should never be stored in plain audit metadata.
pub fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    SENSITIVE_KEYS.iter().any(|needle| normalized.contains(needle))
}

fn redaction_reason(key: &str, value: &str) -> Option<RedactionReason> {
    if is_sensitive_key(key) {
        return Some(RedactionReason::SensitiveFieldName);
    }
    let lower = value.to_ascii_lowercase();
    if lower.starts_with("bearer ") || lower.starts_with("basic ") {
        return Some(RedactionReason::SensitiveValueShape);
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_sensitive_fields() {
        let fields = vec![
            ("title".to_owned(), "Release checklist".to_owned()),
            ("api_key".to_owned(), "plain-text-value".to_owned()),
            ("authorization".to_owned(), "Bearer example".to_owned()),
        ];

        let (safe, redactions) = redact_fields(&fields);

        assert_eq!(safe[0].1, "Release checklist");
        assert_eq!(safe[1].1, "[redacted]");
        assert_eq!(safe[2].1, "[redacted]");
        assert_eq!(redactions.len(), 2);
    }
}
