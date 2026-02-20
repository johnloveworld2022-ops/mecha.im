---
name: coverage-gate
description: Enforce strict coverage gates and verify coverage summaries against thresholds.
---

# Coverage Gate

## Requirements

1. Run project test command.
2. Run project coverage command.
3. Verify coverage summary exists.
4. Enforce thresholds for:
   - lines
   - functions
   - branches
   - statements

Default threshold policy: `100` for all metrics.

## Failure handling

If coverage fails:
1. List exact metric deltas.
2. Identify uncovered branches/functions by file.
3. Add missing tests, then rerun full gate.
