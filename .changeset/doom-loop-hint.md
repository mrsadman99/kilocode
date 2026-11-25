---
"@kilocode/cli": patch
---

When the agent gets stuck repeating the same tool call with identical arguments, give the model a one-shot nudge to change its approach on the next step, in addition to asking for confirmation, so it can break out of the loop on its own.