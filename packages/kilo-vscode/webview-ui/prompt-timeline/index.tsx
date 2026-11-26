import { onCleanup, onMount, type Component } from "solid-js"
import { render } from "solid-js/web"
import "@kilocode/kilo-ui/styles"
import "../src/styles/chat.css"
import "./prompt-timeline.css"
import { ProviderShell } from "../src/context/provider-shell"
import { useVSCode } from "../src/context/vscode"
import { TimelinePanel } from "./TimelinePanel"
import { createTimeline, type TimelineMessage } from "./state"

const App: Component = () => {
  const vscode = useVSCode()
  const state = createTimeline()

  onMount(() => {
    const off = vscode.onMessage((item) => {
      if (typeof item?.type === "string" && item.type.startsWith("promptTimeline.")) {
        state.onMessage(item as unknown as TimelineMessage)
      }
    })
    onCleanup(off)
  })

  return <TimelinePanel state={state} />
}

const root = document.getElementById("root")
if (!root) throw new Error("Root element not found")
render(
  () => (
    <ProviderShell.Root>
      <App />
    </ProviderShell.Root>
  ),
  root,
)
