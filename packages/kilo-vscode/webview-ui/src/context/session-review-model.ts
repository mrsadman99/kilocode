import { createSignal, onCleanup, type Accessor } from "solid-js"
import type { ExtensionMessage, ModelSelection } from "../types/messages"

interface Options {
  post: (message: { type: "requestReviewModel" }) => void
  listen: (handler: (message: ExtensionMessage) => void) => () => void
}

/**
 * Remembered review model, persisted in extension globalState. Loaded once on
 * mount; the extension re-pushes `reviewModelLoaded` after a review is accepted
 * so the pick stays current without a round-trip.
 */
export function createReviewModel(options: Options): Accessor<ModelSelection | null> {
  const [model, set] = createSignal<ModelSelection | null>(null)
  const unsub = options.listen((message) => {
    if (message.type === "reviewModelLoaded") set(message.model)
  })
  options.post({ type: "requestReviewModel" })
  onCleanup(unsub)
  return model
}