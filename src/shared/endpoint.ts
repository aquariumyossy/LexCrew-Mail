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
