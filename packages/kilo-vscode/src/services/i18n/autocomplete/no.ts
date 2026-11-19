export const dict = {
  "kilocode:autocomplete.statusBar.enabled": "$(kilo-logo) Autofullføring",
  "kilocode:autocomplete.statusBar.snoozed": "utsatt",
  "kilocode:autocomplete.statusBar.warning": "$(warning) Autofullføring",
  "kilocode:autocomplete.statusBar.tooltip.basic": "Kilo Code autofullføring",
  "kilocode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**Ingen autofullføringsmodell konfigurert**\n\nFor å aktivere autofullføring, legg til en profil med en av disse støttede leverandørene: {{providers}}.\n\n[Åpne innstillinger]({{command}})",
  "kilocode:autocomplete.statusBar.tooltip.completionSummary":
    "Utførte {{count}} fullføringer mellom {{startTime}} og {{endTime}}, til en total kostnad på {{cost}}.",
  "kilocode:autocomplete.statusBar.tooltip.providerInfo": "Autofullføringer leveres av {{model}} via {{provider}}.",
  "kilocode:autocomplete.statusBar.cost.zero": "$0.00",
  "kilocode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kilocode:autocomplete.codeAction.title": "Kilo Code: Foreslåtte redigeringer",
  "kilocode:autocomplete.incompatibilityExtensionPopup.message":
    "Kilo Code autofullføring blokkeres av en konflikt med GitHub Copilot. For å fikse dette må du deaktivere Copilots inline-forslag.",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Deaktiver Copilot",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Deaktiver autofullføring",
  "kilocode:autocomplete.creditsExhausted.message":
    "Kilo Code autofullføring er satt på pause. Mulige årsaker: Kilo-kontoen din har ingen gjenværende kreditter, eller den konfigurerte API-nøkkelen (BYOK) har nådd kvotegrensen. Legg til Kilo-kreditter eller kontroller API-nøkkelkonfigurasjonen for å gjenoppta autofullføring.",
  "kilocode:autocomplete.creditsExhausted.addCredits": "Legg til kreditter",
  "kilocode:autocomplete.authError.message":
    "Kilo Code autofullføring er satt på pause på grunn av et autentiseringsproblem. Mulige årsaker: du er ikke logget på Kilo, eller API-nøkkelen din (BYOK) er ugyldig eller mangler. Logg inn igjen eller kontroller innstillingene for leverandørens API-nøkkel.",
  "kilocode:autocomplete.invalidProvider.message":
    "Kilo Code Autocomplete er satt på pause: den konfigurerte leverandøren «{{provider}}» støttes ikke. Åpne Innstillinger → Modeller og velg Kilo Gateway, Mistral eller Local (Ollama).",
  "kilocode:autocomplete.notFound.message":
    "Kilo Code Autocomplete er satt på pause: autocomplete-modellen eller API-endepunktet ble ikke funnet (404). Sjekk modellnavnet og endepunktet under Innstillinger → Modeller. For lokale modeller, sørg for at modellen er installert og at server-URL-en er riktig.",
}
