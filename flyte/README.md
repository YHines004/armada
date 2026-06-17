# Flyte Discovery Doc

## a) Integration Shape

The `create/get/delete` lifecycle maps onto Armada as follows:

- `create → SubmitJobs`, returns `job_id + job_set_id` stored in `ResourceMeta`
- `get` → `GetJobSetEvents`, drains events since last cursor, translates terminal event types to Flyte phases
- `delete` → `CancelJobs`, uses stored `job_id`

The `ArmadaJobMeta` dataclass carries all identifiers needed across calls:

```python
python@dataclass
class ArmadaJobMeta(ResourceMeta):
    job_id: str           # Armada's internal job ID (returned by SubmitJobs)
    job_set_id: str       # Armada JobSet scope for GetJobSetEvents
    queue: str
    external_job_uri: str = ""  # optional: Armada externalJobUri annotation value
    last_message_id: str = ""   # event stream cursor
```

Log retrieval follows Flyte's native model — the connector surfaces log handles/URLs via `TaskLog` metadata on task/node execution records; clients fetch logs directly from the backing log system. Stream-through-orchestrator is a fallback only.

```shell
Resource / execution metadata
  → task/node execution
  → TaskLog[]
      → URI(s) to external log provider
```

## b) The Workarounds Wave 1 will carry

The top three workarounds the connector carries in Wave 1, analogous to the Airflow operator's polling loop, retry wrappers, and two-call describe:

1. Cursor-based event draining as a substitute for stateless job poll

    - Analogous to Airflow's polling loop. Because Armada has no `GetJobStatus(job_id)` single-call endpoint, `get` must call `GetJobSetEvents`, advance the `last_message_id` cursor stored in `ArmadaJobMeta`, drain all events since the last checkpoint, and manually translate terminal event types into Flyte phases. This is stateful bookkeeping the connector owns entirely.

2. Hand-rolled Armada Cause → Flyte failure classification table

    - Analogous to Airflow's retry wrappers. Flyte's retry model is retryability-first (`USER/SYSTEM`, `RECOVERABLE/NON_RECOVERABLE`) and has no native cause-enum ingestion. The connector must own and maintain the full translation table with no upstream help:

    | Flyte Classification            | Retry?                | failure_category           | failure_subcategory.       |
    |---------------------------------|-----------------------|----------------------------|----------------------------|
    | SYSTEM, RECOVERABLE             | Yes, if policy allows | infrastructure or resource | oom                        |
    | SYSTEM or USER, NON_RECOVERABLE | Usually no            | system or policy           | deadline_exceeded          |
    | SYSTEM, RECOVERABLE             | Yes.                  | infrastructure             | preempted                  |
    | USER, NON_RECOVERABLE           | No                    | user or platform           | rejected/admission_rejected|

3. Silent carry of `external_job_uri` and `job_set_id` through ResourceMeta

    - Analogous to Airflow's two-call describe. Flyte has no knowledge of either Armada concept. The connector must submit via `SubmitJobs`, capture both identifiers in `ArmadaJobMeta`, and ferry them manually across every subsequent `get` and `delete` call — effectively reimplementing the two-artifact lookup pattern Airflow operators do with a describe call.
    - Additional Wave 1 burdens derived from Q3: there is no user-visible `poll_interval` knob on `AsyncConnector.get`. Polling cadence is entirely driven by the FlytePropeller reconciler resync and `TaskRefreshIndicator` signals, so the connector cannot tune its own polling aggressiveness or signal urgency on fast transitions like `Preempted`.

## c) The prioritized list of which Phase 1 to 5 upstream API improvements would simplify the connector the most

1. Stateless `GetJobStatus(job_id)` poll endpoint - eliminates the entire cursor/event-drain loop and `last_message_id` field from `ResourceMeta`; the single biggest complexity reduction available
2. Native Cause -> Flyte phase hint on terminal events - would eliminate the hand-rolled failure classification table in the connector currently owns and maintains
3. `TaskRefreshIndicator` /poll-hint signal from connector back to Propeller would let the connector signal urgency (e.g. on `Preempted`) rather than waiting for the next reconciler resync
4. First-class `externalJobUri` on status/event responses removes need to carry and pass it manually through `ResourceMeta`
5. Structured `TaskLog` emission from Armada events - would let the connector surface log URIs natively rather than constructing them from templates or annotations as a fallback path
