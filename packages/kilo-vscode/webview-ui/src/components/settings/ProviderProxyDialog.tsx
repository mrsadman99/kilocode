import { Button } from "@kilocode/kilo-ui/button"
import { useDialog } from "@kilocode/kilo-ui/context/dialog"
import { Dialog } from "@kilocode/kilo-ui/dialog"
import { IconButton } from "@kilocode/kilo-ui/icon-button"
import { ProviderIcon } from "@kilocode/kilo-ui/provider-icon"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { showToast } from "@kilocode/kilo-ui/toast"
import { createSignal, onCleanup } from "solid-js"
import { useLanguage } from "../../context/language"
import { useVSCode } from "../../context/vscode"
import { createProviderAction } from "../../utils/provider-action"
import { composeProxyURL, isProxyURL, parseProxyURL } from "../../../../src/shared/custom-provider"
import { providerIcon } from "./provider-catalog"

export interface ProviderProxyDialogProps {
  providerID: string
  name: string
  /** Existing composed proxy URL from provider options, if any. */
  proxy?: string
}

const ProviderProxyDialog = (props: ProviderProxyDialogProps) => {
  const dialog = useDialog()
  const language = useLanguage()
  const vscode = useVSCode()
  const action = createProviderAction(vscode)
  onCleanup(action.dispose)

  const initial = parseProxyURL(props.proxy)
  const [address, setAddress] = createSignal(initial.address)
  const [user, setUser] = createSignal(initial.user)
  const [password, setPassword] = createSignal(initial.password)
  const [error, setError] = createSignal<string | undefined>()
  const [saving, setSaving] = createSignal(false)

  function save(e: SubmitEvent) {
    e.preventDefault()
    if (saving()) return
    const composed = composeProxyURL(address(), user(), password())
    if (address().trim() && (!composed || !isProxyURL(composed))) {
      setError(language.t("provider.custom.error.proxy.format"))
      return
    }
    setError(undefined)
    setSaving(true)
    action.send(
      { type: "setProviderProxy", providerID: props.providerID, proxy: composed },
      {
        onProxySaved: () => {
          setSaving(false)
          dialog.close()
          showToast({
            variant: "success",
            icon: "circle-check",
            title: language.t("provider.proxy.toast.saved.title", { provider: props.name }),
          })
        },
        onError: (message) => {
          setSaving(false)
          setError(message.message)
        },
      },
    )
  }

  return (
    <Dialog
      size="normal"
      title={
        <IconButton
          tabIndex={-1}
          icon="arrow-left"
          variant="ghost"
          onClick={() => dialog.close()}
          aria-label={language.t("common.goBack")}
        />
      }
      transition
    >
      <div
        style={{
          display: "flex",
          "flex-direction": "column",
          gap: "20px",
          padding: "0 16px 16px 16px",
          "overflow-y": "auto",
          flex: 1,
          width: "100%",
          "box-sizing": "border-box",
        }}
      >
        <div style={{ display: "flex", gap: "16px", "align-items": "center" }}>
          <ProviderIcon id={providerIcon(props.providerID)} width={20} height={20} />
          <div
            style={{ "font-size": "var(--kilo-font-size-16)", "font-weight": "500", color: "var(--vscode-foreground)" }}
          >
            {language.t("provider.proxy.title", { provider: props.name })}
          </div>
        </div>

        <form onSubmit={save} style={{ display: "flex", "flex-direction": "column", gap: "20px" }}>
          <div style={{ "font-size": "var(--kilo-font-size-14)", color: "var(--text-base)" }}>
            {language.t("provider.proxy.description")}
          </div>

          <div style={{ display: "flex", "flex-direction": "column", gap: "16px" }}>
            <TextField
              autofocus
              label={language.t("provider.custom.field.proxy.label")}
              placeholder={language.t("provider.custom.field.proxy.placeholder")}
              description={language.t("provider.custom.field.proxy.description")}
              value={address()}
              onChange={(v) => setAddress(v)}
              validationState={error() ? "invalid" : undefined}
              error={error()}
            />
            <div style={{ display: "flex", gap: "8px" }}>
              <div style={{ flex: 1 }}>
                <TextField
                  label={language.t("provider.custom.field.proxyUser.label")}
                  placeholder={language.t("provider.custom.field.proxyUser.placeholder")}
                  value={user()}
                  onChange={(v) => setUser(v)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <TextField
                  type="password"
                  label={language.t("provider.custom.field.proxyPassword.label")}
                  placeholder={language.t("provider.custom.field.proxyPassword.placeholder")}
                  value={password()}
                  onChange={(v) => setPassword(v)}
                />
              </div>
            </div>
          </div>

          <Button type="submit" size="large" variant="primary" disabled={saving()}>
            {saving() ? language.t("common.saving") : language.t("common.submit")}
          </Button>
        </form>
      </div>
    </Dialog>
  )
}

export default ProviderProxyDialog
