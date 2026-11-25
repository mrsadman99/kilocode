---
"@kilocode/cli": patch
---

Retry provider requests based on the HTTP status code instead of scanning error text for numbers, so messages that merely mention a number (like "read 500 lines") no longer trigger pointless retries. Rate-limit (429) and overloaded (529) responses now retry reliably.