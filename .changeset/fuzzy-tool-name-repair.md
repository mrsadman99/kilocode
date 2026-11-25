---
"@kilocode/cli": patch
---

Recover from near-miss tool names the model sometimes emits (like "raed" instead of "read" or "ReadFile" instead of "read_file") by mapping them to the intended tool when the match is unambiguous, instead of failing the call and wasting a turn.