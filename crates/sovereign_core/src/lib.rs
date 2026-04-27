//! Core domain primitives for SovereignOps.
//!
//! This crate intentionally keeps its initial surface small: validated IDs,
//! append-only event ordering, agent policy decisions, and audit redaction.

pub mod audit;
pub mod event_log;
pub mod ids;
pub mod objects;
pub mod policy;
pub mod sync;

pub use audit::{is_sensitive_key, redact_fields, AuditRecord, RedactedField, RedactionReason};
pub use event_log::{EventEnvelope, EventLog, EventLogError};
pub use ids::{ActorId, DeviceId, IdParseError, KeyId, ObjectId, WorkspaceId};
pub use objects::{
    reduce_document_operation, reduce_document_operations, reduce_incident_operation,
    reduce_incident_operations, reduce_task_operation, reduce_task_operations, AttachmentAdded,
    AttachmentContentReplaced, AttachmentOperation, AttachmentRemoved, AttachmentRenamed,
    CommentCreated, CommentDeleted, CommentEdited, CommentOperation, DocumentArchived,
    DocumentBodyReplaced, DocumentCreated, DocumentDeleted, DocumentOperation, DocumentState,
    DocumentTagsReplaced, DocumentTitleChanged,
    IncidentEvidence, IncidentEvidenceAdded, IncidentEvidenceRemoved, IncidentOpened,
    IncidentOperation, IncidentSeverity, IncidentSeverityChanged, IncidentState, IncidentStatus,
    IncidentStatusChanged, ObjectKind, ObjectOperation, ObjectReducerError, ProjectArchived,
    ProjectCreated, ProjectDescriptionChanged, ProjectOperation, ProjectRenamed, TaskArchived,
    TaskAssigneeChanged, TaskCreated, TaskDescriptionChanged, TaskOperation, TaskProjectChanged,
    TaskState, TaskStatus, TaskStatusChanged, TaskTitleChanged,
};
pub use policy::{Capability, Decision, PolicyRequest, PolicyRule, RiskLevel};
pub use sync::{
    classify_conflict, ClockOrdering, ConflictClassification, ConflictKind, SyncChange,
    SyncChangeKind, VectorClock, VectorClockError,
};
