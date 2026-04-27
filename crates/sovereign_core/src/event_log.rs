use core::fmt;
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};

use crate::ids::{ActorId, ObjectId, WorkspaceId};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EventEnvelope {
    pub workspace_id: WorkspaceId,
    pub sequence: u64,
    pub actor_id: ActorId,
    pub object_id: ObjectId,
    pub operation: String,
    pub payload_digest: String,
    pub previous_digest: Option<String>,
}

impl EventEnvelope {
    pub fn digest(&self) -> String {
        let mut hasher = DefaultHasher::new();
        self.workspace_id.hash(&mut hasher);
        self.sequence.hash(&mut hasher);
        self.actor_id.hash(&mut hasher);
        self.object_id.hash(&mut hasher);
        self.operation.hash(&mut hasher);
        self.payload_digest.hash(&mut hasher);
        self.previous_digest.hash(&mut hasher);
        format!("{:016x}", hasher.finish())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EventLogError {
    SequenceGap { expected: u64, actual: u64 },
    BrokenChain { expected: String, actual: Option<String> },
}

impl fmt::Display for EventLogError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::SequenceGap { expected, actual } => {
                write!(f, "event sequence gap: expected {expected}, got {actual}")
            }
            Self::BrokenChain { expected, actual } => {
                write!(f, "event chain mismatch: expected previous digest {expected}, got {actual:?}")
            }
        }
    }
}

impl std::error::Error for EventLogError {}

#[derive(Debug, Default, Clone)]
pub struct EventLog {
    events: Vec<EventEnvelope>,
}

impl EventLog {
    pub fn new() -> Self {
        Self { events: Vec::new() }
    }

    pub fn append(&mut self, event: EventEnvelope) -> Result<(), EventLogError> {
        let expected_sequence = self.events.len() as u64 + 1;
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
                    expected: expected_digest,
                    actual: event.previous_digest,
                });
            }
        } else if event.previous_digest.is_some() {
            return Err(EventLogError::BrokenChain {
                expected: String::new(),
                actual: event.previous_digest,
            });
        }

        self.events.push(event);
        Ok(())
    }

    pub fn len(&self) -> usize {
        self.events.len()
    }

    pub fn is_empty(&self) -> bool {
        self.events.is_empty()
    }

    pub fn last_digest(&self) -> Option<String> {
        self.events.last().map(EventEnvelope::digest)
    }

    pub fn events(&self) -> &[EventEnvelope] {
        &self.events
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(sequence: u64, previous_digest: Option<String>) -> EventEnvelope {
        EventEnvelope {
            workspace_id: WorkspaceId::parse("wsp_demo").unwrap(),
            sequence,
            actor_id: ActorId::parse("act_alice").unwrap(),
            object_id: ObjectId::parse("obj_task-1").unwrap(),
            operation: "task.updated".to_owned(),
            payload_digest: "payload-a".to_owned(),
            previous_digest,
        }
    }

    #[test]
    fn appends_in_sequence() {
        let mut log = EventLog::new();
        log.append(event(1, None)).unwrap();
        let previous = log.last_digest();
        log.append(event(2, previous)).unwrap();
        assert_eq!(log.len(), 2);
    }

    #[test]
    fn rejects_sequence_gap() {
        let mut log = EventLog::new();
        let err = log.append(event(2, None)).unwrap_err();
        assert_eq!(err, EventLogError::SequenceGap { expected: 1, actual: 2 });
    }
}

