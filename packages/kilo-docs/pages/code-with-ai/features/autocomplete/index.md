---
title: "Autocomplete"
description: "AI-powered code autocompletion in Kilo Code"
---

# Autocomplete

Kilo Code's autocomplete feature provides intelligent code suggestions and completions while you're typing, helping you write code faster and more efficiently. It offers both automatic and manual triggering options.

## How Autocomplete Works

The extension uses **Fill-in-the-Middle (FIM)** completion. It sends the code before and after your cursor to the selected endpoint and inserts the generated middle. The endpoint can run on your machine or on a remote server.

By default, autocomplete uses **Codestral** (`mistralai/codestral-2508`) by Mistral AI, billed through your Kilo account. Local FIM models are also supported — see [Local models](#local-models).

## Triggering Options

### Auto-trigger

Autocomplete is **enabled by default** and automatically shows inline suggestions as you type. Suggestions appear as ghost text that you can accept with `Tab`.

### Trigger on keybinding (Cmd+L)

Press `Cmd+L` (Mac) or `Ctrl+L` (Windows/Linux) to manually request a completion at your cursor position.

{% callout type="note" %}
This keybinding requires `kilo-code.new.autocomplete.enableSmartInlineTaskKeybinding` to be enabled in VS Code settings. It is **disabled by default**.
{% /callout %}

## Provider and Model

By default, autocomplete requests go through the **Kilo Gateway** and use **Codestral** (`mistralai/codestral-2508`). This route uses Kilo credits unless you add a Mistral API key via BYOK. With BYOK, your Mistral plan and usage limits apply; autocomplete is not guaranteed to be free. See [Setting up Mistral for autocomplete](/docs/code-with-ai/features/autocomplete/mistral-setup).

### Local models

1. In **Settings → Models**, select **Custom** for autocomplete.
2. For [Ollama](https://ollama.com/), enter the model tag (for example, `qwen2.5-coder:7b`) and server URL (`http://127.0.0.1:11434`). Choose the raw prompt mode and the Ollama transport.
3. Leave the profile on **Auto** for a recognized checkpoint, or choose the profile matching your weights. An unrecognized server alias needs an explicit profile. Model size alone does not determine the profile.

### Custom endpoints

Choose the input your **server** accepts first, then the profile your **model** expects. These choices are independent of whether the server is local or hosted. A server advertising an OpenAI-compatible completions API does not necessarily implement the `suffix` field.

| Input | Where Kilo sends the request | Example |
|---|---|---|
| Native FIM | `{baseURL}/completions` with separate `prompt` and `suffix`; no client template | DeepSeek's beta API: base URL `https://api.deepseek.com/beta`, FIM-capable model ID from your account. For open-weight Codestral, use a compatible server that handles the tokenizer's FIM encoding. |
| Raw prompt | `{serverURL}/v1/completions` or Ollama `{serverURL}/api/generate` with one rendered `prompt` | A Mellum Base server needs a suffix-first profile. It is not interchangeable with the prefix-first StarCoder profile, even though both use the same marker strings. |
| Chat messages | `{baseURL}/chat/completions` with the rendered FIM content in a `user` message, plus a `system` message only if the profile specifies one | For Qwen3-Coder-Next on a compatible chat server, include the API prefix (e.g. `/v1`) in the base URL. The server applies the chat template, not Kilo. |

Use the model ID exposed by your server. For a private endpoint, enter its URL and optional API key; leaving the key empty sends no `Authorization` header. Set a proxy only if the endpoint needs one. Use HTTPS for remote endpoints that receive your key or source code.

Profiles preserve the cursor's whitespace and use the checkpoint's markers, order and stop sequences. For example, a hosted DeepSeek endpoint with native suffix support needs **no** DeepSeek marker profile; self-hosted DeepSeek-Coder Base with a raw completions API does. Choose the model's documented input mode, not just its family name.

## Status Bar

The extension displays an **autocomplete status indicator** in the VS Code status bar, including:

- Current autocomplete state (active/snoozed)
- Cumulative cost tracking for autocomplete requests

### Snooze / Unsnooze

You can temporarily disable autocomplete by clicking the status bar item to **snooze** it. Click again to **unsnooze** and re-enable suggestions.

## Copilot Conflict Detection

The extension automatically detects if **GitHub Copilot** inline suggestions are enabled and warns you about potential conflicts. Disable Copilot's inline completions for the best experience with Kilo Code autocomplete.

## Best Practices

1. **Use Manual Autocomplete for precision**: When you need suggestions at specific moments, use the keyboard shortcut rather than relying on auto-trigger
2. **Use chat for complex changes**: Chat is better suited for multi-file changes and substantial code modifications
3. **Steer autocomplete with comments**: Write a comment describing what you want before triggering autocomplete, or type a function signature — autocomplete will fill in the implementation

4. **Check the status bar tooltip**: Hover the status bar item to see autocomplete state and cost tracking

## Tips

{% callout type="tip" %}
**When to use chat vs autocomplete:** Use chat for multi-file changes, refactoring, or when you need to explain intent. Use autocomplete for quick, localized edits where the context is already clear from surrounding code.
{% /callout %}

{% callout type="tip" %}
**Treat suggestions as drafts:** Accept autocomplete suggestions quickly, then refine. It's often faster to fix a 90% correct suggestion than to craft the perfect prompt.
{% /callout %}

- Autocomplete works best with clear, well-structured code
- Comments above functions help autocomplete understand intent
- Variable and function names matter — descriptive names lead to better suggestions

## Related Features

- [Code Actions](/docs/code-with-ai/features/code-actions) - Context menu options for common coding tasks
