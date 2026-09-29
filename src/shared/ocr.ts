import { MAX_OCR_PAGE_CHARS } from "./constants";

/** One page at a time, so a long scan does not depend on one huge reply. */
export const OCR_PROMPT = [
  "この画像は日本の法律文書を紙で読み取ったものです。書かれている文字をそのまま書き出してください。",
  "要約・翻訳・言い換えをしません。読めない文字は「□」にします。",
  "段落と改行は元の見た目に合わせます。罫線だけの表は行ごとにタブ区切りで書きます。表は図にしません。",
  "箱や文字が線や矢印で結ばれているときは、本文のあとに「〔図〕」と1行置き、結ばれている相手を1行ずつ書きます。箱の中の文字は日付も含めて残します。端点は箱の文字を短くせずそのまま書きます。",
  "向きのある矢印は「山田太郎 → 山田花子」です。線のそばに文字があるときは「山田太郎 -子→ 山田花子」とします。矢印が無く一重の線は「山田太郎 — 山田花子」、二重線は「山田太郎 ═ 山田花子」、点線は「山田太郎 ┄ 山田花子」です。並びは図の位置のまま（上または左を先）にします。",
  "親子、婚姻、養子とは書きません。上下の配置から矢印に変えません。二重線を婚姻とは呼びません。図が無いページでは「〔図〕」を書きません。紙に印刷された「図1」などの見出しは本文の文字として残します。",
  "文字が何も無ければ、何も書かずに空で返してください。感想や説明は書きません。",
].join("\n");

/** Said once per scan. The user has to know a page is leaving the machine. */
export const REMOTE_OCR_NOTICE = "画像は設定中の LLM サーバへ送られます。";

export const EMPTY_SCAN_ERROR = "画像から文字を読み取れませんでした。";

const LOOPBACK_HOSTS = new Set(["localhost", "::1", "0:0:0:0:0:0:0:1"]);

/**
 * Host of a base URL that may have no scheme, credentials, a port, or a
 * bracketed v6 address. `new URL` refuses the schemeless form the setting allows.
 */
export function isLoopbackUrl(raw: string): boolean {
  const text = (raw || "").trim();
  if (!text) {
    return false;
  }
  const afterScheme = text.includes("://") ? text.slice(text.indexOf("://") + 3) : text;
  const hostPort = (afterScheme.split("/")[0] || "").split("@").pop() || "";
  const host = hostPort.startsWith("[") ? hostPort.slice(1).split("]")[0] : hostPort.split(":")[0];
  const lowered = host.toLowerCase();
  return LOOPBACK_HOSTS.has(lowered) || /^127\.\d+\.\d+\.\d+$/.test(lowered);
}

const VISION_HINTS = ["image", "vision", "multimodal", "image_url", "content must be a string"];

/**
 * A text-only model refuses the request rather than answering badly. The
 * upstream wording does not tell the user to pick another model.
 */
export function visionUnsupportedMessage(detail: string): string | null {
  const lowered = (detail || "").toLowerCase();
  return VISION_HINTS.some((hint) => lowered.includes(hint))
    ? "このモデルは画像を読めません。設定で画像に対応したモデルを選んでください。"
    : null;
}

/** Cuts a page reply without splitting a character. */
export function clipPage(text: string): string {
  const chars = [...(text || "")];
  return chars.length <= MAX_OCR_PAGE_CHARS ? chars.join("") : chars.slice(0, MAX_OCR_PAGE_CHARS).join("");
}
