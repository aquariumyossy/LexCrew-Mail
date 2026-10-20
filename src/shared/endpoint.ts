import { isLoopbackUrl } from "./ocr";

export const LAN_HTTP_WARNING =
  "LLM の URL が暗号化されていない LAN 宛です。通信を傍受される可能性があります。";

/** Plain http to a host that is not this machine. https and loopback are quiet. */
export function plainHttpLanWarning(raw: string): string | null {
  const text = (raw || "").trim();
  if (!text) return null;
  const scheme = text.includes("://") ? text.slice(0, text.indexOf("://")).toLowerCase() : "";
  if (scheme !== "http") return null;
  if (isLoopbackUrl(text)) return null;
  return LAN_HTTP_WARNING;
}

export function lanHttpDismissalKey(raw: string): string {
  return (raw || "").trim();
}

export function withLanHttpDismissed<T extends { dismissedLanHttpUrl: string }>(settings: T, shownUrl: string): T {
  return { ...settings, dismissedLanHttpUrl: lanHttpDismissalKey(shownUrl) };
}

/** The pane notice, hidden after the same URL was closed. A different URL shows it again. */
export function visibleLanHttpWarning(raw: string, dismissedKey: string | null | undefined): string | null {
  const warning = plainHttpLanWarning(raw);
  if (!warning) return null;
  if (lanHttpDismissalKey(raw) === (dismissedKey || "").trim()) return null;
  return warning;
}
