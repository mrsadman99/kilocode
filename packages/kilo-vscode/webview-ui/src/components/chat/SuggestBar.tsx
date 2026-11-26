import { Button } from "@kilocode/kilo-ui/button"
import { Icon } from "@kilocode/kilo-ui/icon"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import type { Component } from "solid-js"
import { createMemo, createSignal, For, Show } from "solid-js"
import { useLanguage } from "../../context/language"
import { useProvider } from "../../context/provider"
import { useSession } from "../../context/session"
import type { ModelSelection, SuggestionRequest } from "../../types/messages"
import { ModelSelectorBase } from "../shared/ModelSelector"

export const SuggestBar: Component<{ request: SuggestionRequest }> = (props) => {
  const session = useSession()
  const language = useLanguage()
  const provider = useProvider()

  const error = () => session.suggestionErrors().has(props.request.id)
  const responding = () => session.respondingSuggestions().has(props.request.id)

  const isReview = createMemo(() => props.request.actions.some((action) => action.prompt.startsWith("/review")))

  // Per-banner pick; falls back to the remembered review model, then the session model.
  const [pick, setPick] = createSignal<ModelSelection | null>(null)
  const remembered = createMemo(() => {
    const model = session.reviewModel()
    if (!model) return null
    return provider.findModel(model) ? model : null
  })
  const value = createMemo<ModelSelection | null>(
    () => pick() ?? remembered() ?? session.selected(props.request.sessionID),
  )

  const accept = (index: number) => {
    if (responding()) return
    session.acceptSuggestion(props.request.id, index, isReview() ? value() : undefined)
  }

  const dismiss = () => {
    if (responding()) return
    session.dismissSuggestion(props.request.id)
  }

  return (
    <div data-component="suggest-bar">
      <div data-slot="suggest-bar-copy">
        <span data-slot="suggest-bar-icon">
          <Icon name="brain" size="small" />
        </span>
        <span data-slot="suggest-bar-text" dir="auto">
          {props.request.text}
        </span>
      </div>
      <Show when={error()}>
        <div data-slot="suggest-bar-error">
          <Icon name="close" size="small" />
          <span>Failed — try again</span>
        </div>
      </Show>
      <div data-slot="suggest-bar-actions">
        <Show when={isReview()}>
          <span data-slot="suggest-bar-model">
            <ModelSelectorBase
              value={value()}
              onSelect={(providerID, modelID) => setPick({ providerID, modelID })}
              collapsed
              favorites={false}
              size="small"
              placement="top-end"
              label={language.t("review.model.label")}
            />
          </span>
        </Show>
        <For each={props.request.actions}>
          {(action, index) => (
            <Button
              variant={index() === 0 ? "secondary" : "ghost"}
              size="small"
              disabled={responding()}
              onClick={() => accept(index())}
            >
              {action.label}
            </Button>
          )}
        </For>
        <IconButton
          icon="close"
          variant="ghost"
          size="small"
          disabled={responding()}
          label={language.t("common.dismiss")}
          onClick={dismiss}
        />
      </div>
    </div>
  )
}
