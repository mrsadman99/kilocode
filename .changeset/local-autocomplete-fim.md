---
"kilo-code": minor
"@kilocode/cli": minor
---

Support local models for autocomplete. Choose "Local (Ollama)" as the autocomplete provider and run FIM-trained models such as Qwen2.5-Coder, StarCoder2, or CodeLlama on Ollama, llama.cpp, or LM Studio. Configure the model name, server URL, FIM template, and API endpoint in Settings → Models; no Kilo credits or API keys are used for local completions.

Autocomplete no longer silently falls back to Kilo Gateway when an unsupported provider or model is configured: it stays within the chosen provider or pauses and asks you to pick a supported one, so your code is never sent to an unintended service. Switching the autocomplete model or local settings now clears stale suggestions and error backoff, ignore rules (.kilocodeignore/.gitignore) apply immediately and per workspace folder (including cancelling requests already queued), manual completions are discarded if you keep typing while the model generates, and local model/endpoint errors (404, Ollama error records) are reported instead of producing empty suggestions. Use the Reload command to retry after installing a local model.
