---
name: policy-core
description: Global TDD governance policy. Use for any implementation, testing, or review task to enforce plan-first, scope control, and strict quality gates.
---

# Policy Core

## Required behavior

1. Plan-first: map all work to explicit work items and acceptance criteria before edits.
2. Scope lock: implement only requested scope; document extras as deferred notes.
3. Small batches: complete one work item at a time with immediate verification.
4. Regression safety: every bug fix includes a failing reproducer test before the fix.
5. Findings-first review: report defects and risks before summary.

## Test quality requirements

1. Add tests for success, boundaries, invalid input, guard clauses, and error paths.
2. Include state-transition/idempotency tests when behavior is stateful.
3. Include timeout/retry/concurrency tests when logic is async or distributed.
4. Avoid assertion-free tests and snapshot-only logic verification.

## Completion gates

1. Test command must pass.
2. Coverage command must pass.
3. Coverage totals must satisfy thresholds for lines/functions/branches/statements.
4. Mutation gate must pass when enabled.
5. High-severity findings must be resolved or explicitly waived with rationale.
