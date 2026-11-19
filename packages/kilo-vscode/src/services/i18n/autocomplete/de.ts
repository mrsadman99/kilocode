export const dict = {
  "kilocode:autocomplete.statusBar.enabled": "$(kilo-logo) Autovervollständigung",
  "kilocode:autocomplete.statusBar.snoozed": "pausiert",
  "kilocode:autocomplete.statusBar.warning": "$(warning) Autovervollständigung",
  "kilocode:autocomplete.statusBar.tooltip.basic": "Kilo Code Autovervollständigung",
  "kilocode:autocomplete.statusBar.tooltip.noUsableProvider":
    "**Kein Autovervollständigungsmodell konfiguriert**\n\nUm die Autovervollständigung zu aktivieren, füge ein Profil mit einem dieser unterstützten Anbieter hinzu: {{providers}}.\n\n[Einstellungen öffnen]({{command}})",
  "kilocode:autocomplete.statusBar.tooltip.completionSummary":
    "{{count}} Vervollständigungen zwischen {{startTime}} und {{endTime}} ausgeführt, für Gesamtkosten von {{cost}}.",
  "kilocode:autocomplete.statusBar.tooltip.providerInfo":
    "Autovervollständigungen bereitgestellt von {{model}} über {{provider}}.",
  "kilocode:autocomplete.statusBar.cost.zero": "$0.00",
  "kilocode:autocomplete.statusBar.cost.lessThanCent": "<$0.01",
  "kilocode:autocomplete.codeAction.title": "Kilo Code: Vorgeschlagene Änderungen",
  "kilocode:autocomplete.incompatibilityExtensionPopup.message":
    "Kilo Code Autovervollständigung wird durch einen Konflikt mit GitHub Copilot blockiert. Um dies zu beheben, musst du die Inline-Vorschläge von Copilot deaktivieren.",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableCopilot": "Copilot deaktivieren",
  "kilocode:autocomplete.incompatibilityExtensionPopup.disableInlineAssist": "Autovervollständigung deaktivieren",
  "kilocode:autocomplete.creditsExhausted.message":
    "Kilo Code Autovervollständigung wurde pausiert. Mögliche Ursachen: Dein Kilo-Konto hat keine verbleibenden Credits, oder dein konfigurierter API-Schlüssel (BYOK) hat sein Kontingentlimit erreicht. Füge Kilo-Credits hinzu oder prüfe deine API-Schlüsselkonfiguration, um die Autovervollständigung fortzusetzen.",
  "kilocode:autocomplete.creditsExhausted.addCredits": "Credits hinzufügen",
  "kilocode:autocomplete.authError.message":
    "Kilo Code Autovervollständigung wurde aufgrund eines Authentifizierungsproblems pausiert. Mögliche Ursachen: Du bist nicht bei Kilo angemeldet, oder dein API-Schlüssel (BYOK) ist ungültig oder fehlt. Bitte melde dich erneut an oder prüfe die API-Schlüsseleinstellungen deines Anbieters.",
  "kilocode:autocomplete.invalidProvider.message":
    "Kilo Code Autocomplete ist angehalten: Der konfigurierte Anbieter „{{provider}}“ wird nicht unterstützt. Öffnen Sie Einstellungen → Modelle und wählen Sie Kilo Gateway, Mistral oder Local (Ollama).",
  "kilocode:autocomplete.notFound.message":
    "Kilo Code Autocomplete wurde angehalten: Das Autocomplete-Modell oder der API-Endpunkt wurde nicht gefunden (404). Prüfen Sie Modellname und Endpunkt unter Einstellungen → Modelle. Stellen Sie bei lokalen Modellen sicher, dass das Modell installiert und die Server-URL korrekt ist.",
}
