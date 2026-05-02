//! Append-only event log primitives and deterministic event serialization.

use core::fmt;

use crate::ids::{ActorId, ObjectId, WorkspaceId};

/// An event envelope with ordering and hash-chain metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventEnvelope {
    /// Workspace receiving the event.
    pub workspace_id: WorkspaceId,
    /// One-based sequence number within the local workspace chain.
    pub sequence: u64,
    /// Actor that requested or performed the change.
    pub actor_id: ActorId,
    /// Object affected by the operation.
    pub object_id: ObjectId,
    /// Domain operation name, for example `task.updated`.
    pub operation: String,
    /// Digest of the canonical payload held outside the envelope.
    pub payload_digest: String,
    /// Digest of the previous event envelope in this chain.
    pub previous_digest: Option<String>,
}

impl EventEnvelope {
    /// Serialize the envelope using stable field ordering and length-prefixed values.
    pub fn canonical_string(&self) -> String {
        let mut output = String::new();
        push_field(&mut output, "actor_id", self.actor_id.as_str());
        push_field(&mut output, "object_id", self.object_id.as_str());
        push_field(&mut output, "operation", &self.operation);
        push_field(&mut output, "payload_digest", &self.payload_digest);
        push_field(
            &mut output,
            "previous_digest",
            self.previous_digest.as_deref().unwrap_or(""),
        );
        push_field(&mut output, "sequence", &self.sequence.to_string());
        push_field(&mut output, "workspace_id", self.workspace_id.as_str());
        output
    }

    /// Return canonical bytes for hashing, signing, or fixture comparison.
    pub fn canonical_bytes(&self) -> Vec<u8> {
        self.canonical_string().into_bytes()
    }

    /// Return a stable non-cryptographic digest for local chain checks.
    ///
    /// Cryptographic signing and content digests should be provided by the crypto module once the
    /// key-management layer lands. This digest only protects deterministic in-memory ordering.
    pub fn digest(&self) -> String {
        stable_digest(&self.canonical_bytes())
    }
}

/// Append validation failures.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventLogError {
    /// The appended event did not use the next expected sequence number.
    SequenceGap {
        /// Required next sequence.
        expected: u64,
        /// Provided sequence.
        actual: u64,
    },
    /// The appended event did not point at the current chain tip.
    BrokenChain {
        /// Required previous digest.
        expected: Option<String>,
        /// Provided previous digest.
        actual: Option<String>,
    },
    /// The event operation was empty.
    EmptyOperation,
    /// The event payload digest was empty.
    EmptyPayloadDigest,
    /// The log is too large to derive the next sequence number safely.
    SequenceOverflow,
}

impl fmt::Display for EventLogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SequenceGap { expected, actual } => {
                write!(f, "event sequence gap: expected {expected}, got {actual}")
            }
            Self::BrokenChain { expected, actual } => {
                write!(
                    f,
                    "event chain mismatch: expected previous digest {expected:?}, got {actual:?}"
                )
            }
            Self::EmptyOperation => write!(f, "event operation must not be empty"),
            Self::EmptyPayloadDigest => write!(f, "event payload digest must not be empty"),
            Self::SequenceOverflow => write!(f, "event sequence exceeded u64 range"),
        }
    }
}

impl std::error::Error for EventLogError {}

/// In-memory append-only event log with sequence and hash-chain validation.
#[derive(Debug, Default, Clone)]
pub struct EventLog {
    events: Vec<EventEnvelope>,
}

impl EventLog {
    /// Create an empty event log.
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    /// Append an event if it is the next valid item in the chain.
    pub fn append(&mut self, event: EventEnvelope) -> Result<(), EventLogError> {
        if event.operation.trim().is_empty() {
            return Err(EventLogError::EmptyOperation);
        }
        if event.payload_digest.trim().is_empty() {
            return Err(EventLogError::EmptyPayloadDigest);
        }

        let expected_sequence = next_sequence_for_len(self.events.len())?;
        if event.sequence != expected_sequence {
            return Err(EventLogError::SequenceGap {
                expected: expected_sequence,
                actual: event.sequence,
            });
        }

        if let Some(previous) = self.events.last() {
            let expected_digest = previous.digest();
            if event.previous_digest.as_deref() != Some(expected_digest.as_str()) {
                return Err(EventLogError::BrokenChain {
                    expected: Some(expected_digest),
                    actual: event.previous_digest,
                });
            }
        } else if event.previous_digest.is_some() {
            return Err(EventLogError::BrokenChain {
                expected: None,
                actual: event.previous_digest,
            });
        }

        self.events.push(event);
        Ok(())
    }

    /// Return the number of events currently held.
    pub fn len(&self) -> usize {
        self.events.len()
    }

    /// Return true when no events are stored.
    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    /// Return the digest of the current chain tip.
    pub fn last_digest(&self) -> Option<String> {
        self.events.last().map(EventEnvelope::digest)
    }

    /// Borrow the stored events in append order.
    pub fn events(&self) -> &[EventEnvelope] {
        &self.events
    }
}

fn next_sequence_for_len(len: usize) -> Result<u64, EventLogError> {
    u64::try_from(len)
        .ok()
        .and_then(|value| value.checked_add(1))
        .ok_or(EventLogError::SequenceOverflow)
}

fn push_field(output: &mut String, name: &str, value: &str) {
    output.push_str(name);
    output.push('=');
    output.push_str(&value.len().to_string());
    output.push(':');
    output.push_str(value);
    output.push('\n');
}

fn stable_digest(bytes: &[u8]) -> String {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in bytes {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("so1-{hash:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(
        sequence: u64,
        previous_digest: Option<String>,
    ) -> Result<EventEnvelope, Box<dyn std::error::Error>> {
        Ok(EventEnvelope {
            workspace_id: WorkspaceId::parse("wsp_demo")?,
            sequence,
            actor_id: ActorId::parse("act_alice")?,
            object_id: ObjectId::parse("obj_task-1")?,
            operation: "task.updated".to_owned(),
            payload_digest: "payload-a".to_owned(),
            previous_digest,
        })
    }

    #[test]
    fn appends_in_sequence() -> Result<(), Box<dyn std::error::Error>> {
        let mut log = EventLog::new();
        log.append(event(1, None)?)?;
        let previous = log.last_digest();
        log.append(event(2, previous)?)?;
        assert_eq!(log.len(), 2);
        Ok(())
    }

    #[test]
    fn rejects_sequence_gap() -> Result<(), Box<dyn std::error::Error>> {
        let mut log = EventLog::new();
        let result = log.append(event(2, None)?);
        assert!(matches!(
            result,
            Err(EventLogError::SequenceGap {
                expected: 1,
                actual: 2
            })
        ));
        Ok(())
    }

    #[cfg(target_pointer_width = "64")]
    #[test]
    fn rejects_sequence_counter_overflow() {
        assert_eq!(
            next_sequence_for_len(usize::MAX),
            Err(EventLogError::SequenceOverflow)
        );
    }

    #[test]
    fn canonical_string_uses_stable_field_order() -> Result<(), Box<dyn std::error::Error>> {
        let canonical = event(1, None)?.canonical_string();
        let names: Vec<&str> = canonical
            .lines()
            .filter_map(|line| line.split_once('=').map(|pair| pair.0))
            .collect();
        assert_eq!(
            names,
            vec![
                "actor_id",
                "object_id",
                "operation",
                "payload_digest",
                "previous_digest",
                "sequence",
                "workspace_id"
            ]
        );
        Ok(())
    }
}
