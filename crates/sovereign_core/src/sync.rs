//! Sync ordering and conflict-classification primitives.

use core::fmt;
use std::collections::BTreeMap;

/// Errors returned while mutating or building a vector clock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum VectorClockError {
    /// Replica identifiers must include at least one non-whitespace character.
    EmptyReplicaId,
    /// The local counter for a replica has reached the largest supported value.
    CounterOverflow {
        /// Replica whose counter could not be incremented.
        replica_id: String,
    },
}

impl fmt::Display for VectorClockError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyReplicaId => write!(f, "replica identifier must not be empty"),
            Self::CounterOverflow { replica_id } => {
                write!(f, "vector clock counter overflow for replica {replica_id}")
            }
        }
    }
}

impl std::error::Error for VectorClockError {}

/// Partial ordering between two vector clocks.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ClockOrdering {
    /// Both clocks contain the same counter values.
    Equal,
    /// This clock causally precedes the compared clock.
    Before,
    /// This clock causally follows the compared clock.
    After,
    /// Neither clock causally contains the other.
    Concurrent,
}

/// Compact vector clock keyed by stable replica identifiers.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct VectorClock {
    counters: BTreeMap<String, u64>,
}

impl VectorClock {
    /// Create an empty clock.
    pub fn new() -> Self {
        Self {
            counters: BTreeMap::new(),
        }
    }

    /// Build a clock from counters, keeping the highest counter for duplicate replicas.
    pub fn from_counters<I, K>(counters: I) -> Result<Self, VectorClockError>
    where
        I: IntoIterator<Item = (K, u64)>,
        K: Into<String>,
    {
        let mut clock = Self::new();
        for (replica_id, counter) in counters {
            let replica_id = replica_id.into();
            validate_replica_id(&replica_id)?;
            if counter == 0 {
                continue;
            }

            let current = clock.counters.entry(replica_id).or_insert(0);
            if *current < counter {
                *current = counter;
            }
        }
        Ok(clock)
    }

    /// Increment the counter for one replica and return the new value.
    pub fn increment(&mut self, replica_id: &str) -> Result<u64, VectorClockError> {
        validate_replica_id(replica_id)?;

        let current = self.counters.get(replica_id).copied().unwrap_or(0);
        let next = current
            .checked_add(1)
            .ok_or_else(|| VectorClockError::CounterOverflow {
                replica_id: replica_id.to_owned(),
            })?;
        self.counters.insert(replica_id.to_owned(), next);
        Ok(next)
    }

    /// Merge another clock into this clock by taking per-replica maximum counters.
    pub fn merge(&mut self, other: &Self) {
        for (replica_id, counter) in &other.counters {
            let current = self.counters.entry(replica_id.clone()).or_insert(0);
            if *current < *counter {
                *current = *counter;
            }
        }
    }

    /// Return a merged copy of this clock and another clock.
    pub fn merged(&self, other: &Self) -> Self {
        let mut merged = self.clone();
        merged.merge(other);
        merged
    }

    /// Compare this clock with another clock using vector-clock partial ordering.
    pub fn compare(&self, other: &Self) -> ClockOrdering {
        let mut has_lower_counter = false;
        let mut has_higher_counter = false;

        for (replica_id, local_counter) in &self.counters {
            let remote_counter = other.counters.get(replica_id).copied().unwrap_or(0);
            if *local_counter < remote_counter {
                has_lower_counter = true;
            } else if *local_counter > remote_counter {
                has_higher_counter = true;
            }
        }

        for (replica_id, remote_counter) in &other.counters {
            if self.counters.contains_key(replica_id) {
                continue;
            }
            if *remote_counter > 0 {
                has_lower_counter = true;
            }
        }

        match (has_lower_counter, has_higher_counter) {
            (false, false) => ClockOrdering::Equal,
            (true, false) => ClockOrdering::Before,
            (false, true) => ClockOrdering::After,
            (true, true) => ClockOrdering::Concurrent,
        }
    }

    /// Return a replica counter, treating missing replicas as zero.
    pub fn get(&self, replica_id: &str) -> u64 {
        self.counters.get(replica_id).copied().unwrap_or(0)
    }

    /// Return true when no positive counters are stored.
    pub fn is_empty(&self) -> bool {
        self.counters.is_empty()
    }

    /// Return the number of replicas with positive counters.
    pub fn len(&self) -> usize {
        self.counters.len()
    }

    /// Iterate counters in deterministic replica-id order.
    pub fn counters(&self) -> impl Iterator<Item = (&str, u64)> {
        self.counters
            .iter()
            .map(|(replica_id, counter)| (replica_id.as_str(), *counter))
    }
}

/// Object change operation used by sync conflict classification.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SyncChangeKind {
    /// A new object version was created.
    Create,
    /// Object content or metadata was updated.
    Update,
    /// The object was deleted.
    Delete,
    /// Access-control metadata changed.
    PermissionChange,
    /// The object schema was changed.
    SchemaChange,
}

impl SyncChangeKind {
    fn is_delete(&self) -> bool {
        matches!(self, Self::Delete)
    }

    fn is_permission_change(&self) -> bool {
        matches!(self, Self::PermissionChange)
    }

    fn is_edit_like(&self) -> bool {
        matches!(self, Self::Create | Self::Update | Self::SchemaChange)
    }
}

/// Sync-visible object change metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SyncChange {
    /// Stable object identifier.
    pub object_id: String,
    /// Schema version used to interpret the object payload.
    pub schema_version: u32,
    /// Vector clock attached to the object change.
    pub clock: VectorClock,
    /// Kind of object change.
    pub kind: SyncChangeKind,
}

/// Stable conflict categories returned by the classifier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictKind {
    /// The two changes can be ordered or affect different objects.
    NoConflict,
    /// Two edit-like changes were made concurrently.
    ConcurrentEdit,
    /// A deletion raced with an update-like change.
    DeleteUpdate,
    /// A permission change raced with another change to the same object.
    PermissionChange,
    /// The same object was changed under incompatible schema versions.
    SchemaMismatch,
}

/// Result of comparing and classifying two sync changes.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ConflictClassification {
    /// Conflict category.
    pub kind: ConflictKind,
    /// Causal ordering between the two vector clocks.
    pub ordering: ClockOrdering,
}

/// Classify whether two sync changes require explicit conflict handling.
///
/// Classification is intentionally conservative. Changes to different objects are not conflicts.
/// For the same object, schema mismatches take precedence because payloads may not be safely
/// compared. Ordered or identical clocks are not classified as conflicts. Concurrent permission
/// changes take precedence over content-level conflicts, followed by delete-update and edit-edit
/// conflicts.
pub fn classify_conflict(local: &SyncChange, remote: &SyncChange) -> ConflictClassification {
    let ordering = local.clock.compare(&remote.clock);

    if local.object_id != remote.object_id {
        return ConflictClassification {
            kind: ConflictKind::NoConflict,
            ordering,
        };
    }

    if local.schema_version != remote.schema_version {
        return ConflictClassification {
            kind: ConflictKind::SchemaMismatch,
            ordering,
        };
    }

    if ordering != ClockOrdering::Concurrent {
        return ConflictClassification {
            kind: ConflictKind::NoConflict,
            ordering,
        };
    }

    if local.kind.is_permission_change() || remote.kind.is_permission_change() {
        return ConflictClassification {
            kind: ConflictKind::PermissionChange,
            ordering,
        };
    }

    if local.kind.is_delete() != remote.kind.is_delete() {
        return ConflictClassification {
            kind: ConflictKind::DeleteUpdate,
            ordering,
        };
    }

    if local.kind.is_edit_like() && remote.kind.is_edit_like() {
        return ConflictClassification {
            kind: ConflictKind::ConcurrentEdit,
            ordering,
        };
    }

    ConflictClassification {
        kind: ConflictKind::NoConflict,
        ordering,
    }
}

fn validate_replica_id(replica_id: &str) -> Result<(), VectorClockError> {
    if replica_id.trim().is_empty() {
        return Err(VectorClockError::EmptyReplicaId);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vector_clock_orders_and_merges_counters() -> Result<(), VectorClockError> {
        let mut first = VectorClock::new();
        first.increment("dev_a")?;
        first.increment("dev_a")?;

        let mut second = first.clone();
        assert_eq!(first.compare(&second), ClockOrdering::Equal);

        second.increment("dev_b")?;
        assert_eq!(first.compare(&second), ClockOrdering::Before);

        first.increment("dev_c")?;
        assert_eq!(first.compare(&second), ClockOrdering::Concurrent);

        first.merge(&second);
        assert_eq!(first.get("dev_a"), 2);
        assert_eq!(first.get("dev_b"), 1);
        assert_eq!(first.get("dev_c"), 1);
        assert_eq!(first.compare(&second), ClockOrdering::After);
        Ok(())
    }

    #[test]
    fn vector_clock_rejects_empty_replica_id() {
        let mut clock = VectorClock::new();
        let result = clock.increment(" ");
        assert!(matches!(result, Err(VectorClockError::EmptyReplicaId)));
    }

    #[test]
    fn from_counters_keeps_highest_duplicate_counter() -> Result<(), VectorClockError> {
        let clock = VectorClock::from_counters([
            ("dev_a".to_owned(), 1),
            ("dev_b".to_owned(), 0),
            ("dev_a".to_owned(), 3),
        ])?;

        assert_eq!(clock.len(), 1);
        assert_eq!(clock.get("dev_a"), 3);
        assert_eq!(clock.get("dev_b"), 0);
        Ok(())
    }
}
