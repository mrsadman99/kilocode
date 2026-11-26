/** @jsxImportSource solid-js */
/**
 * Stories for the Prompt Timeline panel (execution stages viewer).
 */

import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { createSignal, type ParentComponent } from "solid-js"
import { I18nProvider, pluralCategory, pluralKey } from "@kilocode/kilo-ui/context"
import type { UiI18nPluralKey } from "@kilocode/kilo-ui/context"
import { DialogProvider } from "@kilocode/kilo-ui/context/dialog"
import { VSCodeProvider } from "../context/vscode"
import { LanguageContext } from "../context/language"
import { dict as uiEn } from "@kilocode/kilo-ui/i18n/en"
import { dict as appEn } from "../i18n/en"
import { dict as kiloEn } from "@kilocode/kilo-i18n/en"
import { resolveTemplate } from "../context/language-utils"
import { TimelinePanel } from "../../prompt-timeline/TimelinePanel"
import { createTimeline } from "../../prompt-timeline/state"
import type { Run } from "../../../src/prompt-timeline/runs"
import "../../prompt-timeline/prompt-timeline.css"

const dict: Record<string, string> = { ...appEn, ...uiEn, ...kiloEn }
function t(key: string, params?: Record<string, string | number | boolean | undefined>) {
  return resolveTemplate(dict[key] ?? key, params)
}
const plural = (key: UiI18nPluralKey, count: number, params?: Record<string, string | number | boolean>) =>
  t(pluralKey(key, pluralCategory("en", count)), { ...params, count })
function noop() {}

const base = 1764000000000

const runs: Run[] = [
  {
    id: "u1",
    index: 1,
    text: "Refactor the authentication module to use the new token service",
    time: base,
    agent: "build",
    model: "anthropic/claude-sonnet-4",
    status: "completed",
    tools: 2,
    duration: 14200,
    tokens: { input: 8200, output: 1400 },
    cost: 0.0421,
    stages: [
      {
        id: "s1",
        kind: "reasoning",
        icon: "brain",
        title: "Reasoning",
        subtitle: "Let me inspect the current auth flow first.",
        status: "completed",
        detail: "Let me inspect the current auth flow first.\nI'll read the token service and the login handler.",
        duration: 2100,
      },
      {
        id: "s2",
        kind: "tool",
        icon: "glasses",
        title: "Read auth.ts",
        subtitle: "auth.ts",
        status: "completed",
        detail: "export async function login() {\n  // legacy token flow\n}",
        duration: 300,
      },
      {
        id: "s3",
        kind: "tool",
        icon: "code-lines",
        title: "Edit auth.ts",
        subtitle: "auth.ts",
        status: "completed",
        detail: "Applied 2 edits",
        duration: 450,
      },
      {
        id: "s4",
        kind: "step",
        icon: "layers",
        title: "anthropic/claude-sonnet-4",
        subtitle: "stop",
        status: "completed",
        duration: 9800,
        tokens: { input: 8200, output: 1400 },
        cost: 0.0421,
      },
      {
        id: "s5",
        kind: "response",
        icon: "bubble-5",
        title: "Response",
        subtitle: "Done — the login flow now uses the token service.",
        status: "completed",
        detail: "Done — the login flow now uses the token service.\nAll existing tests still pass.",
        duration: 1500,
      },
    ],
  },
  {
    id: "u2",
    index: 2,
    text: "Run the test suite and fix whatever breaks",
    time: base + 60000,
    agent: "build",
    model: "anthropic/claude-sonnet-4",
    status: "error",
    tools: 1,
    duration: 8300,
    tokens: { input: 5100, output: 600 },
    cost: 0.018,
    stages: [
      {
        id: "s6",
        kind: "tool",
        icon: "console",
        title: "bun test",
        subtitle: "Run the full unit suite",
        status: "error",
        detail: "2 failing tests:\n- auth.test.ts > refresh token\n- auth.test.ts > expired token",
        duration: 6100,
      },
      {
        id: "s7",
        kind: "response",
        icon: "bubble-5",
        title: "Response",
        subtitle: "Two tests fail around token refresh.",
        status: "completed",
        detail: "Two tests fail around token refresh. Investigating.",
        duration: 900,
      },
    ],
  },
  {
    id: "u3",
    index: 3,
    text: "Now fix the refresh token test",
    time: base + 120000,
    agent: "build",
    model: "anthropic/claude-sonnet-4",
    status: "running",
    tools: 1,
    tokens: { input: 2400, output: 120 },
    cost: 0.006,
    stages: [
      {
        id: "s8",
        kind: "tool",
        icon: "glasses",
        title: "Read auth.test.ts",
        subtitle: "auth.test.ts",
        status: "running",
      },
    ],
  },
]

const sessions = [
  { id: "s1", title: "Auth refactor" },
  { id: "s2", title: "Screenshot coverage" },
]

type State = ReturnType<typeof createTimeline>

function seed(state: State, selected?: string) {
  state.onMessage({ type: "promptTimeline.init", sessionID: "s1" })
  state.onMessage({ type: "promptTimeline.sessions", sessions })
  state.onMessage({ type: "promptTimeline.runs", sessionID: "s1", runs })
  if (selected) state.open(selected)
}

const Shell: ParentComponent<{ selected?: string; error?: string }> = (props) => {
  const state = createTimeline()
  seed(state, props.selected)
  if (props.error) state.onMessage({ type: "promptTimeline.error", sessionID: "s1", message: props.error })
  const [locale] = createSignal<"en">("en")
  return (
    <VSCodeProvider>
      <LanguageContext.Provider value={{ locale, setLocale: noop, userOverride: () => "", t }}>
        <I18nProvider value={{ locale: () => "en", t, plural }}>
          <DialogProvider>
            <div style={{ height: "720px", width: "100%" }}>
              <TimelinePanel state={state} />
            </div>
          </DialogProvider>
        </I18nProvider>
      </LanguageContext.Provider>
    </VSCodeProvider>
  )
}

const meta = {
  title: "PromptTimeline",
  component: TimelinePanel,
} satisfies Meta<typeof TimelinePanel>

export default meta
type Story = StoryObj<typeof meta>

export const PromptList: Story = {
  name: "Prompt list",
  render: () => <Shell />,
}

export const PromptDetail: Story = {
  name: "Prompt detail",
  render: () => <Shell selected="u1" />,
}

export const FailedPrompt: Story = {
  name: "Failed prompt",
  render: () => <Shell selected="u2" />,
}

export const LoadError: Story = {
  name: "Load error",
  render: () => <Shell error="Not connected — call connect() first" />,
}
