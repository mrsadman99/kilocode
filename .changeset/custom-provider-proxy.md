---
"kilo-code": minor
"@kilocode/cli": minor
---

Support routing provider requests through a proxy. Configure an HTTP, HTTPS, or SOCKS5 proxy (with optional username and password) for any provider: in the connect dialog when adding a built-in provider, via a Proxy action in the provider settings, or in the custom provider dialog. The proxy is applied as part of connecting, so requests to the provider — including model listing — are sent through it. For OpenAI, ChatGPT sign-in (OAuth), token refresh, and Codex requests also use the proxy. Leave the proxy field empty to connect directly.
