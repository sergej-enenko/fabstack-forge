---
name: forge-inspect
description: Ad-hoc analysis of user-provided logs
---

# /forge-inspect

Analyze user-provided logs without affecting state or creating side effects.

## Flow
1. Ask: input source — clipboard, file path, stdin paste, or extract from chat context
2. Read and parse the input as log events
3. Run classifier + investigator (no budget cap in inspect mode)
4. Present findings in chat: classifications, root causes, proposed fixes
5. Offer optional actions (each requires explicit confirmation):
   - Create draft PR for a proposed fix
   - Open GitHub Issue
   - Add finding to state.json for scheduled tracking
6. Execute confirmed actions only
