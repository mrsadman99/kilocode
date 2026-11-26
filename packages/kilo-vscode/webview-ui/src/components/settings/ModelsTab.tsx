import { Component, For, Show, createMemo } from "solid-js"
import { Card } from "@kilocode/kilo-ui/card"
import { Select } from "@kilocode/kilo-ui/select"
import { Switch } from "@kilocode/kilo-ui/switch"
import { TextField } from "@kilocode/kilo-ui/text-field"
import { Tooltip } from "@kilocode/kilo-ui/tooltip"
import { useConfig } from "../../context/config"
import { useLanguage } from "../../context/language"
import { useProvider } from "../../context/provider"
import { useSession } from "../../context/session"
import { useSpeechToTextModels } from "../../context/speech-to-text-models"
import { parseModelString } from "../../../../src/shared/provider-model"
import { ModelSelectorBase } from "../shared/ModelSelector"
import { ThinkingSelectorBase } from "../shared/ThinkingSelector"
import SettingsRow from "./SettingsRow"
import { DEFAULT_SPEECH_TO_TEXT_MODEL } from "../../../../src/speech-to-text/models"
import {
  hasCustomSpeechToTextSource,
  hasSpeechToTextAccess,
  selectedSpeechToTextModel,
} from "../speech-to-text/availability"
import { speechToTextModelOptions } from "../speech-to-text/model-selector"
import { AUTOCOMPLETE_SELECTOR_MODELS, getAutocompleteSelection } from "./autocomplete-model-selector"
import {
  formatForMode,
  modeFromFormat,
  profileOptions,
  resolveAutoProfile,
  transportFromFormat,
  type CustomInputMode,
} from "./custom-fim-mode"
import { preserveVariant } from "../../context/session-variant-store"

const ModelsTab: Component = () => {
  const { config, settings, updateConfig, updateSetting, features } = useConfig()
  const language = useLanguage()
  const provider = useProvider()
  const session = useSession()
  const speechModels = useSpeechToTextModels()

  const autocompleteProvider = () => {
    const v = settings()["autocomplete.provider"]
    return typeof v === "string" ? v : undefined
  }
  const autocompleteModel = () => {
    const v = settings()["autocomplete.model"]
    return typeof v === "string" ? v : undefined
  }

  function handleModelSelect(configKey: "model" | "small_model") {
    return (providerID: string, modelID: string) => {
      if (!providerID || !modelID) {
        updateConfig({ [configKey]: null })
        return
      }
      updateConfig({ [configKey]: `${providerID}/${modelID}` })
    }
  }

  const subagentModel = createMemo(() => parseModelString(config().subagent_model ?? undefined))
  const speechModel = createMemo(() => selectedSpeechToTextModel(config(), speechModels.models()))
  const speechOptions = createMemo(() => speechToTextModelOptions(speechModels.models()))
  const speechOption = createMemo(() => speechOptions().find((item) => item.value === speechModel()))
  const kiloReady = createMemo(() => hasSpeechToTextAccess(config(), provider.authStates()))
  const customSpeech = createMemo(() => hasCustomSpeechToTextSource(config()))

  function updateSpeech(patch: Record<string, string | null>) {
    updateConfig({ experimental: { ...config().experimental, ...patch } })
  }
  const variantKey = createMemo(() => config().subagent_model ?? undefined)
  const subagentVariants = createMemo(() => Object.keys(provider.findModel(subagentModel())?.variants ?? {}))
  const subagentVariant = createMemo(() => {
    const key = variantKey()
    if (!key) return undefined
    const value = config().subagent_variant_overrides?.[key]
    if (value) return value
    return config().subagent_model === key ? (config().subagent_variant ?? undefined) : undefined
  })

  function handleSubagentModelSelect(providerID: string, modelID: string) {
    if (!providerID || !modelID) {
      updateConfig({ subagent_model: null, subagent_variant: null })
      return
    }
    const value = `${providerID}/${modelID}`
    const list = Object.keys(provider.findModel({ providerID, modelID })?.variants ?? {})
    const next = preserveVariant(subagentVariant(), list)
    updateConfig({
      subagent_model: value,
      ...(config().subagent_model === value ? {} : { subagent_variant: null }),
      ...(next ? { subagent_variant_overrides: { ...config().subagent_variant_overrides, [value]: next } } : {}),
    })
  }

  function updateSubagentVariant(value: string | null) {
    const key = variantKey()
    if (!key) return
    updateConfig({
      subagent_variant_overrides: { [key]: value },
      ...(config().subagent_model === key ? { subagent_variant: null } : {}),
    })
  }

  const allAgents = createMemo(() => session.agents())

  function handleModeModelSelect(agentName: string) {
    return (providerID: string, modelID: string) => {
      if (!providerID || !modelID) {
        updateConfig({ agent: { [agentName]: { model: null } } })
        return
      }
      const current = config().agent?.[agentName]?.variant ?? undefined
      const list = Object.keys(provider.findModel({ providerID, modelID })?.variants ?? {})
      const next = preserveVariant(current, list)
      updateConfig({
        agent: {
          [agentName]: {
            model: `${providerID}/${modelID}`,
            ...(current && !list.includes(current) ? { variant: next ?? null } : {}),
          },
        },
      })
    }
  }

  function handleAutocompleteModelSelect(providerID: string, modelID: string) {
    if (!providerID || !modelID) {
      // Clearing both keys reverts to the resolved server-side default. Users
      // who pick "Not set" follow future default changes automatically.
      updateSetting("autocomplete.provider", null)
      updateSetting("autocomplete.model", null)
      return
    }
    if (providerID === "custom") {
      // The custom model name lives in its own free-form setting, not the
      // whitelisted `model` enum.
      updateSetting("autocomplete.provider", "custom")
      updateSetting("autocomplete.model", null)
      return
    }
    updateSetting("autocomplete.provider", providerID)
    updateSetting("autocomplete.model", modelID)
  }

  const customModel = () => {
    const v = settings()["autocomplete.customModel"]
    return typeof v === "string" ? v : ""
  }
  const customBaseURL = () => {
    const v = settings()["autocomplete.customBaseURL"]
    return typeof v === "string" ? v : ""
  }
  const customApiKey = () => {
    const v = settings()["autocomplete.customApiKey"]
    return typeof v === "string" ? v : ""
  }
  const customProxy = () => {
    const v = settings()["autocomplete.customProxy"]
    return typeof v === "string" ? v : ""
  }
  const customFormat = () => {
    const v = settings()["autocomplete.customFormat"]
    return v === "completions" || v === "generate" || v === "chat" ? v : "openai"
  }
  const customTemplate = () => {
    const v = settings()["autocomplete.customTemplate"]
    return typeof v === "string" ? v : "auto"
  }
  const inputMode = createMemo(() => modeFromFormat(customFormat()))
  const transport = createMemo(() => transportFromFormat(customFormat()))
  const modeOptions = createMemo(() => [
    { value: "native", label: language.t("settings.autocomplete.custom.mode.native") },
    { value: "raw", label: language.t("settings.autocomplete.custom.mode.raw") },
    { value: "chat", label: language.t("settings.autocomplete.custom.mode.chat") },
  ])
  const transportOptions = createMemo(() => [
    { value: "completions", label: language.t("settings.autocomplete.custom.transport.completions") },
    { value: "generate", label: language.t("settings.autocomplete.custom.transport.generate") },
  ])
  const profileOpts = createMemo(() =>
    profileOptions(language.t("settings.autocomplete.custom.auto"), inputMode() === "chat"),
  )
  const profileOption = () => profileOpts().find((item) => item.value === customTemplate())
  const autoResolution = createMemo(() => resolveAutoProfile(customTemplate(), customModel(), inputMode() === "chat"))
  const profileFeedback = createMemo(() => {
    const res = autoResolution()
    if (res.kind === "resolved")
      return language.t("settings.autocomplete.custom.profile.autoResolved", { label: res.label })
    if (res.kind === "unknown")
      return language.t("settings.autocomplete.custom.profile.autoUnknown", { model: res.model })
    if (res.kind === "unconfigured") return language.t("settings.autocomplete.custom.profile.chatUnconfigured")
    return undefined
  })
  function selectMode(value?: string) {
    const mode: CustomInputMode = value === "chat" ? "chat" : value === "raw" ? "raw" : "native"
    updateSetting("autocomplete.customFormat", formatForMode(mode, transport()))
  }
  function selectTransport(value?: string) {
    updateSetting("autocomplete.customFormat", value === "generate" ? "generate" : "completions")
  }
  function selectProfile(value?: string) {
    updateSetting("autocomplete.customTemplate", value ?? "auto")
  }

  return (
    <div>
      <Card>
        <SettingsRow
          title={language.t("settings.providers.defaultModel.title")}
          description={language.t("settings.providers.defaultModel.description")}
        >
          <ModelSelectorBase
            value={parseModelString(config().model ?? undefined)}
            onSelect={handleModelSelect("model")}
            placement="bottom-start"
            allowClear
            clearLabel={language.t("settings.providers.notSet")}
            label={language.t("settings.providers.defaultModel.title")}
            description={language.t("settings.providers.defaultModel.description")}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.providers.smallModel.title")}
          description={language.t("settings.providers.smallModel.description")}
        >
          <ModelSelectorBase
            value={parseModelString(config().small_model ?? undefined)}
            onSelect={handleModelSelect("small_model")}
            placement="bottom-start"
            allowClear
            clearLabel={language.t("settings.providers.notSet")}
            includeAutoSmall
            label={language.t("settings.providers.smallModel.title")}
            description={language.t("settings.providers.smallModel.description")}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.providers.subagentModel.title")}
          description={language.t("settings.providers.subagentModel.description")}
        >
          <div style={{ display: "flex", "flex-direction": "column", "align-items": "flex-end", gap: "8px" }}>
            <ModelSelectorBase
              value={subagentModel()}
              onSelect={handleSubagentModelSelect}
              placement="bottom-start"
              allowClear
              clearLabel={language.t("settings.providers.notSet")}
              label={language.t("settings.providers.subagentModel.title")}
              description={language.t("settings.providers.subagentModel.description")}
            />
            <Show when={subagentVariants().length > 0}>
              <ThinkingSelectorBase
                variants={subagentVariants()}
                value={subagentVariant()}
                onSelect={(value) => updateSubagentVariant(value)}
                onClear={() => updateSubagentVariant(null)}
                allowClear
                clearLabel={language.t("settings.providers.notSet")}
                placement="bottom-start"
                globalTrigger={false}
              />
            </Show>
          </div>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.context.compactionModel.title")}
          description={language.t("settings.context.compactionModel.description")}
        >
          <ModelSelectorBase
            value={parseModelString(config().agent?.compaction?.model ?? undefined)}
            onSelect={(providerID, modelID) =>
              updateConfig({
                agent: { compaction: { model: providerID && modelID ? `${providerID}/${modelID}` : null } },
              })
            }
            placement="bottom-start"
            allowClear
            clearLabel={language.t("settings.context.compactionModel.useChatModel")}
            label={language.t("settings.context.compactionModel.title")}
            description={language.t("settings.context.compactionModel.description")}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.autocomplete.model.title")}
          description={language.t("settings.autocomplete.model.description")}
        >
          <ModelSelectorBase
            value={getAutocompleteSelection(autocompleteProvider(), autocompleteModel())}
            onSelect={handleAutocompleteModelSelect}
            placement="bottom-start"
            models={AUTOCOMPLETE_SELECTOR_MODELS}
            favorites={false}
            allowClear
            clearLabel={language.t("settings.providers.notSet")}
            label={language.t("settings.autocomplete.model.title")}
            description={language.t("settings.autocomplete.model.description")}
          />
        </SettingsRow>
        <Show when={autocompleteProvider() === "custom" || autocompleteProvider() === "local"}>
          <SettingsRow
            title={language.t("settings.autocomplete.custom.model.title")}
            description={language.t("settings.autocomplete.custom.model.description")}
          >
            <TextField
              value={customModel()}
              placeholder="deepseek-chat"
              onChange={(value: string) => updateSetting("autocomplete.customModel", value.trim() || null)}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.autocomplete.custom.baseUrl.title")}
            description={language.t("settings.autocomplete.custom.baseUrl.description")}
          >
            <TextField
              value={customBaseURL()}
              placeholder="https://api.deepseek.com/beta"
              onChange={(value: string) => updateSetting("autocomplete.customBaseURL", value.trim() || null)}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.autocomplete.custom.apiKey.title")}
            description={language.t("settings.autocomplete.custom.apiKey.description")}
          >
            <TextField
              type="password"
              autocomplete="off"
              value={customApiKey()}
              placeholder={language.t("settings.autocomplete.custom.apiKey.placeholder")}
              onChange={(value: string) => updateSetting("autocomplete.customApiKey", value.trim() || null)}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.autocomplete.custom.proxy.title")}
            description={language.t("settings.autocomplete.custom.proxy.description")}
          >
            <TextField
              value={customProxy()}
              placeholder="http://127.0.0.1:8080"
              onChange={(value: string) => updateSetting("autocomplete.customProxy", value.trim() || null)}
            />
          </SettingsRow>
          <SettingsRow
            title={language.t("settings.autocomplete.custom.mode.title")}
            description={language.t("settings.autocomplete.custom.mode.description")}
          >
            <Select
              options={modeOptions()}
              current={modeOptions().find((item) => item.value === inputMode())}
              value={(item) => item.value}
              label={(item) => item.label}
              onSelect={(item) => selectMode(item?.value)}
              variant="secondary"
              size="small"
              triggerVariant="settings"
              triggerProps={{
                "aria-label": `${language.t("settings.autocomplete.custom.mode.title")}: ${inputMode()}`,
              }}
            />
          </SettingsRow>
          <Show when={inputMode() === "raw"}>
            <SettingsRow
              title={language.t("settings.autocomplete.custom.transport.title")}
              description={language.t("settings.autocomplete.custom.transport.description")}
            >
              <Select
                options={transportOptions()}
                current={transportOptions().find((item) => item.value === transport())}
                value={(item) => item.value}
                label={(item) => item.label}
                onSelect={(item) => selectTransport(item?.value)}
                variant="secondary"
                size="small"
                triggerVariant="settings"
                triggerProps={{
                  "aria-label": `${language.t("settings.autocomplete.custom.transport.title")}: ${transport()}`,
                }}
              />
            </SettingsRow>
          </Show>
          <Show when={inputMode() !== "native"}>
            <SettingsRow
              title={language.t("settings.autocomplete.custom.profile.title")}
              description={language.t("settings.autocomplete.custom.profile.description")}
            >
              <div style={{ display: "flex", "flex-direction": "column", "align-items": "flex-end", gap: "6px" }}>
                <Select
                  options={profileOpts()}
                  current={profileOption()}
                  value={(item) => item.value}
                  label={(item) => item.label}
                  onSelect={(item) => selectProfile(item?.value)}
                  variant="secondary"
                  size="small"
                  triggerVariant="settings"
                  triggerProps={{
                    "aria-label": `${language.t("settings.autocomplete.custom.profile.title")}: ${customTemplate()}`,
                  }}
                />
                <Show when={profileFeedback()}>
                  {(text) => (
                    <div
                      style={{
                        "font-size": "var(--font-size-small)",
                        color: "var(--vscode-inputValidation-warningForeground, var(--vscode-descriptionForeground))",
                        "text-align": "right",
                        "max-width": "160px",
                      }}
                    >
                      {text()}
                    </div>
                  )}
                </Show>
              </div>
            </SettingsRow>
          </Show>
        </Show>
        <SettingsRow
          title={language.t("settings.models.speechToTextBaseUrl.title")}
          description={language.t("settings.models.speechToTextBaseUrl.description")}
        >
          <TextField
            value={config().experimental?.speech_to_text_base_url ?? ""}
            placeholder={language.t("settings.models.speechToTextBaseUrl.placeholder")}
            onChange={(value: string) => updateSpeech({ speech_to_text_base_url: value.trim() || null })}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.models.speechToTextApiKey.title")}
          description={language.t("settings.models.speechToTextApiKey.description")}
        >
          <TextField
            type="password"
            value={config().experimental?.speech_to_text_api_key ?? ""}
            placeholder={language.t("settings.models.speechToTextApiKey.placeholder")}
            disabled={!customSpeech()}
            onChange={(value: string) => updateSpeech({ speech_to_text_api_key: value.trim() || null })}
          />
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.models.speechToTextModel.title")}
          description={
            !features().speechToText
              ? language.t("settings.models.speechToText.remoteDescription")
              : customSpeech()
                ? language.t("settings.models.speechToTextModel.customDescription")
                : kiloReady()
                  ? language.t("settings.models.speechToTextModel.description")
                  : language.t("settings.models.speechToText.disabledDescription")
          }
        >
          <Show
            when={!customSpeech()}
            fallback={
              <TextField
                value={config().experimental?.speech_to_text_model ?? ""}
                placeholder={language.t("settings.models.speechToTextModel.customPlaceholder")}
                onChange={(value: string) => updateSpeech({ speech_to_text_model: value.trim() || null })}
              />
            }
          >
            <Tooltip
              value={language.t("settings.models.speechToText.disabledDescription")}
              placement="top"
              inactive={kiloReady()}
            >
              <Select
                options={speechOptions()}
                current={speechOption()}
                value={(item) => item.value}
                label={(item) => `${item.label} (${item.provider})`}
                onSelect={(item) =>
                  updateSpeech({ speech_to_text_model: item?.value ?? DEFAULT_SPEECH_TO_TEXT_MODEL.id })
                }
                variant="secondary"
                size="small"
                triggerVariant="settings"
                triggerProps={{
                  "aria-label": `${language.t("settings.models.speechToTextModel.title")}: ${speechOption()?.label}`,
                }}
                disabled={!kiloReady()}
                placeholder={DEFAULT_SPEECH_TO_TEXT_MODEL.label}
              />
            </Tooltip>
          </Show>
        </SettingsRow>
        <SettingsRow
          title={language.t("settings.models.hidePromptTraining.title")}
          description={language.t("settings.models.hidePromptTraining.description")}
          last
        >
          <Switch
            checked={config().hide_prompt_training_models === true}
            onChange={(checked: boolean) => updateConfig({ hide_prompt_training_models: checked })}
            hideLabel
          >
            {language.t("settings.models.hidePromptTraining.title")}
          </Switch>
        </SettingsRow>
      </Card>

      <h4 style={{ "margin-top": "24px", "margin-bottom": "8px" }}>{language.t("settings.providers.modeModels")}</h4>
      <Card>
        <For each={allAgents()}>
          {(agent, index) => (
            <SettingsRow
              title={agent.name.charAt(0).toUpperCase() + agent.name.slice(1)}
              last={index() === allAgents().length - 1}
            >
              <ModelSelectorBase
                value={parseModelString(config().agent?.[agent.name]?.model ?? undefined)}
                onSelect={handleModeModelSelect(agent.name)}
                placement="bottom-start"
                allowClear
                clearLabel={language.t("settings.providers.notSet")}
                label={`${language.t("settings.providers.modeModels")}: ${agent.name}`}
                description={language.t("settings.providers.modeModels.description")}
              />
            </SettingsRow>
          )}
        </For>
      </Card>
    </div>
  )
}

export default ModelsTab
