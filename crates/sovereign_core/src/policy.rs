use crate::ids::{ActorId, ObjectId, WorkspaceId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RiskLevel {
    Low,
    Medium,
    High,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Capability {
    ReadObject,
    WriteObject,
    ProposeAgentAction,
    ManagePlugin,
    SyncBundle,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRequest {
    pub workspace_id: WorkspaceId,
    pub actor_id: ActorId,
    pub object_id: Option<ObjectId>,
    pub capability: Capability,
    pub risk: RiskLevel,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Decision {
    Allow { reason: String },
    RequireApproval { reason: String },
    Deny { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyRule {
    pub capability: Capability,
    pub max_auto_approve_risk: RiskLevel,
}

impl PolicyRule {
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

    fn request(capability: Capability, risk: RiskLevel) -> PolicyRequest {
        PolicyRequest {
            workspace_id: WorkspaceId::parse("wsp_demo").unwrap(),
            actor_id: ActorId::parse("act_agent").unwrap(),
            object_id: None,
            capability,
            risk,
        }
    }

    #[test]
    fn allows_matching_low_risk_request() {
        let rule = PolicyRule {
            capability: Capability::ReadObject,
            max_auto_approve_risk: RiskLevel::Low,
        };

        assert!(matches!(
            rule.evaluate(&request(Capability::ReadObject, RiskLevel::Low)),
            Decision::Allow { .. }
        ));
    }

    #[test]
    fn requires_approval_above_risk_limit() {
        let rule = PolicyRule {
            capability: Capability::WriteObject,
            max_auto_approve_risk: RiskLevel::Medium,
        };

        assert!(matches!(
            rule.evaluate(&request(Capability::WriteObject, RiskLevel::High)),
            Decision::RequireApproval { .. }
        ));
    }
}

