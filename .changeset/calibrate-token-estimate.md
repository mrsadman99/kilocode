---
"@kilocode/cli": patch
---

Improve context-window accounting by learning a per-model token estimate from the provider's reported usage, so automatic compaction and output limits trigger more accurately for models whose tokenizer differs from the generic estimate. Media-heavy and outlier samples are ignored to keep the estimate stable.