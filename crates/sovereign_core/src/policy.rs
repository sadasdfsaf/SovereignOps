//! Policy request and decision primitives for agent-facing operations.

use crate::ids::{ActorId, ObjectId, WorkspaceId};

/// Coarse risk level assigned to a requested operation.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RiskLevel {
    /// Read-only or easily reversible action.
    Low,
    /// Action with durable local effects or broader data visibility.
    Medium,
    /// Action that requires explicit human review before execution.
    High,
}

/// Capability requested by an actor or plugin.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Capability {
    /// Read a workspace object.
    ReadObject,
    /// Mutate a workspace object.
    WriteObject,
    /// Ask an agent to prepare an action proposal.
    ProposeAgentAction,
    /// Register, update, or remove a plugin.
    ManagePlugin,
    /// Upload or download an encrypted sync bundle.
    SyncBundle,
}

/// Input to policy evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRequest {
    /// Workspace where the capability is requested.
    pub workspace_id: WorkspaceId,
    /// Actor requesting the capability.
    pub actor_id: ActorId,
    /// Optional object scope for the request.
    pub object_id: Option<ObjectId>,
    /// Requested capability.
    pub capability: Capability,
    /// Risk assigned by the caller before evaluation.
    pub risk: RiskLevel,
}

/// Stable category for a policy engine outcome.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecisionKind {
    /// The request may execute immediately.
    Allow,
    /// The request must be previewed and approved before execution.
    RequireApproval,
    /// The request needs a stronger actor context before execution.
    RequireElevation,
    /// The request must be isolated before follow-up handling.
    Quarantine,
    /// The request must not execute.
    Deny,
}

/// Policy engine outcome.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// The request may execute immediately.
    Allow { reason: String },
    /// The request must be previewed and approved before execution.
    RequireApproval { reason: String },
    /// The request needs a stronger actor context before execution.
    RequireElevation { reason: String },
    /// The request must be isolated before follow-up handling.
    Quarantine { reason: String },
    /// The request must not execute.
    Deny { reason: String },
}

impl Decision {
    /// Return the stable category for this decision.
    pub fn kind(&self) -> DecisionKind {
        match self {
            Self::Allow { .. } => DecisionKind::Allow,
            Self::RequireApproval { .. } => DecisionKind::RequireApproval,
            Self::RequireElevation { .. } => DecisionKind::RequireElevation,
            Self::Quarantine { .. } => DecisionKind::Quarantine,
            Self::Deny { .. } => DecisionKind::Deny,
        }
    }

    /// Borrow the human-readable decision reason.
    pub fn reason(&self) -> &str {
        match self {
            Self::Allow { reason }
            | Self::RequireApproval { reason }
            | Self::RequireElevation { reason }
            | Self::Quarantine { reason }
            | Self::Deny { reason } => reason,
        }
    }
}

/// Rule effect applied when a matcher accepts a request.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuleEffect {
    /// Allow the request immediately.
    Allow,
    /// Require approval before execution.
    RequireApproval,
    /// Require a stronger actor context before execution.
    RequireElevation,
    /// Isolate the request before follow-up handling.
    Quarantine,
    /// Deny the request.
    Deny,
}

impl RuleEffect {
    /// Return the decision category produced by this effect.
    pub fn decision_kind(self) -> DecisionKind {
        match self {
            Self::Allow => DecisionKind::Allow,
            Self::RequireApproval => DecisionKind::RequireApproval,
            Self::RequireElevation => DecisionKind::RequireElevation,
            Self::Quarantine => DecisionKind::Quarantine,
            Self::Deny => DecisionKind::Deny,
        }
    }

    fn into_decision(self, reason: String) -> Decision {
        match self {
            Self::Allow => Decision::Allow { reason },
            Self::RequireApproval => Decision::RequireApproval { reason },
            Self::RequireElevation => Decision::RequireElevation { reason },
            Self::Quarantine => Decision::Quarantine { reason },
            Self::Deny => Decision::Deny { reason },
        }
    }
}

/// Request matcher used by rule sets.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PolicyMatcher {
    /// Match every request.
    Any,
    /// Match requests in a specific workspace.
    Workspace(WorkspaceId),
    /// Match requests from a specific actor.
    Actor(ActorId),
    /// Match requests scoped to a specific object.
    Object(ObjectId),
    /// Match requests for a specific capability.
    Capability(Capability),
    /// Match requests at or below the configured risk level.
    RiskAtOrBelow(RiskLevel),
    /// Match requests at or above the configured risk level.
    RiskAtOrAbove(RiskLevel),
    /// Match only when every nested matcher accepts the request.
    All(Vec<PolicyMatcher>),
    /// Match when any nested matcher accepts the request.
    AnyOf(Vec<PolicyMatcher>),
}

impl PolicyMatcher {
    /// Evaluate the matcher against a request.
    pub fn matches(&self, request: &PolicyRequest) -> bool {
        match self {
            Self::Any => true,
            Self::Workspace(workspace_id) => &request.workspace_id == workspace_id,
            Self::Actor(actor_id) => &request.actor_id == actor_id,
            Self::Object(object_id) => request.object_id.as_ref() == Some(object_id),
            Self::Capability(capability) => request.capability == *capability,
            Self::RiskAtOrBelow(risk) => risk_rank(request.risk) <= risk_rank(*risk),
            Self::RiskAtOrAbove(risk) => risk_rank(request.risk) >= risk_rank(*risk),
            Self::All(matchers) => {
                !matchers.is_empty() && matchers.iter().all(|matcher| matcher.matches(request))
            }
            Self::AnyOf(matchers) => matchers.iter().any(|matcher| matcher.matches(request)),
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Self::Any => "any",
            Self::Workspace(_) => "workspace",
            Self::Actor(_) => "actor",
            Self::Object(_) => "object",
            Self::Capability(_) => "capability",
            Self::RiskAtOrBelow(_) => "risk-at-or-below",
            Self::RiskAtOrAbove(_) => "risk-at-or-above",
            Self::All(_) => "all",
            Self::AnyOf(_) => "any-of",
        }
    }
}

/// One step in a policy explanation trace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExplanationStep {
    /// Rule identifier, when the step came from a named rule.
    pub rule_id: Option<String>,
    /// Whether the step matched the request.
    pub matched: bool,
    /// Decision produced by this step, when it selected an outcome.
    pub decision: Option<DecisionKind>,
    /// Human-readable trace message.
    pub message: String,
}

/// Ordered explanation for a policy evaluation.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ExplanationTrace {
    /// Steps recorded while evaluating rules.
    pub steps: Vec<ExplanationStep>,
}

impl ExplanationTrace {
    /// Create an empty trace.
    pub fn new() -> Self {
        Self::default()
    }

    /// Append a step to the trace.
    pub fn push(&mut self, step: ExplanationStep) {
        self.steps.push(step);
    }
}

/// Full evaluation result including the decision and its trace.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEvaluation {
    /// Final decision.
    pub decision: Decision,
    /// Identifier for the matched rule, if a named rule selected the decision.
    pub matched_rule_id: Option<String>,
    /// Ordered explanation trace.
    pub trace: ExplanationTrace,
}

/// Named rule for rule-set evaluation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEvaluationRule {
    /// Stable rule identifier for audit and trace output.
    pub id: String,
    /// Matcher used to select this rule.
    pub matcher: PolicyMatcher,
    /// Effect applied when the matcher accepts the request.
    pub effect: RuleEffect,
    /// Human-readable reason attached to the final decision.
    pub reason: String,
}

impl PolicyEvaluationRule {
    /// Create a named rule.
    pub fn new(
        id: impl Into<String>,
        matcher: PolicyMatcher,
        effect: RuleEffect,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            matcher,
            effect,
            reason: reason.into(),
        }
    }
}

/// Ordered policy rule set with an explicit default effect.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRuleSet {
    /// Rules evaluated in order.
    pub rules: Vec<PolicyEvaluationRule>,
    /// Effect used when no rule matches.
    pub default_effect: RuleEffect,
    /// Reason used when no rule matches.
    pub default_reason: String,
}

impl PolicyRuleSet {
    /// Create a rule set with a default deny outcome.
    pub fn new(rules: Vec<PolicyEvaluationRule>) -> Self {
        Self {
            rules,
            default_effect: RuleEffect::Deny,
            default_reason: "no rule matched request".to_owned(),
        }
    }

    /// Set the default outcome used when no rule matches.
    pub fn with_default(mut self, effect: RuleEffect, reason: impl Into<String>) -> Self {
        self.default_effect = effect;
        self.default_reason = reason.into();
        self
    }

    /// Evaluate a request against rules in order.
    pub fn evaluate(&self, request: &PolicyRequest) -> PolicyEvaluation {
        let mut trace = ExplanationTrace::new();

        for rule in &self.rules {
            let matched = rule.matcher.matches(request);
            if matched {
                let decision_kind = rule.effect.decision_kind();
                trace.push(ExplanationStep {
                    rule_id: Some(rule.id.clone()),
                    matched: true,
                    decision: Some(decision_kind),
                    message: format!("rule matched {} matcher", rule.matcher.label()),
                });

                return PolicyEvaluation {
                    decision: rule.effect.into_decision(rule.reason.clone()),
                    matched_rule_id: Some(rule.id.clone()),
                    trace,
                };
            }

            trace.push(ExplanationStep {
                rule_id: Some(rule.id.clone()),
                matched: false,
                decision: None,
                message: format!("rule did not match {} matcher", rule.matcher.label()),
            });
        }

        let decision_kind = self.default_effect.decision_kind();
        trace.push(ExplanationStep {
            rule_id: None,
            matched: true,
            decision: Some(decision_kind),
            message: "default outcome selected".to_owned(),
        });

        PolicyEvaluation {
            decision: self
                .default_effect
                .into_decision(self.default_reason.clone()),
            matched_rule_id: None,
            trace,
        }
    }
}

/// Simple capability rule with an automatic approval ceiling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRule {
    /// Capability this rule applies to.
    pub capability: Capability,
    /// Highest risk level that can be allowed without approval.
    pub max_auto_approve_risk: RiskLevel,
}

impl PolicyRule {
    /// Evaluate a request against this rule.
    pub fn evaluate(&self, request: &PolicyRequest) -> Decision {
        self.evaluate_with_trace(request).decision
    }

    /// Evaluate a request and include explanation steps.
    pub fn evaluate_with_trace(&self, request: &PolicyRequest) -> PolicyEvaluation {
        let mut trace = ExplanationTrace::new();

        if request.capability != self.capability {
            let reason = "capability is outside this rule".to_owned();
            trace.push(ExplanationStep {
                rule_id: Some("capability-risk".to_owned()),
                matched: false,
                decision: Some(DecisionKind::Deny),
                message: reason.clone(),
            });
            return PolicyEvaluation {
                decision: Decision::Deny { reason },
                matched_rule_id: None,
                trace,
            };
        }

        trace.push(ExplanationStep {
            rule_id: Some("capability-risk".to_owned()),
            matched: true,
            decision: None,
            message: "capability matched rule".to_owned(),
        });

        if risk_rank(request.risk) <= risk_rank(self.max_auto_approve_risk) {
            let reason = "request is within configured risk limit".to_owned();
            trace.push(ExplanationStep {
                rule_id: Some("capability-risk".to_owned()),
                matched: true,
                decision: Some(DecisionKind::Allow),
                message: reason.clone(),
            });
            PolicyEvaluation {
                decision: Decision::Allow { reason },
                matched_rule_id: Some("capability-risk".to_owned()),
                trace,
            }
        } else {
            let reason = "request exceeds automatic approval limit".to_owned();
            trace.push(ExplanationStep {
                rule_id: Some("capability-risk".to_owned()),
                matched: true,
                decision: Some(DecisionKind::RequireApproval),
                message: reason.clone(),
            });
            PolicyEvaluation {
                decision: Decision::RequireApproval { reason },
                matched_rule_id: Some("capability-risk".to_owned()),
                trace,
            }
        }
    }
}

fn risk_rank(risk: RiskLevel) -> u8 {
    match risk {
        RiskLevel::Low => 1,
        RiskLevel::Medium => 2,
        RiskLevel::High => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(
        capability: Capability,
        risk: RiskLevel,
    ) -> Result<PolicyRequest, Box<dyn std::error::Error>> {
        Ok(PolicyRequest {
            workspace_id: WorkspaceId::parse("wsp_demo")?,
            actor_id: ActorId::parse("act_agent")?,
            object_id: None,
            capability,
            risk,
        })
    }

    #[test]
    fn allows_matching_low_risk_request() -> Result<(), Box<dyn std::error::Error>> {
        let rule = PolicyRule {
            capability: Capability::ReadObject,
            max_auto_approve_risk: RiskLevel::Low,
        };

        assert!(matches!(
            rule.evaluate(&request(Capability::ReadObject, RiskLevel::Low)?),
            Decision::Allow { .. }
        ));
        Ok(())
    }

    #[test]
    fn requires_approval_above_risk_limit() -> Result<(), Box<dyn std::error::Error>> {
        let rule = PolicyRule {
            capability: Capability::WriteObject,
            max_auto_approve_risk: RiskLevel::Medium,
        };

        assert!(matches!(
            rule.evaluate(&request(Capability::WriteObject, RiskLevel::High)?),
            Decision::RequireApproval { .. }
        ));
        Ok(())
    }
}
