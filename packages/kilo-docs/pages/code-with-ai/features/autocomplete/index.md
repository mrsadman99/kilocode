---
title: "Autocomplete"
description: "AI-powered code autocompletion in Kilo Code"
---

# Autocomplete

Kilo Code's autocomplete feature provides intelligent code suggestions and completions while you're typing, helping you write code faster and more efficiently. It offers both automatic and manual triggering options.

## How Autocomplete Works

The extension uses **Fill-in-the-Middle (FIM)** completion routed through the **Kilo Gateway** or a local model server. It analyzes the code before and after your cursor to generate contextually accurate inline suggestions.

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

Autocomplete requests are routed through the **Kilo Gateway** and use **Codestral** (`mistralai/codestral-2508`). It uses Kilo credits unless you add a Mistral API key via BYOK. With BYOK, your Mistral plan and usage limits apply; autocomplete is not guaranteed to be free. See [Setting up Mistral for autocomplete](/docs/code-with-ai/features/autocomplete/mistral-setup).

### Local models

You can also run autocomplete fully locally with a FIM-trained code model served by [Ollama](https://ollama.com/), llama.cpp, or LM Studio. In **Settings → Models**, pick **Local (Ollama)** as the autocomplete model, then configure:

- **Local model** — the model name as served by your server, e.g. `qwen2.5-coder:7b`, `starcoder2:7b`, or `codellama:7b`.
- **Local server URL** — defaults to `http://127.0.0.1:11434` (Ollama).
- **FIM template** — the fill-in-the-middle prompt format: StarCoder, Qwen, or CodeLlama. **Auto** infers it from the model name.
- **API endpoint** — Ollama-native `/api/generate` (raw prompts) or OpenAI-compatible `/v1/completions`. **Auto** uses the template default.

Local completions run on your machine and do not use Kilo credits or provider API keys. Use a small FIM-trained model (1.5B–7B) for responsive suggestions; general chat models without FIM training produce poor completions.

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
