---
"@kilocode/cli": patch
---

When a model answers a structured-output request with plain text instead of calling the StructuredOutput tool, retry with an explicit reminder (honoring the format's retryCount) instead of failing the request immediately.