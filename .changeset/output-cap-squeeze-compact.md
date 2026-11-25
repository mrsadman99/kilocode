---
"@kilocode/cli": patch
---

When a conversation nearly fills a model's context window, trigger automatic compaction right away instead of sending a request that is guaranteed to overflow. This avoids a wasted provider round-trip before the conversation is compacted.