---
"kilo-code": minor
"@kilocode/cli": minor
---

Add a "kilo API" output channel that logs LLM and autocomplete API requests. Entries are tagged [LLM] or [AUTOCOMPLETE] and show the model, thinking mode, HTTP status, request path, duration, and proxy route (per-provider or environment proxy). Failed requests include the error message returned by the provider API.
