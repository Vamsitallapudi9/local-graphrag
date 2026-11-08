// Hide API keys before text reaches logs or the browser.
export function redactSecrets(text: string) {
  return text
    .replace(/api_key=['"][^'"\n]+['"]/gi, "api_key='[REDACTED]'")
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, 'sk-REDACTED')
    .replace(/AIza[A-Za-z0-9_-]{20,}/g, 'AIza-REDACTED')
}
