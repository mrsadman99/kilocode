---
"@kilocode/cli": patch
---

Fix CLI version checks and npm/yarn/pnpm/bun upgrades in projects with a custom npm registry: fall back to the public registry when the configured one cannot serve @kilocode/cli, run global upgrades outside the project directory, and retry a failed upgrade against the public registry.