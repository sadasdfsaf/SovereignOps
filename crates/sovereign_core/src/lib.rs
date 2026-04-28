//! Core domain primitives for SovereignOps.
//!
//! This crate intentionally keeps its initial surface small: validated IDs,
//! append-only event ordering, agent policy decisions, and audit redaction.

pub mod audit;
pub mod crypto;
pub mod event_log;
pub mod ids;
pub mod manifest;
pub mod objects;
pub mod policy;
pub mod search;
pub mod sync;

pub use audit::{is_sensitive_key, redact_fields, AuditRecord, RedactedField, RedactionReason};
pub use crypto::{
    Aad, Ciphertext, CryptoError, CryptoProvider, DeterministicTestProvider, KeyRef, Nonce,
};
pub use event_log::{EventEnvelope, EventLog, EventLogError};
pub use ids::{ActorId, DeviceId, IdParseError, KeyId, ObjectId, WorkspaceId};
pub use manifest::{
    DefaultCapabilityPolicy, DefaultPolicySummary, ManifestCapability, WorkspaceManifest,
    WorkspaceManifestError, MAX_CAPABILITY_DESCRIPTION_LEN, MAX_DEFAULT_POLICY_SUMMARY_LEN,
    WORKSPACE_MANIFEST_VERSION,
};
pub use objects::{
    reduce_document_operation, reduce_document_operations, reduce_incident_operation,
    reduce_incident_operations, reduce_task_operation, reduce_task_operations, AttachmentAdded,
    AttachmentContentReplaced, AttachmentOperation, AttachmentRemoved, AttachmentRenamed,
    CommentCreated, CommentDeleted, CommentEdited, CommentOperation, DocumentArchived,
    DocumentBodyReplaced, DocumentCreated, DocumentDeleted, DocumentOperation, DocumentState,
    DocumentTagsReplaced, DocumentTitleChanged, IncidentEvidence, IncidentEvidenceAdded,
    IncidentEvidenceRemoved, IncidentOpened, IncidentOperation, IncidentSeverity,
    IncidentSeverityChanged, IncidentState, IncidentStatus, IncidentStatusChanged, ObjectKind,
    ObjectOperation, ObjectReducerError, ProjectArchived, ProjectCreated,
    ProjectDescriptionChanged, ProjectOperation, ProjectRenamed, TaskArchived, TaskAssigneeChanged,
    TaskCreated, TaskDescriptionChanged, TaskOperation, TaskProjectChanged, TaskState, TaskStatus,
    TaskStatusChanged, TaskTitleChanged,
};
pub use policy::{
    Capability, Decision, DecisionKind, ExplanationStep, ExplanationTrace, PolicyEvaluation,
    PolicyEvaluationRule, PolicyMatcher, PolicyRequest, PolicyRule, PolicyRuleSet, RiskLevel,
    RuleEffect,
};
pub use search::{
    IndexCitation, IndexDocument, SearchFixtureError, SearchIndexError,
    SEARCH_INDEX_DOCUMENT_SCHEMA_VERSION,
};
pub use sync::{
    classify_conflict, ClockOrdering, ConflictClassification, ConflictKind, SyncChange,
    SyncChangeKind, VectorClock, VectorClockError,
};
