//! Workspace manifest primitives and validation.

use core::fmt;

use crate::policy::{Capability, RiskLevel};

/// Current workspace manifest schema version.
pub const WORKSPACE_MANIFEST_VERSION: u32 = 1;

/// Maximum accepted human-readable summary length.
pub const MAX_DEFAULT_POLICY_SUMMARY_LEN: usize = 512;

/// Maximum accepted capability description length.
pub const MAX_CAPABILITY_DESCRIPTION_LEN: usize = 256;

/// Workspace manifest advertised by the core runtime.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorkspaceManifest {
    /// Manifest schema version.
    pub version: u32,
    /// Capabilities supported by this workspace.
    pub capabilities: Vec<ManifestCapability>,
    /// Default policy behavior exposed as compact summary data.
    pub default_policy_summary: DefaultPolicySummary,
}

impl WorkspaceManifest {
    /// Create a manifest value without validating it.
    pub fn new(
        version: u32,
        capabilities: Vec<ManifestCapability>,
        default_policy_summary: DefaultPolicySummary,
    ) -> Self {
        Self {
            version,
            capabilities,
            default_policy_summary,
        }
    }

    /// Return the built-in workspace manifest for the current crate.
    pub fn local_default() -> Self {
        let capabilities = vec![
            ManifestCapability::new(Capability::ReadObject, "read workspace objects"),
            ManifestCapability::new(Capability::WriteObject, "change workspace objects"),
            ManifestCapability::new(
                Capability::ProposeAgentAction,
                "prepare action proposals for review",
            ),
            ManifestCapability::new(Capability::ManagePlugin, "manage installed plugin records"),
            ManifestCapability::new(Capability::SyncBundle, "exchange encrypted sync bundles"),
        ];

        let default_policy_summary = DefaultPolicySummary::new(
            "Low-risk requests can run automatically; medium and high-risk requests require approval.",
            vec![
                DefaultCapabilityPolicy::new(Capability::ReadObject, RiskLevel::Low),
                DefaultCapabilityPolicy::new(Capability::WriteObject, RiskLevel::Low),
                DefaultCapabilityPolicy::new(Capability::ProposeAgentAction, RiskLevel::Low),
                DefaultCapabilityPolicy::new(Capability::ManagePlugin, RiskLevel::Low),
                DefaultCapabilityPolicy::new(Capability::SyncBundle, RiskLevel::Low),
            ],
        );

        Self::new(
            WORKSPACE_MANIFEST_VERSION,
            capabilities,
            default_policy_summary,
        )
    }

    /// Validate version, capability declarations, and default policy coverage.
    pub fn validate(&self) -> Result<(), WorkspaceManifestError> {
        if self.version != WORKSPACE_MANIFEST_VERSION {
            return Err(WorkspaceManifestError::UnsupportedVersion {
                supported: WORKSPACE_MANIFEST_VERSION,
                actual: self.version,
            });
        }

        if self.capabilities.is_empty() {
            return Err(WorkspaceManifestError::NoCapabilities);
        }

        for capability in &self.capabilities {
            capability.validate()?;
        }

        if let Some(capability) = duplicate_manifest_capability(&self.capabilities) {
            return Err(WorkspaceManifestError::DuplicateCapability { capability });
        }

        self.default_policy_summary.validate_for(&self.capabilities)
    }
}

/// Capability declaration carried by a workspace manifest.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManifestCapability {
    /// Supported capability.
    pub capability: Capability,
    /// Short description suitable for display in capability pickers.
    pub description: String,
}

impl ManifestCapability {
    /// Create a capability declaration.
    pub fn new(capability: Capability, description: impl Into<String>) -> Self {
        Self {
            capability,
            description: description.into(),
        }
    }

    fn validate(&self) -> Result<(), WorkspaceManifestError> {
        if self.description.trim().is_empty() {
            return Err(WorkspaceManifestError::EmptyCapabilityDescription {
                capability: self.capability,
            });
        }

        if self.description.len() > MAX_CAPABILITY_DESCRIPTION_LEN {
            return Err(WorkspaceManifestError::CapabilityDescriptionTooLong {
                capability: self.capability,
                max: MAX_CAPABILITY_DESCRIPTION_LEN,
                actual: self.description.len(),
            });
        }

        Ok(())
    }
}

/// Default policy behavior for manifest consumers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefaultPolicySummary {
    /// Human-readable summary of default behavior.
    pub summary: String,
    /// Per-capability automatic approval limits.
    pub rules: Vec<DefaultCapabilityPolicy>,
}

impl DefaultPolicySummary {
    /// Create a default policy summary.
    pub fn new(summary: impl Into<String>, rules: Vec<DefaultCapabilityPolicy>) -> Self {
        Self {
            summary: summary.into(),
            rules,
        }
    }

    /// Return the rule for a capability when one is present.
    pub fn rule_for(&self, capability: &Capability) -> Option<&DefaultCapabilityPolicy> {
        self.rules
            .iter()
            .find(|rule| &rule.capability == capability)
    }

    fn validate_for(
        &self,
        capabilities: &[ManifestCapability],
    ) -> Result<(), WorkspaceManifestError> {
        if self.summary.trim().is_empty() {
            return Err(WorkspaceManifestError::EmptyDefaultPolicySummary);
        }

        if self.summary.len() > MAX_DEFAULT_POLICY_SUMMARY_LEN {
            return Err(WorkspaceManifestError::DefaultPolicySummaryTooLong {
                max: MAX_DEFAULT_POLICY_SUMMARY_LEN,
                actual: self.summary.len(),
            });
        }

        if self.rules.is_empty() {
            return Err(WorkspaceManifestError::NoDefaultPolicyRules);
        }

        if let Some(capability) = duplicate_default_policy_capability(&self.rules) {
            return Err(WorkspaceManifestError::DuplicateDefaultPolicyRule { capability });
        }

        for capability in capabilities {
            if self.rule_for(&capability.capability).is_none() {
                return Err(WorkspaceManifestError::MissingDefaultPolicyRule {
                    capability: capability.capability,
                });
            }
        }

        for rule in &self.rules {
            if !has_manifest_capability(capabilities, &rule.capability) {
                return Err(WorkspaceManifestError::UnknownDefaultPolicyRule {
                    capability: rule.capability,
                });
            }
        }

        Ok(())
    }
}

/// Automatic approval ceiling for a manifest capability.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DefaultCapabilityPolicy {
    /// Capability covered by this summary rule.
    pub capability: Capability,
    /// Highest risk level allowed without explicit approval.
    pub max_auto_approve_risk: RiskLevel,
}

impl DefaultCapabilityPolicy {
    /// Create a default policy summary rule.
    pub fn new(capability: Capability, max_auto_approve_risk: RiskLevel) -> Self {
        Self {
            capability,
            max_auto_approve_risk,
        }
    }
}

/// Manifest validation failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkspaceManifestError {
    /// The manifest version is not supported by this crate.
    UnsupportedVersion {
        /// Supported manifest version.
        supported: u32,
        /// Version found in the manifest.
        actual: u32,
    },
    /// No capabilities were declared.
    NoCapabilities,
    /// A capability was declared more than once.
    DuplicateCapability {
        /// Duplicate capability.
        capability: Capability,
    },
    /// A capability description was empty.
    EmptyCapabilityDescription {
        /// Capability with the empty description.
        capability: Capability,
    },
    /// A capability description exceeded the accepted length.
    CapabilityDescriptionTooLong {
        /// Capability with the long description.
        capability: Capability,
        /// Maximum accepted length.
        max: usize,
        /// Actual length.
        actual: usize,
    },
    /// The default policy summary was empty.
    EmptyDefaultPolicySummary,
    /// The default policy summary exceeded the accepted length.
    DefaultPolicySummaryTooLong {
        /// Maximum accepted length.
        max: usize,
        /// Actual length.
        actual: usize,
    },
    /// No default policy rules were declared.
    NoDefaultPolicyRules,
    /// A default policy rule was declared more than once.
    DuplicateDefaultPolicyRule {
        /// Duplicate capability rule.
        capability: Capability,
    },
    /// A manifest capability had no default policy rule.
    MissingDefaultPolicyRule {
        /// Capability missing default policy coverage.
        capability: Capability,
    },
    /// A default policy rule referenced an undeclared capability.
    UnknownDefaultPolicyRule {
        /// Capability without a manifest declaration.
        capability: Capability,
    },
}

impl fmt::Display for WorkspaceManifestError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::UnsupportedVersion { supported, actual } => {
                write!(
                    f,
                    "workspace manifest version {actual} is not supported; expected {supported}"
                )
            }
            Self::NoCapabilities => write!(f, "workspace manifest must declare capabilities"),
            Self::DuplicateCapability { capability } => {
                write!(
                    f,
                    "workspace manifest declares {capability:?} more than once"
                )
            }
            Self::EmptyCapabilityDescription { capability } => {
                write!(
                    f,
                    "workspace manifest capability {capability:?} needs a description"
                )
            }
            Self::CapabilityDescriptionTooLong {
                capability,
                max,
                actual,
            } => {
                write!(
                    f,
                    "workspace manifest capability {capability:?} description has {actual} characters; max is {max}"
                )
            }
            Self::EmptyDefaultPolicySummary => {
                write!(
                    f,
                    "workspace manifest default policy summary must not be empty"
                )
            }
            Self::DefaultPolicySummaryTooLong { max, actual } => {
                write!(
                    f,
                    "workspace manifest default policy summary has {actual} characters; max is {max}"
                )
            }
            Self::NoDefaultPolicyRules => {
                write!(f, "workspace manifest must declare default policy rules")
            }
            Self::DuplicateDefaultPolicyRule { capability } => {
                write!(
                    f,
                    "workspace manifest default policy has more than one rule for {capability:?}"
                )
            }
            Self::MissingDefaultPolicyRule { capability } => {
                write!(
                    f,
                    "workspace manifest default policy is missing a rule for {capability:?}"
                )
            }
            Self::UnknownDefaultPolicyRule { capability } => {
                write!(
                    f,
                    "workspace manifest default policy references undeclared capability {capability:?}"
                )
            }
        }
    }
}

impl std::error::Error for WorkspaceManifestError {}

fn duplicate_manifest_capability(capabilities: &[ManifestCapability]) -> Option<Capability> {
    for (index, capability) in capabilities.iter().enumerate() {
        if capabilities
            .iter()
            .skip(index + 1)
            .any(|other| other.capability == capability.capability)
        {
            return Some(capability.capability);
        }
    }
    None
}

fn duplicate_default_policy_capability(rules: &[DefaultCapabilityPolicy]) -> Option<Capability> {
    for (index, rule) in rules.iter().enumerate() {
        if rules
            .iter()
            .skip(index + 1)
            .any(|other| other.capability == rule.capability)
        {
            return Some(rule.capability);
        }
    }
    None
}

fn has_manifest_capability(capabilities: &[ManifestCapability], capability: &Capability) -> bool {
    capabilities
        .iter()
        .any(|declared| &declared.capability == capability)
}
