use sovereign_core::{
    DefaultCapabilityPolicy, DefaultPolicySummary, ManifestCapability, WorkspaceManifest,
    WorkspaceManifestError, Capability, RiskLevel, WORKSPACE_MANIFEST_VERSION,
};

fn one_capability_manifest(
    capability: Capability,
    max_auto_approve_risk: RiskLevel,
) -> WorkspaceManifest {
    WorkspaceManifest::new(
        WORKSPACE_MANIFEST_VERSION,
        vec![ManifestCapability::new(
            capability,
            "read workspace data",
        )],
        DefaultPolicySummary::new(
            "Read-only requests can run automatically.",
            vec![DefaultCapabilityPolicy::new(
                capability,
                max_auto_approve_risk,
            )],
        ),
    )
}

#[test]
fn local_default_manifest_is_valid() -> Result<(), WorkspaceManifestError> {
    let manifest = WorkspaceManifest::local_default();

    manifest.validate()?;

    assert_eq!(manifest.version, WORKSPACE_MANIFEST_VERSION);
    assert_eq!(manifest.capabilities.len(), 5);
    assert_eq!(
        manifest
            .default_policy_summary
            .rule_for(&Capability::ReadObject)
            .map(|rule| &rule.max_auto_approve_risk),
        Some(&RiskLevel::Low)
    );
    Ok(())
}

#[test]
fn validation_rejects_unsupported_version() {
    let default_manifest = WorkspaceManifest::local_default();
    let manifest = WorkspaceManifest::new(
        WORKSPACE_MANIFEST_VERSION + 1,
        default_manifest.capabilities,
        default_manifest.default_policy_summary,
    );

    assert!(matches!(
        manifest.validate(),
        Err(WorkspaceManifestError::UnsupportedVersion {
            supported: WORKSPACE_MANIFEST_VERSION,
            actual
        }) if actual == WORKSPACE_MANIFEST_VERSION + 1
    ));
}

#[test]
fn validation_rejects_duplicate_capabilities() {
    let manifest = WorkspaceManifest::new(
        WORKSPACE_MANIFEST_VERSION,
        vec![
            ManifestCapability::new(Capability::ReadObject, "read workspace data"),
            ManifestCapability::new(Capability::ReadObject, "read workspace data again"),
        ],
        DefaultPolicySummary::new(
            "Read-only requests can run automatically.",
            vec![DefaultCapabilityPolicy::new(
                Capability::ReadObject,
                RiskLevel::Low,
            )],
        ),
    );

    assert!(matches!(
        manifest.validate(),
        Err(WorkspaceManifestError::DuplicateCapability {
            capability: Capability::ReadObject
        })
    ));
}

#[test]
fn validation_rejects_missing_default_policy_rule() {
    let manifest = WorkspaceManifest::new(
        WORKSPACE_MANIFEST_VERSION,
        vec![
            ManifestCapability::new(Capability::ReadObject, "read workspace data"),
            ManifestCapability::new(Capability::WriteObject, "change workspace data"),
        ],
        DefaultPolicySummary::new(
            "Read-only requests can run automatically.",
            vec![DefaultCapabilityPolicy::new(
                Capability::ReadObject,
                RiskLevel::Low,
            )],
        ),
    );

    assert!(matches!(
        manifest.validate(),
        Err(WorkspaceManifestError::MissingDefaultPolicyRule {
            capability: Capability::WriteObject
        })
    ));
}

#[test]
fn validation_rejects_unknown_default_policy_rule() {
    let manifest = WorkspaceManifest::new(
        WORKSPACE_MANIFEST_VERSION,
        vec![ManifestCapability::new(
            Capability::ReadObject,
            "read workspace data",
        )],
        DefaultPolicySummary::new(
            "Read-only requests can run automatically.",
            vec![
                DefaultCapabilityPolicy::new(Capability::ReadObject, RiskLevel::Low),
                DefaultCapabilityPolicy::new(Capability::WriteObject, RiskLevel::Medium),
            ],
        ),
    );

    assert!(matches!(
        manifest.validate(),
        Err(WorkspaceManifestError::UnknownDefaultPolicyRule {
            capability: Capability::WriteObject
        })
    ));
}

#[test]
fn validation_rejects_empty_summary_and_description() {
    let empty_description = one_capability_manifest(Capability::ReadObject, RiskLevel::Low);
    let mut empty_description = WorkspaceManifest::new(
        empty_description.version,
        vec![ManifestCapability::new(Capability::ReadObject, " ")],
        empty_description.default_policy_summary,
    );

    assert!(matches!(
        empty_description.validate(),
        Err(WorkspaceManifestError::EmptyCapabilityDescription {
            capability: Capability::ReadObject
        })
    ));

    empty_description.capabilities = vec![ManifestCapability::new(
        Capability::ReadObject,
        "read workspace data",
    )];
    empty_description.default_policy_summary.summary = " ".to_owned();

    assert!(matches!(
        empty_description.validate(),
        Err(WorkspaceManifestError::EmptyDefaultPolicySummary)
    ));
}
