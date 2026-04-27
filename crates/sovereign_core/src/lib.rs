//! Core domain primitives for SovereignOps.
//!
//! This crate intentionally keeps its initial surface small: validated IDs,
//! append-only event ordering, agent policy decisions, and audit redaction.

pub mod audit;
pub mod event_log;
pub mod ids;
pub mod policy;

pub use audit::{redact_fields, AuditRecord, RedactedField};
pub use event_log::{EventEnvelope, EventLog, EventLogError};
pub use ids::{ActorId, DeviceId, IdParseError, KeyId, ObjectId, WorkspaceId};
pub use policy::{Capability, Decision, PolicyRequest, PolicyRule, RiskLevel};

