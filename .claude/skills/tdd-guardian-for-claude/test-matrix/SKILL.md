---
name: test-matrix
description: Build a comprehensive test matrix for changed behavior (happy path, boundaries, guards, failures, state transitions).
---

# Test Matrix

For each changed unit/function, provide this matrix before coding tests:

1. Success path: expected output and side effects.
2. Boundary values: min, max, empty, zero, one, large input.
3. Guard clauses: invalid type/shape/range; missing required values.
4. Failure paths: downstream failure, timeout, retries exhausted.
5. State transitions: create/update/delete/retry/idempotency.
6. Determinism: stable behavior across repeated runs.

Output format:

```markdown
## Test Matrix: <unit>
- Case ID:
- Category: success|boundary|guard|failure|state
- Input:
- Expected:
- Notes:
```
