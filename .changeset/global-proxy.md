---
"kilo-code": minor
"@kilocode/cli": minor
---

Add a global outbound proxy so all Kilo network requests route through one proxy. Configure it in Settings → Experimental with address, username, and password fields (HTTP, HTTPS, SOCKS4, or SOCKS5; for example `socks5://127.0.0.1:1080`), or via the `kilo-code.new.proxy` VS Code setting, or the top-level `proxy` key in `kilo.json` for the CLI/TUI. LLM chat, the marketplace catalog, the models list, remote MCP servers, and telemetry all use it. Child processes Kilo launches (MCP servers started with npx/uvx/docker, shell commands, plugin installs) inherit it too, taking precedence over VS Code's wide `http.proxy`. Leave the address empty to connect directly. A provider's own `options.proxy` still takes precedence, and localhost traffic is never proxied. SOCKS proxies are honored by socks-aware child tools such as curl, uv, and python; Node-based children have limited SOCKS support.
