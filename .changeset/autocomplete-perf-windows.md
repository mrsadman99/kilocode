---
"kilo-code": patch
---

Reduce autocomplete CPU and memory usage: track recent edits and cursor moves with bounded range reads instead of whole-file reads, pause that tracking while autocomplete is turned off, reuse token counts and file contents between suggestions, and keep only a bounded context window per cached suggestion.