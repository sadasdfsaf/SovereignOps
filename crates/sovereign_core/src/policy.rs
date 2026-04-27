//! Policy request and decision primitives for agent-facing operations.

use crate::ids::{ActorId, ObjectId, WorkspaceId};

/// Coarse risk level assigned to a requested operation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RiskLevel {
    /// Read-only or easily reversible action.
    Low,
    /// Action with durable local effects or broader data visibility.
    Medium,
    /// Action that requires explicit human review before execution.
    High,
}

/// Capability requested by an actor or plugin.
#[derive(Debug, Clone, PartialEq, Eq)]
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

/// Policy engine outcome.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    /// The request may execute immediately.
    Allow { reason: String },
    /// The request must be previewed and approved before execution.
    RequireApproval { reason: String },
    /// The request must not execute.
    Deny { reason: String },
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
        if request.capability != self.capability {
            return Decision::Deny {
                reason: "capability is outside this rule".to_owned(),
            };
        }

        if risk_rank(&request.risk) <= risk_rank(&self.max_auto_approve_risk) {
            Decision::Allow {
                reason: "request is within configured risk limit".to_owned(),
            }
        } else {
            Decision::RequireApproval {
                reason: "request exceeds automatic approval limit".to_owned(),
            }
        }
    }
}

fn risk_rank(risk: &RiskLevel) -> u8 {
    match risk {
        RiskLevel::Low => 1,
        RiskLevel::Medium => 2,
        RiskLevel::High => 3,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn request(capability: Capability, risk: RiskLevel) -> Result<PolicyRequest, Box<dyn std::error::Error>> {
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
