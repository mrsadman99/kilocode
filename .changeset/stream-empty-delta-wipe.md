---
"kilo-code": patch
---

Stop streamed chat text from being erased when a model sends an empty text delta. Empty deltas are now dropped before they can replace the accumulated response with a blank fragment.