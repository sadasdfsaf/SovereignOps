use sovereign_core::{
    ActorId, Capability, Decision, EventEnvelope, EventLog, ObjectId, PolicyRequest, PolicyRule,
    RiskLevel, WorkspaceId,
};

#[test]
fn end_to_end_policy_then_event_append() -> Result<(), Box<dyn std::error::Error>> {
    let object_id = ObjectId::parse("obj_note-1")?;
    let request = PolicyRequest {
        workspace_id: WorkspaceId::parse("wsp_demo")?,
        actor_id: ActorId::parse("act_builder")?,
        object_id: Some(object_id.clone()),
        capability: Capability::WriteObject,
        risk: RiskLevel::Low,
    };
    let rule = PolicyRule {
        capability: Capability::WriteObject,
        max_auto_approve_risk: RiskLevel::Medium,
    };

    let decision = rule.evaluate(&request);
    assert!(matches!(decision, Decision::Allow { .. }));

    let mut log = EventLog::new();
    log.append(EventEnvelope {
        workspace_id: request.workspace_id,
        sequence: 1,
        actor_id: request.actor_id,
        object_id,
        operation: "object.updated".to_owned(),
        payload_digest: "digest-1".to_owned(),
        previous_digest: None,
    })?;

    assert_eq!(log.len(), 1);
    Ok(())
}
