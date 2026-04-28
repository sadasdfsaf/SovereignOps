//! Object operation models and deterministic reducers for workspace records.

use core::fmt;

use crate::ids::{ActorId, ObjectId};

/// Supported object families for workspace records.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub enum ObjectKind {
    /// A project object.
    Project,
    /// A task object.
    Task,
    /// A document object.
    Document,
    /// An incident object.
    Incident,
    /// A comment object.
    Comment,
    /// An attachment object.
    Attachment,
}

/// Type-erased object operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ObjectOperation {
    /// Project operation.
    Project(ProjectOperation),
    /// Task operation.
    Task(TaskOperation),
    /// Document operation.
    Document(DocumentOperation),
    /// Incident operation.
    Incident(IncidentOperation),
    /// Comment operation.
    Comment(CommentOperation),
    /// Attachment operation.
    Attachment(AttachmentOperation),
}

impl ObjectOperation {
    /// Return the object family affected by this operation.
    pub fn kind(&self) -> ObjectKind {
        match self {
            Self::Project(_) => ObjectKind::Project,
            Self::Task(_) => ObjectKind::Task,
            Self::Document(_) => ObjectKind::Document,
            Self::Incident(_) => ObjectKind::Incident,
            Self::Comment(_) => ObjectKind::Comment,
            Self::Attachment(_) => ObjectKind::Attachment,
        }
    }

    /// Return the target object identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Project(operation) => operation.object_id(),
            Self::Task(operation) => operation.object_id(),
            Self::Document(operation) => operation.object_id(),
            Self::Incident(operation) => operation.object_id(),
            Self::Comment(operation) => operation.object_id(),
            Self::Attachment(operation) => operation.object_id(),
        }
    }

    /// Return a stable operation name suitable for event envelopes.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Project(operation) => operation.operation_name(),
            Self::Task(operation) => operation.operation_name(),
            Self::Document(operation) => operation.operation_name(),
            Self::Incident(operation) => operation.operation_name(),
            Self::Comment(operation) => operation.operation_name(),
            Self::Attachment(operation) => operation.operation_name(),
        }
    }
}

/// Project object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ProjectOperation {
    /// Create a project.
    Create(ProjectCreated),
    /// Change the project name.
    Rename(ProjectRenamed),
    /// Change the project description.
    ChangeDescription(ProjectDescriptionChanged),
    /// Mark or unmark the project as archived.
    SetArchived(ProjectArchived),
}

impl ProjectOperation {
    /// Return the project identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Create(operation) => &operation.project_id,
            Self::Rename(operation) => &operation.project_id,
            Self::ChangeDescription(operation) => &operation.project_id,
            Self::SetArchived(operation) => &operation.project_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Create(_) => "project.created",
            Self::Rename(_) => "project.renamed",
            Self::ChangeDescription(_) => "project.description_changed",
            Self::SetArchived(_) => "project.archived_changed",
        }
    }
}

/// Data required to create a project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectCreated {
    /// Project identifier.
    pub project_id: ObjectId,
    /// Project display name.
    pub name: String,
    /// Project description.
    pub description: String,
}

/// Data required to rename a project.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectRenamed {
    /// Project identifier.
    pub project_id: ObjectId,
    /// New project display name.
    pub name: String,
}

/// Data required to update a project description.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectDescriptionChanged {
    /// Project identifier.
    pub project_id: ObjectId,
    /// New project description.
    pub description: String,
}

/// Data required to update a project archive marker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectArchived {
    /// Project identifier.
    pub project_id: ObjectId,
    /// Whether the project is archived.
    pub archived: bool,
}

/// Task workflow status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskStatus {
    /// Work has not started.
    Open,
    /// Work is active.
    InProgress,
    /// Work is blocked by another condition.
    Blocked,
    /// Work is complete.
    Done,
    /// Work has been cancelled.
    Cancelled,
}

/// Task object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaskOperation {
    /// Create a task.
    Create(TaskCreated),
    /// Change the task title.
    ChangeTitle(TaskTitleChanged),
    /// Change the task description.
    ChangeDescription(TaskDescriptionChanged),
    /// Change the task status.
    ChangeStatus(TaskStatusChanged),
    /// Change the task assignee.
    ChangeAssignee(TaskAssigneeChanged),
    /// Move the task between projects or remove its project link.
    ChangeProject(TaskProjectChanged),
    /// Mark or unmark the task as archived.
    SetArchived(TaskArchived),
}

impl TaskOperation {
    /// Return the task identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Create(operation) => &operation.task_id,
            Self::ChangeTitle(operation) => &operation.task_id,
            Self::ChangeDescription(operation) => &operation.task_id,
            Self::ChangeStatus(operation) => &operation.task_id,
            Self::ChangeAssignee(operation) => &operation.task_id,
            Self::ChangeProject(operation) => &operation.task_id,
            Self::SetArchived(operation) => &operation.task_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Create(_) => "task.created",
            Self::ChangeTitle(_) => "task.title_changed",
            Self::ChangeDescription(_) => "task.description_changed",
            Self::ChangeStatus(_) => "task.status_changed",
            Self::ChangeAssignee(_) => "task.assignee_changed",
            Self::ChangeProject(_) => "task.project_changed",
            Self::SetArchived(_) => "task.archived_changed",
        }
    }
}

/// Data required to create a task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskCreated {
    /// Task identifier.
    pub task_id: ObjectId,
    /// Optional project containing this task.
    pub project_id: Option<ObjectId>,
    /// Task title.
    pub title: String,
    /// Task description.
    pub description: String,
    /// Optional actor assigned to the task.
    pub assigned_to: Option<ActorId>,
}

/// Data required to update a task title.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskTitleChanged {
    /// Task identifier.
    pub task_id: ObjectId,
    /// New task title.
    pub title: String,
}

/// Data required to update a task description.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskDescriptionChanged {
    /// Task identifier.
    pub task_id: ObjectId,
    /// New task description.
    pub description: String,
}

/// Data required to update task status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskStatusChanged {
    /// Task identifier.
    pub task_id: ObjectId,
    /// New task status.
    pub status: TaskStatus,
}

/// Data required to update a task assignee.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskAssigneeChanged {
    /// Task identifier.
    pub task_id: ObjectId,
    /// Optional actor assigned to the task.
    pub assigned_to: Option<ActorId>,
}

/// Data required to update a task project link.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskProjectChanged {
    /// Task identifier.
    pub task_id: ObjectId,
    /// Optional project containing this task.
    pub project_id: Option<ObjectId>,
}

/// Data required to update a task archive marker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskArchived {
    /// Task identifier.
    pub task_id: ObjectId,
    /// Whether the task is archived.
    pub archived: bool,
}

/// Reduced task state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TaskState {
    /// Task identifier.
    pub task_id: ObjectId,
    /// Optional project containing this task.
    pub project_id: Option<ObjectId>,
    /// Task title.
    pub title: String,
    /// Task description.
    pub description: String,
    /// Current task status.
    pub status: TaskStatus,
    /// Optional actor assigned to the task.
    pub assigned_to: Option<ActorId>,
    /// Whether the task is archived.
    pub archived: bool,
    /// Number of accepted operations represented by this state.
    pub version: u64,
}

/// Document object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DocumentOperation {
    /// Create a document.
    Create(DocumentCreated),
    /// Change the document title.
    ChangeTitle(DocumentTitleChanged),
    /// Replace the document body.
    ReplaceBody(DocumentBodyReplaced),
    /// Replace the document tags.
    ReplaceTags(DocumentTagsReplaced),
    /// Mark or unmark the document as archived.
    SetArchived(DocumentArchived),
    /// Mark the document as deleted.
    Delete(DocumentDeleted),
}

impl DocumentOperation {
    /// Return the document identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Create(operation) => &operation.document_id,
            Self::ChangeTitle(operation) => &operation.document_id,
            Self::ReplaceBody(operation) => &operation.document_id,
            Self::ReplaceTags(operation) => &operation.document_id,
            Self::SetArchived(operation) => &operation.document_id,
            Self::Delete(operation) => &operation.document_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Create(_) => "document.created",
            Self::ChangeTitle(_) => "document.title_changed",
            Self::ReplaceBody(_) => "document.body_replaced",
            Self::ReplaceTags(_) => "document.tags_replaced",
            Self::SetArchived(_) => "document.archived_changed",
            Self::Delete(_) => "document.deleted",
        }
    }
}

/// Data required to create a document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentCreated {
    /// Document identifier.
    pub document_id: ObjectId,
    /// Document title.
    pub title: String,
    /// Document body.
    pub body: String,
    /// Document tags.
    pub tags: Vec<String>,
}

/// Data required to update a document title.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentTitleChanged {
    /// Document identifier.
    pub document_id: ObjectId,
    /// New document title.
    pub title: String,
}

/// Data required to replace a document body.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentBodyReplaced {
    /// Document identifier.
    pub document_id: ObjectId,
    /// New document body.
    pub body: String,
}

/// Data required to replace document tags.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentTagsReplaced {
    /// Document identifier.
    pub document_id: ObjectId,
    /// Replacement document tags.
    pub tags: Vec<String>,
}

/// Data required to update a document archive marker.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentArchived {
    /// Document identifier.
    pub document_id: ObjectId,
    /// Whether the document is archived.
    pub archived: bool,
}

/// Data required to delete a document.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentDeleted {
    /// Document identifier.
    pub document_id: ObjectId,
}

/// Reduced document state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentState {
    /// Document identifier.
    pub document_id: ObjectId,
    /// Document title.
    pub title: String,
    /// Document body.
    pub body: String,
    /// Document tags.
    pub tags: Vec<String>,
    /// Whether the document is archived.
    pub archived: bool,
    /// Whether the document is deleted.
    pub deleted: bool,
    /// Number of accepted operations represented by this state.
    pub version: u64,
}

/// Incident severity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncidentSeverity {
    /// Low severity.
    Low,
    /// Medium severity.
    Medium,
    /// High severity.
    High,
    /// Critical severity.
    Critical,
}

/// Incident lifecycle status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncidentStatus {
    /// Newly opened.
    Open,
    /// Active handling is underway.
    Active,
    /// The impact has been contained.
    Mitigated,
    /// Work is complete.
    Closed,
}

/// Evidence linked to an incident.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentEvidence {
    /// Evidence identifier.
    pub evidence_id: ObjectId,
    /// Short evidence label.
    pub label: String,
    /// Longer evidence description.
    pub description: String,
    /// Optional content digest for an associated artifact.
    pub content_digest: Option<String>,
}

/// Incident object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IncidentOperation {
    /// Open an incident.
    Open(IncidentOpened),
    /// Change incident severity.
    ChangeSeverity(IncidentSeverityChanged),
    /// Change incident status.
    ChangeStatus(IncidentStatusChanged),
    /// Add evidence to an incident.
    AddEvidence(IncidentEvidenceAdded),
    /// Remove evidence from an incident.
    RemoveEvidence(IncidentEvidenceRemoved),
}

impl IncidentOperation {
    /// Return the incident identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Open(operation) => &operation.incident_id,
            Self::ChangeSeverity(operation) => &operation.incident_id,
            Self::ChangeStatus(operation) => &operation.incident_id,
            Self::AddEvidence(operation) => &operation.incident_id,
            Self::RemoveEvidence(operation) => &operation.incident_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Open(_) => "incident.opened",
            Self::ChangeSeverity(_) => "incident.severity_changed",
            Self::ChangeStatus(_) => "incident.status_changed",
            Self::AddEvidence(_) => "incident.evidence_added",
            Self::RemoveEvidence(_) => "incident.evidence_removed",
        }
    }
}

/// Data required to open an incident.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentOpened {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// Incident title.
    pub title: String,
    /// Initial severity.
    pub severity: IncidentSeverity,
    /// Initial status.
    pub status: IncidentStatus,
}

/// Data required to update incident severity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentSeverityChanged {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// New incident severity.
    pub severity: IncidentSeverity,
}

/// Data required to update incident status.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentStatusChanged {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// New incident status.
    pub status: IncidentStatus,
}

/// Data required to add incident evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentEvidenceAdded {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// Evidence identifier.
    pub evidence_id: ObjectId,
    /// Short evidence label.
    pub label: String,
    /// Longer evidence description.
    pub description: String,
    /// Optional content digest for an associated artifact.
    pub content_digest: Option<String>,
}

/// Data required to remove incident evidence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentEvidenceRemoved {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// Evidence identifier.
    pub evidence_id: ObjectId,
}

/// Reduced incident state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IncidentState {
    /// Incident identifier.
    pub incident_id: ObjectId,
    /// Incident title.
    pub title: String,
    /// Current incident severity.
    pub severity: IncidentSeverity,
    /// Current incident status.
    pub status: IncidentStatus,
    /// Evidence linked to this incident.
    pub evidence: Vec<IncidentEvidence>,
    /// Number of accepted operations represented by this state.
    pub version: u64,
}

/// Comment object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CommentOperation {
    /// Create a comment.
    Create(CommentCreated),
    /// Edit a comment body.
    Edit(CommentEdited),
    /// Mark a comment as deleted.
    Delete(CommentDeleted),
}

impl CommentOperation {
    /// Return the comment identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Create(operation) => &operation.comment_id,
            Self::Edit(operation) => &operation.comment_id,
            Self::Delete(operation) => &operation.comment_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Create(_) => "comment.created",
            Self::Edit(_) => "comment.edited",
            Self::Delete(_) => "comment.deleted",
        }
    }
}

/// Data required to create a comment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentCreated {
    /// Comment identifier.
    pub comment_id: ObjectId,
    /// Object that owns the comment.
    pub parent_id: ObjectId,
    /// Comment author.
    pub author_id: ActorId,
    /// Comment body.
    pub body: String,
}

/// Data required to edit a comment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentEdited {
    /// Comment identifier.
    pub comment_id: ObjectId,
    /// New comment body.
    pub body: String,
}

/// Data required to mark a comment deleted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CommentDeleted {
    /// Comment identifier.
    pub comment_id: ObjectId,
}

/// Attachment object operations.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AttachmentOperation {
    /// Add an attachment.
    Add(AttachmentAdded),
    /// Rename an attachment.
    Rename(AttachmentRenamed),
    /// Replace attachment content metadata.
    ReplaceContent(AttachmentContentReplaced),
    /// Remove an attachment.
    Remove(AttachmentRemoved),
}

impl AttachmentOperation {
    /// Return the attachment identifier affected by this operation.
    pub fn object_id(&self) -> &ObjectId {
        match self {
            Self::Add(operation) => &operation.attachment_id,
            Self::Rename(operation) => &operation.attachment_id,
            Self::ReplaceContent(operation) => &operation.attachment_id,
            Self::Remove(operation) => &operation.attachment_id,
        }
    }

    /// Return a stable event operation name.
    pub fn operation_name(&self) -> &'static str {
        match self {
            Self::Add(_) => "attachment.added",
            Self::Rename(_) => "attachment.renamed",
            Self::ReplaceContent(_) => "attachment.content_replaced",
            Self::Remove(_) => "attachment.removed",
        }
    }
}

/// Data required to add an attachment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentAdded {
    /// Attachment identifier.
    pub attachment_id: ObjectId,
    /// Object that owns the attachment.
    pub parent_id: ObjectId,
    /// Attachment file name.
    pub name: String,
    /// Attachment media type.
    pub media_type: String,
    /// Content digest for the attachment bytes.
    pub content_digest: String,
    /// Attachment size in bytes.
    pub byte_len: u64,
}

/// Data required to rename an attachment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentRenamed {
    /// Attachment identifier.
    pub attachment_id: ObjectId,
    /// New attachment file name.
    pub name: String,
}

/// Data required to replace attachment content metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentContentReplaced {
    /// Attachment identifier.
    pub attachment_id: ObjectId,
    /// New attachment media type.
    pub media_type: String,
    /// New content digest for the attachment bytes.
    pub content_digest: String,
    /// New attachment size in bytes.
    pub byte_len: u64,
}

/// Data required to remove an attachment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentRemoved {
    /// Attachment identifier.
    pub attachment_id: ObjectId,
}

/// Reducer validation and ordering failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ObjectReducerError {
    /// A mutation was reduced before its create operation.
    MissingCreate {
        /// Object that received a mutation before creation.
        object_id: ObjectId,
        /// Operation being applied.
        operation: &'static str,
    },
    /// A create operation was reduced after state already existed.
    DuplicateCreate {
        /// Object that already exists in the reducer state.
        object_id: ObjectId,
    },
    /// An operation targeted a different object than the current reducer state.
    ObjectMismatch {
        /// Object already represented by reducer state.
        held: ObjectId,
        /// Object targeted by the operation.
        actual: ObjectId,
    },
    /// A required text field was blank.
    BlankField {
        /// Object being changed.
        object_id: ObjectId,
        /// Name of the blank field.
        field: &'static str,
    },
    /// Evidence with the same identifier already exists.
    DuplicateEvidence {
        /// Evidence identifier.
        evidence_id: ObjectId,
    },
    /// Evidence could not be found.
    MissingEvidence {
        /// Evidence identifier.
        evidence_id: ObjectId,
    },
}

impl fmt::Display for ObjectReducerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::MissingCreate {
                object_id,
                operation,
            } => write!(
                f,
                "{operation} requires create operation before mutating {object_id}"
            ),
            Self::DuplicateCreate { object_id } => {
                write!(f, "create operation was repeated for {object_id}")
            }
            Self::ObjectMismatch { held, actual } => {
                write!(f, "operation targeted {actual}, but reducer holds {held}")
            }
            Self::BlankField { object_id, field } => {
                write!(f, "{field} must not be blank for {object_id}")
            }
            Self::DuplicateEvidence { evidence_id } => {
                write!(f, "evidence already exists: {evidence_id}")
            }
            Self::MissingEvidence { evidence_id } => {
                write!(f, "evidence does not exist: {evidence_id}")
            }
        }
    }
}

impl std::error::Error for ObjectReducerError {}

/// Apply one task operation to an optional task state.
pub fn reduce_task_operation(
    state: Option<TaskState>,
    operation: &TaskOperation,
) -> Result<Option<TaskState>, ObjectReducerError> {
    match operation {
        TaskOperation::Create(created) => {
            if state.is_some() {
                return Err(ObjectReducerError::DuplicateCreate {
                    object_id: created.task_id.clone(),
                });
            }
            require_text(&created.task_id, "title", &created.title)?;
            Ok(Some(TaskState {
                task_id: created.task_id.clone(),
                project_id: created.project_id.clone(),
                title: created.title.clone(),
                description: created.description.clone(),
                status: TaskStatus::Open,
                assigned_to: created.assigned_to.clone(),
                archived: false,
                version: 1,
            }))
        }
        TaskOperation::ChangeTitle(changed) => {
            require_text(&changed.task_id, "title", &changed.title)?;
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.title.clone_from(&changed.title);
            current.version += 1;
            Ok(Some(current))
        }
        TaskOperation::ChangeDescription(changed) => {
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.description.clone_from(&changed.description);
            current.version += 1;
            Ok(Some(current))
        }
        TaskOperation::ChangeStatus(changed) => {
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.status.clone_from(&changed.status);
            current.version += 1;
            Ok(Some(current))
        }
        TaskOperation::ChangeAssignee(changed) => {
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.assigned_to.clone_from(&changed.assigned_to);
            current.version += 1;
            Ok(Some(current))
        }
        TaskOperation::ChangeProject(changed) => {
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.project_id.clone_from(&changed.project_id);
            current.version += 1;
            Ok(Some(current))
        }
        TaskOperation::SetArchived(changed) => {
            let mut current = require_task_state(state, operation)?;
            ensure_same_object(&current.task_id, &changed.task_id)?;
            current.archived = changed.archived;
            current.version += 1;
            Ok(Some(current))
        }
    }
}

/// Reduce task operations in their append order.
pub fn reduce_task_operations<'a>(
    operations: impl IntoIterator<Item = &'a TaskOperation>,
) -> Result<Option<TaskState>, ObjectReducerError> {
    let mut state = None;
    for operation in operations {
        state = reduce_task_operation(state, operation)?;
    }
    Ok(state)
}

/// Apply one document operation to an optional document state.
pub fn reduce_document_operation(
    state: Option<DocumentState>,
    operation: &DocumentOperation,
) -> Result<Option<DocumentState>, ObjectReducerError> {
    match operation {
        DocumentOperation::Create(created) => {
            if state.is_some() {
                return Err(ObjectReducerError::DuplicateCreate {
                    object_id: created.document_id.clone(),
                });
            }
            require_text(&created.document_id, "title", &created.title)?;
            Ok(Some(DocumentState {
                document_id: created.document_id.clone(),
                title: created.title.clone(),
                body: created.body.clone(),
                tags: normalize_tags(&created.tags),
                archived: false,
                deleted: false,
                version: 1,
            }))
        }
        DocumentOperation::ChangeTitle(changed) => {
            require_text(&changed.document_id, "title", &changed.title)?;
            let mut current = require_document_state(state, operation)?;
            ensure_same_object(&current.document_id, &changed.document_id)?;
            current.title.clone_from(&changed.title);
            current.version += 1;
            Ok(Some(current))
        }
        DocumentOperation::ReplaceBody(changed) => {
            let mut current = require_document_state(state, operation)?;
            ensure_same_object(&current.document_id, &changed.document_id)?;
            current.body.clone_from(&changed.body);
            current.version += 1;
            Ok(Some(current))
        }
        DocumentOperation::ReplaceTags(changed) => {
            let mut current = require_document_state(state, operation)?;
            ensure_same_object(&current.document_id, &changed.document_id)?;
            current.tags = normalize_tags(&changed.tags);
            current.version += 1;
            Ok(Some(current))
        }
        DocumentOperation::SetArchived(changed) => {
            let mut current = require_document_state(state, operation)?;
            ensure_same_object(&current.document_id, &changed.document_id)?;
            current.archived = changed.archived;
            current.version += 1;
            Ok(Some(current))
        }
        DocumentOperation::Delete(deleted) => {
            let mut current = require_document_state(state, operation)?;
            ensure_same_object(&current.document_id, &deleted.document_id)?;
            current.deleted = true;
            current.version += 1;
            Ok(Some(current))
        }
    }
}

/// Reduce document operations in their append order.
pub fn reduce_document_operations<'a>(
    operations: impl IntoIterator<Item = &'a DocumentOperation>,
) -> Result<Option<DocumentState>, ObjectReducerError> {
    let mut state = None;
    for operation in operations {
        state = reduce_document_operation(state, operation)?;
    }
    Ok(state)
}

/// Apply one incident operation to an optional incident state.
pub fn reduce_incident_operation(
    state: Option<IncidentState>,
    operation: &IncidentOperation,
) -> Result<Option<IncidentState>, ObjectReducerError> {
    match operation {
        IncidentOperation::Open(opened) => {
            if state.is_some() {
                return Err(ObjectReducerError::DuplicateCreate {
                    object_id: opened.incident_id.clone(),
                });
            }
            require_text(&opened.incident_id, "title", &opened.title)?;
            Ok(Some(IncidentState {
                incident_id: opened.incident_id.clone(),
                title: opened.title.clone(),
                severity: opened.severity.clone(),
                status: opened.status.clone(),
                evidence: Vec::new(),
                version: 1,
            }))
        }
        IncidentOperation::ChangeSeverity(changed) => {
            let mut current = require_incident_state(state, operation)?;
            ensure_same_object(&current.incident_id, &changed.incident_id)?;
            current.severity.clone_from(&changed.severity);
            current.version += 1;
            Ok(Some(current))
        }
        IncidentOperation::ChangeStatus(changed) => {
            let mut current = require_incident_state(state, operation)?;
            ensure_same_object(&current.incident_id, &changed.incident_id)?;
            current.status.clone_from(&changed.status);
            current.version += 1;
            Ok(Some(current))
        }
        IncidentOperation::AddEvidence(added) => {
            require_text(&added.incident_id, "label", &added.label)?;
            let mut current = require_incident_state(state, operation)?;
            ensure_same_object(&current.incident_id, &added.incident_id)?;
            if current
                .evidence
                .iter()
                .any(|evidence| evidence.evidence_id == added.evidence_id)
            {
                return Err(ObjectReducerError::DuplicateEvidence {
                    evidence_id: added.evidence_id.clone(),
                });
            }
            current.evidence.push(IncidentEvidence {
                evidence_id: added.evidence_id.clone(),
                label: added.label.clone(),
                description: added.description.clone(),
                content_digest: added.content_digest.clone(),
            });
            current.version += 1;
            Ok(Some(current))
        }
        IncidentOperation::RemoveEvidence(removed) => {
            let mut current = require_incident_state(state, operation)?;
            ensure_same_object(&current.incident_id, &removed.incident_id)?;
            let evidence_count = current.evidence.len();
            current
                .evidence
                .retain(|evidence| evidence.evidence_id != removed.evidence_id);
            if current.evidence.len() == evidence_count {
                return Err(ObjectReducerError::MissingEvidence {
                    evidence_id: removed.evidence_id.clone(),
                });
            }
            current.version += 1;
            Ok(Some(current))
        }
    }
}

/// Reduce incident operations in their append order.
pub fn reduce_incident_operations<'a>(
    operations: impl IntoIterator<Item = &'a IncidentOperation>,
) -> Result<Option<IncidentState>, ObjectReducerError> {
    let mut state = None;
    for operation in operations {
        state = reduce_incident_operation(state, operation)?;
    }
    Ok(state)
}

fn require_task_state(
    state: Option<TaskState>,
    operation: &TaskOperation,
) -> Result<TaskState, ObjectReducerError> {
    state.ok_or_else(|| ObjectReducerError::MissingCreate {
        object_id: operation.object_id().clone(),
        operation: operation.operation_name(),
    })
}

fn require_document_state(
    state: Option<DocumentState>,
    operation: &DocumentOperation,
) -> Result<DocumentState, ObjectReducerError> {
    state.ok_or_else(|| ObjectReducerError::MissingCreate {
        object_id: operation.object_id().clone(),
        operation: operation.operation_name(),
    })
}

fn require_incident_state(
    state: Option<IncidentState>,
    operation: &IncidentOperation,
) -> Result<IncidentState, ObjectReducerError> {
    state.ok_or_else(|| ObjectReducerError::MissingCreate {
        object_id: operation.object_id().clone(),
        operation: operation.operation_name(),
    })
}

fn ensure_same_object(held: &ObjectId, actual: &ObjectId) -> Result<(), ObjectReducerError> {
    if held == actual {
        Ok(())
    } else {
        Err(ObjectReducerError::ObjectMismatch {
            held: held.clone(),
            actual: actual.clone(),
        })
    }
}

fn require_text(
    object_id: &ObjectId,
    field: &'static str,
    value: &str,
) -> Result<(), ObjectReducerError> {
    if value.trim().is_empty() {
        Err(ObjectReducerError::BlankField {
            object_id: object_id.clone(),
            field,
        })
    } else {
        Ok(())
    }
}

fn normalize_tags(tags: &[String]) -> Vec<String> {
    let mut normalized: Vec<String> = Vec::new();
    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty()
            || normalized
                .iter()
                .any(|existing| existing.as_str() == trimmed)
        {
            continue;
        }
        normalized.push(trimmed.to_owned());
    }
    normalized
}
