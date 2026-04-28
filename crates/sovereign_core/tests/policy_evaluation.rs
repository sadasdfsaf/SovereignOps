//! Integration coverage for policy evaluation rule behavior.

use sovereign_core::{
    policy::{DecisionKind, PolicyEvaluationRule, PolicyMatcher, PolicyRuleSet, RuleEffect},
    ActorId, Capability, ObjectId, PolicyRequest, RiskLevel, WorkspaceId,
};

fn request(
    actor: &str,
    object: Option<&str>,
    capability: Capability,
    risk: RiskLevel,
) -> Result<PolicyRequest, Box<dyn std::error::Error>> {
    let object_id = match object {
        Some(value) => Some(ObjectId::parse(value)?),
        None => None,
    };

    Ok(PolicyRequest {
        workspace_id: WorkspaceId::parse("wsp_demo")?,
        actor_id: ActorId::parse(actor)?,
        object_id,
        capability,
        risk,
    })
}

fn rule_set() -> Result<PolicyRuleSet, Box<dyn std::error::Error>> {
    Ok(PolicyRuleSet::new(vec![
        PolicyEvaluationRule::new(
            "quarantine-held-object",
            PolicyMatcher::Object(ObjectId::parse("obj_hold-1")?),
            RuleEffect::Quarantine,
            "object is isolated for follow-up handling",
        ),
        PolicyEvaluationRule::new(
            "deny-blocked-actor",
            PolicyMatcher::AnyOf(vec![
                PolicyMatcher::Actor(ActorId::parse("act_blocked")?),
                PolicyMatcher::Object(ObjectId::parse("obj_closed-1")?),
            ]),
            RuleEffect::Deny,
            "actor or object is not enabled for this workspace",
        ),
        PolicyEvaluationRule::new(
            "elevate-plugin-management",
            PolicyMatcher::All(vec![
                PolicyMatcher::Capability(Capability::ManagePlugin),
                PolicyMatcher::RiskAtOrAbove(RiskLevel::Medium),
            ]),
            RuleEffect::RequireElevation,
            "plugin management requires a stronger actor context",
        ),
        PolicyEvaluationRule::new(
            "approve-medium-write",
            PolicyMatcher::All(vec![
                PolicyMatcher::Capability(Capability::WriteObject),
                PolicyMatcher::RiskAtOrAbove(RiskLevel::Medium),
            ]),
            RuleEffect::RequireApproval,
            "write request requires approval",
        ),
        PolicyEvaluationRule::new(
            "allow-low-read",
            PolicyMatcher::All(vec![
                PolicyMatcher::Workspace(WorkspaceId::parse("wsp_demo")?),
                PolicyMatcher::Capability(Capability::ReadObject),
                PolicyMatcher::RiskAtOrBelow(RiskLevel::Low),
            ]),
            RuleEffect::Allow,
            "read request is within workspace rule",
        ),
    ]))
}

#[test]
fn evaluates_decision_branches_from_table() -> Result<(), Box<dyn std::error::Error>> {
    #[derive(Clone, Copy)]
    struct Case {
        name: &'static str,
        actor: &'static str,
        object: Option<&'static str>,
        capability: Capability,
        risk: RiskLevel,
        expected: DecisionKind,
        rule_id: &'static str,
        reason: &'static str,
    }

    let cases = [
        Case {
            name: "allow",
            actor: "act_builder",
            object: Some("obj_note-1"),
            capability: Capability::ReadObject,
            risk: RiskLevel::Low,
            expected: DecisionKind::Allow,
            rule_id: "allow-low-read",
            reason: "read request is within workspace rule",
        },
        Case {
            name: "deny",
            actor: "act_blocked",
            object: Some("obj_note-1"),
            capability: Capability::ReadObject,
            risk: RiskLevel::Low,
            expected: DecisionKind::Deny,
            rule_id: "deny-blocked-actor",
            reason: "actor or object is not enabled for this workspace",
        },
        Case {
            name: "approval",
            actor: "act_builder",
            object: Some("obj_note-1"),
            capability: Capability::WriteObject,
            risk: RiskLevel::Medium,
            expected: DecisionKind::RequireApproval,
            rule_id: "approve-medium-write",
            reason: "write request requires approval",
        },
        Case {
            name: "elevation",
            actor: "act_builder",
            object: None,
            capability: Capability::ManagePlugin,
            risk: RiskLevel::High,
            expected: DecisionKind::RequireElevation,
            rule_id: "elevate-plugin-management",
            reason: "plugin management requires a stronger actor context",
        },
        Case {
            name: "quarantine",
            actor: "act_builder",
            object: Some("obj_hold-1"),
            capability: Capability::ReadObject,
            risk: RiskLevel::Low,
            expected: DecisionKind::Quarantine,
            rule_id: "quarantine-held-object",
            reason: "object is isolated for follow-up handling",
        },
    ];

    let rules = rule_set()?;
    for case in cases {
        let evaluation = rules.evaluate(&request(
            case.actor,
            case.object,
            case.capability,
            case.risk,
        )?);

        assert_eq!(
            case.expected,
            evaluation.decision.kind(),
            "case {}",
            case.name
        );
        assert_eq!(
            case.reason,
            evaluation.decision.reason(),
            "case {}",
            case.name
        );
        assert_eq!(
            Some(case.rule_id),
            evaluation.matched_rule_id.as_deref(),
            "case {}",
            case.name
        );

        let trace_has_matching_rule = evaluation.trace.steps.iter().any(|step| {
            step.rule_id.as_deref() == Some(case.rule_id)
                && step.matched
                && step.decision == Some(case.expected)
        });
        assert!(trace_has_matching_rule, "case {}", case.name);
    }

    Ok(())
}

#[test]
fn default_outcome_records_explanation_trace() -> Result<(), Box<dyn std::error::Error>> {
    let rules = PolicyRuleSet::new(Vec::new())
        .with_default(RuleEffect::RequireApproval, "fallback approval");
    let evaluation = rules.evaluate(&request(
        "act_builder",
        Some("obj_note-1"),
        Capability::SyncBundle,
        RiskLevel::Low,
    )?);

    assert_eq!(DecisionKind::RequireApproval, evaluation.decision.kind());
    assert_eq!("fallback approval", evaluation.decision.reason());
    assert_eq!(None, evaluation.matched_rule_id.as_deref());

    let default_step = evaluation
        .trace
        .steps
        .iter()
        .find(|step| step.rule_id.is_none());
    assert!(matches!(
        default_step,
        Some(step)
            if step.matched && step.decision == Some(DecisionKind::RequireApproval)
    ));

    Ok(())
}

#[test]
fn matchers_cover_request_axes() -> Result<(), Box<dyn std::error::Error>> {
    let policy_request = request(
        "act_builder",
        Some("obj_note-1"),
        Capability::WriteObject,
        RiskLevel::Medium,
    )?;

    let cases = vec![
        ("any", PolicyMatcher::Any, true),
        (
            "workspace",
            PolicyMatcher::Workspace(WorkspaceId::parse("wsp_demo")?),
            true,
        ),
        (
            "actor",
            PolicyMatcher::Actor(ActorId::parse("act_builder")?),
            true,
        ),
        (
            "object",
            PolicyMatcher::Object(ObjectId::parse("obj_note-1")?),
            true,
        ),
        (
            "capability-miss",
            PolicyMatcher::Capability(Capability::ReadObject),
            false,
        ),
        (
            "risk-below-miss",
            PolicyMatcher::RiskAtOrBelow(RiskLevel::Low),
            false,
        ),
        (
            "risk-above-hit",
            PolicyMatcher::RiskAtOrAbove(RiskLevel::Low),
            true,
        ),
        (
            "all-hit",
            PolicyMatcher::All(vec![
                PolicyMatcher::Actor(ActorId::parse("act_builder")?),
                PolicyMatcher::Capability(Capability::WriteObject),
            ]),
            true,
        ),
        ("all-empty-miss", PolicyMatcher::All(Vec::new()), false),
        (
            "any-of-hit",
            PolicyMatcher::AnyOf(vec![
                PolicyMatcher::Capability(Capability::ReadObject),
                PolicyMatcher::Object(ObjectId::parse("obj_note-1")?),
            ]),
            true,
        ),
        ("any-of-empty-miss", PolicyMatcher::AnyOf(Vec::new()), false),
    ];

    for (name, matcher, expected) in cases {
        assert_eq!(expected, matcher.matches(&policy_request), "matcher {name}");
    }

    Ok(())
}
