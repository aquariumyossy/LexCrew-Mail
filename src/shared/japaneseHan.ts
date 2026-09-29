import { HAN_BMP_A, HAN_BMP_A0, HAN_BMP_B, HAN_BMP_B0, HAN_EXTRA } from "./japaneseHanData";
import { MailDraft } from "./draft";
import { TOOL_APPLY_DRAFT, ToolCall, parseToolCall } from "./tools";

const SHOWN_LIMIT = 12;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

const bmpA = decodeBase64(HAN_BMP_A);
const bmpB = decodeBase64(HAN_BMP_B);
const extra = new Set(HAN_EXTRA);

function bitAt(table: Uint8Array, index: number): boolean {
  return (table[index >> 3] & (1 << (index & 7))) !== 0;
}

export function isCjkIdeograph(cp: number): boolean {
  return (
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b820 && cp <= 0x2ceaf) ||
    (cp >= 0x2ceb0 && cp <= 0x2ebef) ||
    (cp >= 0x30000 && cp <= 0x3134f) ||
    (cp >= 0x31350 && cp <= 0x323af)
  );
}

export function isJapaneseHan(cp: number): boolean {
  if (cp >= HAN_BMP_A0 && cp < HAN_BMP_A0 + bmpA.length * 8) {
    return bitAt(bmpA, cp - HAN_BMP_A0);
  }
  if (cp >= HAN_BMP_B0 && cp < HAN_BMP_B0 + bmpB.length * 8) {
    return bitAt(bmpB, cp - HAN_BMP_B0);
  }
  return extra.has(cp);
}

export function isForeignScript(cp: number): boolean {
  return (
    (cp >= 0x0400 && cp <= 0x052f) ||
    (cp >= 0x0590 && cp <= 0x05ff) ||
    (cp >= 0x0600 && cp <= 0x06ff) ||
    (cp >= 0x0700 && cp <= 0x077f) ||
    (cp >= 0x0900 && cp <= 0x097f) ||
    (cp >= 0x0e00 && cp <= 0x0e7f) ||
    (cp >= 0x1100 && cp <= 0x11ff) ||
    (cp >= 0x2e80 && cp <= 0x2fdf) ||
    (cp >= 0x3100 && cp <= 0x312f) ||
    (cp >= 0x3130 && cp <= 0x318f) ||
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7ff) ||
    (cp >= 0xfb50 && cp <= 0xfdff) ||
    (cp >= 0xfe70 && cp <= 0xfefc) ||
    (cp >= 0xffa0 && cp <= 0xffdc)
  );
}

export function foreignChars(...parts: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const part of parts) {
    if (!part) continue;
    for (const ch of part) {
      const cp = ch.codePointAt(0);
      if (cp === undefined || seen.has(ch)) continue;
      const foreign = isForeignScript(cp) || (isCjkIdeograph(cp) && !isJapaneseHan(cp));
      if (!foreign) continue;
      seen.add(ch);
      ordered.push(ch);
    }
  }
  return ordered;
}

function formatChars(chars: string[]): string {
  const shown = chars.slice(0, SHOWN_LIMIT);
  const more = chars.length > SHOWN_LIMIT ? ` ほか${chars.length - SHOWN_LIMIT}字` : "";
  return `${shown.join("、")}${more}`;
}

export function foreignCharNotice(...parts: string[]): string | null {
  const chars = foreignChars(...parts);
  if (!chars.length) return null;
  return `日本語で用いない文字: ${formatChars(chars)}`;
}

export function htmlVisibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function draftForeignError(draft: Pick<MailDraft, "subject" | "bodyHtml">): string | null {
  const chars = foreignChars(draft.subject, htmlVisibleText(draft.bodyHtml));
  if (!chars.length) return null;
  return (
    `日本語で用いない文字が含まれています（${formatChars(chars)}）。` +
    "その部分を日本語（漢字の新字体・ひらがな・カタカナ）で書き直してください。"
  );
}

export function foreignCharNoticeForAssistant(content: string, toolCalls: ToolCall[] = []): string | null {
  const parts = [content];
  for (const call of toolCalls) {
    const parsed = parseToolCall(call);
    if (parsed.ok && parsed.tool.name === TOOL_APPLY_DRAFT) {
      const row = parsed.tool.draft as { subject?: unknown; bodyHtml?: unknown };
      if (typeof row.subject === "string") parts.push(row.subject);
      if (typeof row.bodyHtml === "string") parts.push(htmlVisibleText(row.bodyHtml));
    }
  }
  return foreignCharNotice(...parts);
}
