//! Integration coverage for local sync conflict classification.

use sovereign_core::{
    classify_conflict, ClockOrdering, ConflictKind, SyncChange, SyncChangeKind, VectorClock,
    VectorClockError,
};

fn clock_for(replica_id: &str) -> Result<VectorClock, VectorClockError> {
    let mut clock = VectorClock::new();
    clock.increment(replica_id)?;
    Ok(clock)
}

fn change(
    kind: SyncChangeKind,
    replica_id: &str,
    schema_version: u32,
) -> Result<SyncChange, VectorClockError> {
    Ok(SyncChange {
        object_id: "obj_plan-1".to_owned(),
        schema_version,
        clock: clock_for(replica_id)?,
        kind,
    })
}

#[test]
fn classifies_concurrent_edit_conflict() -> Result<(), VectorClockError> {
    let local = change(SyncChangeKind::Update, "dev_a", 1)?;
    let remote = change(SyncChangeKind::Update, "dev_b", 1)?;

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::ConcurrentEdit);
    assert_eq!(classification.ordering, ClockOrdering::Concurrent);
    Ok(())
}

#[test]
fn classifies_delete_update_conflict() -> Result<(), VectorClockError> {
    let local = change(SyncChangeKind::Delete, "dev_a", 1)?;
    let remote = change(SyncChangeKind::Update, "dev_b", 1)?;

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::DeleteUpdate);
    assert_eq!(classification.ordering, ClockOrdering::Concurrent);
    Ok(())
}

#[test]
fn treats_concurrent_double_delete_as_no_conflict() -> Result<(), VectorClockError> {
    let local = change(SyncChangeKind::Delete, "dev_a", 1)?;
    let remote = change(SyncChangeKind::Delete, "dev_b", 1)?;

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::NoConflict);
    assert_eq!(classification.ordering, ClockOrdering::Concurrent);
    Ok(())
}

#[test]
fn classifies_permission_change_conflict() -> Result<(), VectorClockError> {
    let local = change(SyncChangeKind::PermissionChange, "dev_a", 1)?;
    let remote = change(SyncChangeKind::Update, "dev_b", 1)?;

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::PermissionChange);
    assert_eq!(classification.ordering, ClockOrdering::Concurrent);
    Ok(())
}

#[test]
fn classifies_schema_mismatch_before_content_conflict() -> Result<(), VectorClockError> {
    let local = change(SyncChangeKind::Update, "dev_a", 1)?;
    let remote = change(SyncChangeKind::Update, "dev_b", 2)?;

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::SchemaMismatch);
    assert_eq!(classification.ordering, ClockOrdering::Concurrent);
    Ok(())
}

#[test]
fn does_not_conflict_when_change_is_causally_ordered() -> Result<(), VectorClockError> {
    let mut local_clock = VectorClock::new();
    local_clock.increment("dev_a")?;

    let mut remote_clock = local_clock.clone();
    remote_clock.increment("dev_b")?;

    let local = SyncChange {
        object_id: "obj_plan-1".to_owned(),
        schema_version: 1,
        clock: local_clock,
        kind: SyncChangeKind::Update,
    };
    let remote = SyncChange {
        object_id: "obj_plan-1".to_owned(),
        schema_version: 1,
        clock: remote_clock,
        kind: SyncChangeKind::Update,
    };

    let classification = classify_conflict(&local, &remote);

    assert_eq!(classification.kind, ConflictKind::NoConflict);
    assert_eq!(classification.ordering, ClockOrdering::Before);
    Ok(())
}
