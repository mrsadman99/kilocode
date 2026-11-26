import { Component, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { pluralCategory } from "@kilocode/kilo-ui/context"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { Select } from "@kilocode/kilo-ui/select"
import { Spinner } from "@kilocode/kilo-ui/spinner"
import { useVSCode } from "../src/context/vscode"
import { useLanguage } from "../src/context/language"
import { localeToBcp47 } from "../src/context/language-utils"
import type { Run, Stage, StageStatus } from "../../src/prompt-timeline/runs"
import type { createTimeline } from "./state"

function duration(ms: number | undefined): string | undefined {
  if (ms == null) return undefined
  if (ms < 1000) return `${ms}ms`
  const sec = ms / 1000
  if (sec < 60) return `${sec.toFixed(1)}s`
  return `${Math.floor(sec / 60)}m ${Math.round(sec % 60)}s`
}

function count(n: number): string {
  if (n < 1000) return String(n)
  return `${(n / 1000).toFixed(1)}k`
}

function cost(value: number): string | undefined {
  if (!value) return undefined
  return `$${value.toFixed(value < 0.01 ? 4 : 2)}`
}

const StatusMark: Component<{ status: StageStatus; label: string }> = (props) => (
  <span data-slot="pt-status" data-status={props.status} title={props.label}>
    <Show when={props.status === "completed"}>
      <Icon name="check" size="small" />
    </Show>
    <Show when={props.status === "error"}>
      <Icon name="close" size="small" />
    </Show>
  </span>
)

const StageRow: Component<{
  stage: Stage
  open: boolean
  onToggle: () => void
  label: (status: StageStatus) => string
  details: string
}> = (props) => (
  <li data-slot="pt-stage" data-status={props.stage.status} data-kind={props.stage.kind}>
    <span data-slot="pt-stage-node">
      <Icon name={props.stage.icon} size="small" />
    </span>
    <div data-slot="pt-stage-body">
      <div data-slot="pt-stage-head">
        <span data-slot="pt-stage-title">{props.stage.title}</span>
        <Show when={props.stage.subtitle}>
          <span data-slot="pt-stage-subtitle">{props.stage.subtitle}</span>
        </Show>
        <span data-slot="pt-stage-meta">
          <Show when={duration(props.stage.duration)}>{(ms) => <span data-slot="pt-stage-duration">{ms()}</span>}</Show>
          <Show when={props.stage.tokens}>
            {(tk) => <span data-slot="pt-stage-tokens">{count(tk().input + tk().output)} tok</span>}
          </Show>
          <StatusMark status={props.stage.status} label={props.label(props.stage.status)} />
        </span>
      </div>
      <Show when={props.stage.detail}>
        <button type="button" data-slot="pt-stage-toggle" aria-expanded={props.open} onClick={props.onToggle}>
          <Icon name={props.open ? "chevron-down" : "chevron-right"} size="small" />
          {props.details}
        </button>
        <Show when={props.open}>
          <pre data-slot="pt-stage-detail">{props.stage.detail}</pre>
        </Show>
      </Show>
    </div>
  </li>
)

export const TimelinePanel: Component<{ state: ReturnType<typeof createTimeline> }> = (props) => {
  const vscode = useVSCode()
  const language = useLanguage()
  const state = props.state
  const [open, setOpen] = createStore<Record<string, boolean>>({})

  const t = (key: string) => language.t(key)
  const plural = (key: string, n: number) => t(`${key}.${pluralCategory(localeToBcp47(language.locale()), n)}`)
  const statusLabel = (status: StageStatus) => t(`promptTimeline.status.${status}`)

  const stageTitle = (stage: Stage) => {
    if (stage.kind === "reasoning") return t("promptTimeline.reasoning")
    if (stage.kind === "response") return t("promptTimeline.response")
    if (stage.kind === "compaction") return t("promptTimeline.compaction")
    return stage.title
  }

  const runMeta = (run: Run) =>
    [
      `${run.stages.length} ${plural("promptTimeline.stages", run.stages.length)}`,
      `${run.tools} ${plural("promptTimeline.tools", run.tools)}`,
      duration(run.duration),
      cost(run.cost),
    ]
      .filter(Boolean)
      .join(" · ")

  const select = (id: string | undefined) => {
    if (!id) return
    state.switchSession(id)
    vscode.postMessage({ type: "promptTimeline.selectSession", sessionID: id })
  }

  return (
    <div data-component="prompt-timeline">
      <div data-slot="pt-toolbar">
        <Show when={state.run()}>
          <Tooltip value={t("promptTimeline.back")} placement="bottom">
            <IconButton
              icon="arrow-left"
              size="small"
              variant="ghost"
              onClick={state.back}
              aria-label={t("promptTimeline.back")}
            />
          </Tooltip>
        </Show>
        <Select
          options={state.sessions()}
          current={state.sessions().find((item) => item.id === state.current())}
          value={(item) => item.id}
          label={(item) => item.title || t("promptTimeline.untitled")}
          onSelect={(item) => select(item?.id)}
          variant="secondary"
          size="small"
        />
        <div data-slot="pt-toolbar-spacer" />
        <Show when={state.run()}>
          <span data-slot="pt-counter">
            {state.position() + 1} / {state.runs().length}
          </span>
          <Tooltip value={t("promptTimeline.prev")} placement="bottom">
            <IconButton
              icon="chevron-left"
              size="small"
              variant="ghost"
              disabled={state.position() <= 0}
              onClick={() => state.step(-1)}
              aria-label={t("promptTimeline.prev")}
            />
          </Tooltip>
          <Tooltip value={t("promptTimeline.next")} placement="bottom">
            <IconButton
              icon="chevron-right"
              size="small"
              variant="ghost"
              disabled={state.position() >= state.runs().length - 1}
              onClick={() => state.step(1)}
              aria-label={t("promptTimeline.next")}
            />
          </Tooltip>
        </Show>
        <Tooltip value={t("promptTimeline.refresh")} placement="bottom">
          <IconButton
            icon="reset"
            size="small"
            variant="ghost"
            onClick={() => vscode.postMessage({ type: "promptTimeline.refresh" })}
            aria-label={t("promptTimeline.refresh")}
          />
        </Tooltip>
      </div>
      <div data-slot="pt-body" class="kilo-scrollbar">
        <Show when={state.loading() && state.runs().length === 0}>
          <div data-slot="pt-center">
            <Spinner />
          </div>
        </Show>
        <Show when={state.error()}>
          {(message) => (
            <div data-slot="pt-center">
              <div data-slot="pt-error">
                <Icon name="warning" size="small" />
                <span>
                  {t("promptTimeline.failedLoad")}: {message()}
                </span>
              </div>
            </div>
          )}
        </Show>
        <Show when={!state.loading() && !state.error() && state.runs().length === 0}>
          <div data-slot="pt-center">
            <span data-slot="pt-empty">{t("promptTimeline.empty")}</span>
          </div>
        </Show>
        <Show when={state.runs().length > 0}>
          <Show
            when={state.run()}
            fallback={
              <div data-slot="pt-list">
                <div data-slot="pt-list-title">
                  {t("promptTimeline.prompts")} ({state.runs().length})
                </div>
                <For each={state.runs()}>
                  {(run) => (
                    <button
                      type="button"
                      data-slot="pt-run"
                      data-status={run.status}
                      onClick={() => state.open(run.id)}
                    >
                      <span data-slot="pt-run-index">{run.index}</span>
                      <span data-slot="pt-run-body">
                        <span data-slot="pt-run-text">{run.text || t("promptTimeline.untitled")}</span>
                        <span data-slot="pt-run-meta">{runMeta(run)}</span>
                      </span>
                      <StatusMark status={run.status} label={statusLabel(run.status)} />
                    </button>
                  )}
                </For>
              </div>
            }
          >
            {(run) => (
              <div data-slot="pt-detail">
                <div data-slot="pt-prompt">
                  <div data-slot="pt-prompt-head">
                    <span data-slot="pt-run-index">{run().index}</span>
                    <span data-slot="pt-prompt-meta">
                      {[run().agent, run().model, new Date(run().time).toLocaleString(language.locale())]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span data-slot="pt-prompt-status" data-status={run().status}>
                      {statusLabel(run().status)}
                    </span>
                  </div>
                  <div data-slot="pt-prompt-text">{run().text || t("promptTimeline.untitled")}</div>
                  <div data-slot="pt-run-meta">{runMeta(run())}</div>
                </div>
                <ol data-slot="pt-timeline">
                  <For each={run().stages}>
                    {(stage) => (
                      <StageRow
                        stage={{ ...stage, title: stageTitle(stage) }}
                        open={!!open[stage.id]}
                        onToggle={() => setOpen(stage.id, !open[stage.id])}
                        label={statusLabel}
                        details={t("promptTimeline.details")}
                      />
                    )}
                  </For>
                </ol>
              </div>
            )}
          </Show>
        </Show>
      </div>
    </div>
  )
}
