---
"kilo-code": minor
"@kilocode/cli": minor
---

Override the global proxy per MCP server, or bypass it entirely. Set `proxy` to a proxy URL (http, https, socks4/5) or `no_proxy: true` for a direct connection, in the MCP server config or the new Proxy section of the MCP edit screen. Remote servers use the override for HTTP/SSE and OAuth requests; local servers receive matching proxy environment variables.