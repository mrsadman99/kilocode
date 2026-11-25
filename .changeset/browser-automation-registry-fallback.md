---
"kilo-code": patch
---

Fix Browser Automation failing to connect in projects with a custom npm registry: when the Playwright MCP launch fails, retry it against the public npm registry instead of blocking prompts.