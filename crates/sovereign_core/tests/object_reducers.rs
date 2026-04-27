use core::fmt;
use std::error::Error;

use sovereign_core::{
    reduce_document_operations, reduce_incident_operations, reduce_task_operations, AttachmentAdded,
    AttachmentOperation, CommentCreated, CommentOperation, DocumentArchived, DocumentBodyReplaced,
    DocumentCreated, DocumentDeleted, DocumentOperation, DocumentTagsReplaced, DocumentTitleChanged,
    IncidentEvidenceAdded,
    IncidentEvidenceRemoved, IncidentOpened, IncidentOperation, IncidentSeverity,
    IncidentSeverityChanged, IncidentStatus, IncidentStatusChanged, ObjectKind, ObjectOperation,
    ObjectReducerError, ProjectCreated, ProjectOperation, TaskArchived, TaskAssigneeChanged,
    TaskCreated, TaskOperation, TaskProjectChanged, TaskStatus, TaskStatusChanged, ActorId, ObjectId,
};

#[derive(Debug)]
struct TestError(String);

impl fmt::Display for TestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl Error for TestError {}

#[test]
fn object_operation_metadata_covers_supported_kinds() -> Result<(), Box<dyn Error>> {
    let project_id = object_id("obj_project-1")?;
    let task_id = object_id("obj_task-1")?;
    let document_id = object_id("obj_document-1")?;
    let incident_id = object_id("obj_incident-1")?;
    let comment_id = object_id("obj_comment-1")?;
    let attachment_id = object_id("obj_attachment-1")?;
    let actor_id = actor_id("act_member")?;

    let operations = vec![
        ObjectOperation::Project(ProjectOperation::Create(ProjectCreated {
            project_id: project_id.clone(),
            name: "Product workspace".to_owned(),
            description: "Shared delivery notes".to_owned(),
        })),
        ObjectOperation::Task(TaskOperation::Create(TaskCreated {
            task_id: task_id.clone(),
            project_id: Some(project_id),
            title: "Build checklist".to_owned(),
            description: "Prepare local workflow steps".to_owned(),
            assigned_to: Some(actor_id.clone()),
        })),
        ObjectOperation::Document(DocumentOperation::Create(DocumentCreated {
            document_id: document_id.clone(),
            title: "Design notes".to_owned(),
            body: "Initial outline".to_owned(),
            tags: vec!["design".to_owned()],
        })),
        ObjectOperation::Incident(IncidentOperation::Open(IncidentOpened {
            incident_id: incident_id.clone(),
            title: "Sync outage".to_owned(),
            severity: IncidentSeverity::Medium,
            status: IncidentStatus::Open,
        })),
        ObjectOperation::Comment(CommentOperation::Create(CommentCreated {
            comment_id: comment_id.clone(),
            parent_id: task_id,
            author_id: actor_id,
            body: "First observation".to_owned(),
        })),
        ObjectOperation::Attachment(AttachmentOperation::Add(AttachmentAdded {
            attachment_id: attachment_id.clone(),
            parent_id: document_id,
            name: "trace.txt".to_owned(),
            media_type: "text/plain".to_owned(),
            content_digest: "sha256:trace".to_owned(),
            byte_len: 128,
        })),
    ];

    let metadata: Vec<(ObjectKind, &str, &str)> = operations
        .iter()
        .map(|operation| {
            (
                operation.kind(),
                operation.object_id().as_str(),
                operation.operation_name(),
            )
        })
        .collect();

    check_eq(
        metadata,
        vec![
            (ObjectKind::Project, "obj_project-1", "project.created"),
            (ObjectKind::Task, "obj_task-1", "task.created"),
            (ObjectKind::Document, "obj_document-1", "document.created"),
            (ObjectKind::Incident, "obj_incident-1", "incident.opened"),
            (ObjectKind::Comment, "obj_comment-1", "comment.created"),
            (ObjectKind::Attachment, "obj_attachment-1", "attachment.added"),
        ],
        "operation metadata",
    )
}

#[test]
fn task_reducer_applies_status_project_assignee_and_archive_changes() -> Result<(), Box<dyn Error>> {
    let task_id = object_id("obj_task-2")?;
    let project_a = object_id("obj_project-a")?;
    let project_b = object_id("obj_project-b")?;
    let actor_id = actor_id("act_builder")?;
    let operations = vec![
        TaskOperation::Create(TaskCreated {
            task_id: task_id.clone(),
            project_id: Some(project_a),
            title: "Run local backup".to_owned(),
            description: "Capture encrypted workspace state".to_owned(),
            assigned_to: Some(actor_id.clone()),
        }),
        TaskOperation::ChangeStatus(TaskStatusChanged {
            task_id: task_id.clone(),
            status: TaskStatus::InProgress,
        }),
        TaskOperation::ChangeProject(TaskProjectChanged {
            task_id: task_id.clone(),
            project_id: Some(project_b.clone()),
        }),
        TaskOperation::ChangeAssignee(TaskAssigneeChanged {
            task_id: task_id.clone(),
            assigned_to: None,
        }),
        TaskOperation::SetArchived(TaskArchived {
            task_id: task_id.clone(),
            archived: true,
        }),
    ];

    let state = require_state(reduce_task_operations(&operations)?, "missing task state")?;

    check_eq(state.task_id, task_id, "task id")?;
    check_eq(state.project_id, Some(project_b), "task project")?;
    check_eq(state.status, TaskStatus::InProgress, "task status")?;
    check_eq(state.assigned_to, None, "task assignee")?;
    check_eq(state.archived, true, "task archive marker")?;
    check_eq(state.version, 5, "task version")
}

#[test]
fn document_reducer_replaces_body_tags_and_deletion() -> Result<(), Box<dyn Error>> {
    let document_id = object_id("obj_document-2")?;
    let operations = vec![
        DocumentOperation::Create(DocumentCreated {
            document_id: document_id.clone(),
            title: "Runbook".to_owned(),
            body: "Draft".to_owned(),
            tags: vec![" draft ".to_owned(), "draft".to_owned(), "".to_owned()],
        }),
        DocumentOperation::ReplaceBody(DocumentBodyReplaced {
            document_id: document_id.clone(),
            body: "Reviewed steps".to_owned(),
        }),
        DocumentOperation::ReplaceTags(DocumentTagsReplaced {
            document_id: document_id.clone(),
            tags: vec!["reviewed".to_owned(), "local".to_owned()],
        }),
        DocumentOperation::ChangeTitle(DocumentTitleChanged {
            document_id: document_id.clone(),
            title: "Runbook v2".to_owned(),
        }),
        DocumentOperation::SetArchived(DocumentArchived {
            document_id: document_id.clone(),
            archived: true,
        }),
        DocumentOperation::Delete(DocumentDeleted {
            document_id: document_id.clone(),
        }),
    ];

    let state = require_state(
        reduce_document_operations(&operations)?,
        "missing document state",
    )?;

    check_eq(state.document_id, document_id, "document id")?;
    check_eq(state.title, "Runbook v2".to_owned(), "document title")?;
    check_eq(state.body, "Reviewed steps".to_owned(), "document body")?;
    check_eq(
        state.tags,
        vec!["reviewed".to_owned(), "local".to_owned()],
        "document tags",
    )?;
    check_eq(state.archived, true, "document archive marker")?;
    check_eq(state.deleted, true, "document deleted marker")?;
    check_eq(state.version, 6, "document version")
}

#[test]
fn incident_reducer_tracks_severity_status_and_evidence() -> Result<(), Box<dyn Error>> {
    let incident_id = object_id("obj_incident-2")?;
    let evidence_a = object_id("obj_evidence-a")?;
    let evidence_b = object_id("obj_evidence-b")?;
    let operations = vec![
        IncidentOperation::Open(IncidentOpened {
            incident_id: incident_id.clone(),
            title: "Sync delay".to_owned(),
            severity: IncidentSeverity::Low,
            status: IncidentStatus::Open,
        }),
        IncidentOperation::ChangeSeverity(IncidentSeverityChanged {
            incident_id: incident_id.clone(),
            severity: IncidentSeverity::High,
        }),
        IncidentOperation::AddEvidence(IncidentEvidenceAdded {
            incident_id: incident_id.clone(),
            evidence_id: evidence_a.clone(),
            label: "Log excerpt".to_owned(),
            description: "Worker retry trace".to_owned(),
            content_digest: Some("sha256:retry".to_owned()),
        }),
        IncidentOperation::AddEvidence(IncidentEvidenceAdded {
            incident_id: incident_id.clone(),
            evidence_id: evidence_b.clone(),
            label: "Screenshot".to_owned(),
            description: "Queue depth panel".to_owned(),
            content_digest: None,
        }),
        IncidentOperation::RemoveEvidence(IncidentEvidenceRemoved {
            incident_id: incident_id.clone(),
            evidence_id: evidence_a,
        }),
        IncidentOperation::ChangeStatus(IncidentStatusChanged {
            incident_id: incident_id.clone(),
            status: IncidentStatus::Mitigated,
        }),
    ];

    let state = require_state(
        reduce_incident_operations(&operations)?,
        "missing incident state",
    )?;

    check_eq(state.incident_id, incident_id, "incident id")?;
    check_eq(state.severity, IncidentSeverity::High, "incident severity")?;
    check_eq(state.status, IncidentStatus::Mitigated, "incident status")?;
    check_eq(state.evidence.len(), 1, "incident evidence count")?;
    let evidence = state
        .evidence
        .first()
        .ok_or_else(|| test_error("missing remaining evidence"))?;
    check_eq(
        evidence.evidence_id.clone(),
        evidence_b,
        "remaining evidence",
    )?;
    check_eq(state.version, 6, "incident version")
}

#[test]
fn reducers_reject_mutations_before_create() -> Result<(), Box<dyn Error>> {
    let task_id = object_id("obj_task-3")?;
    let result = reduce_task_operations(&[TaskOperation::ChangeStatus(TaskStatusChanged {
        task_id: task_id.clone(),
        status: TaskStatus::Done,
    })]);

    match result {
        Err(ObjectReducerError::MissingCreate {
            object_id,
            operation,
        }) => {
            check_eq(object_id, task_id, "missing create id")?;
            check_eq(operation, "task.status_changed", "missing create operation")
        }
        Ok(_) => Err(test_error("mutation before create was accepted")),
        Err(error) => Err(test_error(format!("wrong error: {error}"))),
    }
}

fn object_id(value: &str) -> Result<ObjectId, Box<dyn Error>> {
    Ok(ObjectId::parse(value)?)
}

fn actor_id(value: &str) -> Result<ActorId, Box<dyn Error>> {
    Ok(ActorId::parse(value)?)
}

fn require_state<T>(state: Option<T>, message: &'static str) -> Result<T, Box<dyn Error>> {
    state.ok_or_else(|| test_error(message))
}

fn check_eq<T>(actual: T, wanted: T, context: &str) -> Result<(), Box<dyn Error>>
where
    T: fmt::Debug + PartialEq,
{
    if actual == wanted {
        Ok(())
    } else {
        Err(test_error(format!("{context}: wanted {wanted:?}, got {actual:?}")))
    }
}

fn test_error(message: impl Into<String>) -> Box<dyn Error> {
    Box::new(TestError(message.into()))
}
