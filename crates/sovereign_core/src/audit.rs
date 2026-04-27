use crate::ids::{ActorId, ObjectId, WorkspaceId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RedactedField {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditRecord {
    pub workspace_id: WorkspaceId,
    pub actor_id: ActorId,
    pub object_id: Option<ObjectId>,
    pub action: String,
    pub decision: String,
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

pub fn redact_fields(fields: &[(String, String)]) -> (Vec<(String, String)>, Vec<RedactedField>) {
    let mut safe_fields = Vec::with_capacity(fields.len());
    let mut redactions = Vec::new();

    for (key, value) in fields {
        if is_sensitive_key(key) {
            safe_fields.push((key.clone(), "[redacted]".to_owned()));
            redactions.push(RedactedField {
                path: key.clone(),
                reason: "sensitive field name".to_owned(),
            });
        } else {
            safe_fields.push((key.clone(), value.clone()));
        }
    }

    (safe_fields, redactions)
}

fn is_sensitive_key(key: &str) -> bool {
    let normalized = key.to_ascii_lowercase();
    SENSITIVE_KEYS.iter().any(|needle| normalized.contains(needle))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redacts_sensitive_fields() {
        let fields = vec![
            ("title".to_owned(), "Release checklist".to_owned()),
            ("api_key".to_owned(), "plain-text-value".to_owned()),
        ];

        let (safe, redactions) = redact_fields(&fields);

        assert_eq!(safe[0].1, "Release checklist");
        assert_eq!(safe[1].1, "[redacted]");
        assert_eq!(redactions.len(), 1);
    }
}

