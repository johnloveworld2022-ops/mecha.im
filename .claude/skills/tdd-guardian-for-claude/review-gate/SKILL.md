---
name: review-gate
description: Produce findings-first code review output with severity ordering and explicit test-gap findings.
---

# Review Gate

Output order:

1. Findings first, sorted by severity.
2. For each finding include:
   - severity
   - file and line
   - risk/impact
   - concrete fix
3. Include missing-test findings explicitly.
4. Only then provide short summary and residual risks.
