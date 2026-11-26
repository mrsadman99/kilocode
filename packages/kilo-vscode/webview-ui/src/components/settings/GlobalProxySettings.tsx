import { Button } from "@kilocode/kilo-ui/button"
import { Card } from "@kilocode/kilo-ui/card"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { showToast } from "@kilocode/kilo-ui/toast"
import { Component, createEffect, createMemo, createSignal } from "solid-js"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { composeProxyURL, isProxyURL, parseProxyURL } from "../../../../src/shared/custom-provider"

const GlobalProxySettings: Component = () => {
  const { settings, applySetting } = useConfig()
  const language = useLanguage()
  const [address, setAddress] = createSignal("")
  const [user, setUser] = createSignal("")
  const [password, setPassword] = createSignal("")
  const [error, setError] = createSignal<string | undefined>()

  const stored = createMemo(() => (settings().proxy as string | undefined) ?? "")

  // Populate the fields from the stored proxy URL once settings load, and again
  // after a save echoes back. Editing the fields does not change settings().proxy,
  // so this effect never clobbers in-progress edits.
  createEffect(() => {
    const parsed = parseProxyURL(stored())
    setAddress(parsed.address)
    setUser(parsed.user)
    setPassword(parsed.password)
  })

  function save(e: SubmitEvent) {
    e.preventDefault()
    const composed = composeProxyURL(address(), user(), password())
    if (address().trim() && (!composed || !isProxyURL(composed))) {
      setError(language.t("provider.custom.error.proxy.format"))
      return
    }
    setError(undefined)
    applySetting("proxy", composed ?? "", "proxy")
    showToast({ variant: "success", icon: "circle-check", title: language.t("settings.experimental.proxy.toast") })
  }

  return (
    <Card>
      <div data-component="global-proxy-settings">
        <div data-slot="settings-row-label-title" data-search-label={language.t("settings.experimental.proxy.title")}>
          {language.t("settings.experimental.proxy.title")}
        </div>
        <div data-slot="settings-row-label-subtitle">{language.t("settings.experimental.proxy.description")}</div>
        <form
          onSubmit={save}
          style={{ display: "flex", "flex-direction": "column", gap: "12px", "margin-top": "12px" }}
        >
          <TextField
            label={language.t("settings.experimental.proxy.address.label")}
            placeholder={language.t("settings.experimental.proxy.address.placeholder")}
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
          <div>
            <Button type="submit" variant="primary" size="small">
              {language.t("common.submit")}
            </Button>
          </div>
        </form>
      </div>
    </Card>
  )
}

export default GlobalProxySettings
