export type MailFontId = "yu-gothic" | "yu-mincho" | "meiryo" | "ms-pgothic" | "ms-pmincho" | "biz-udpgothic" | "calibri";
export type MailFontRow = { id: MailFontId; label: string; ascii: string; fareast: string };
export type MailFontStamp = { ascii: string; fareast: string; sizePt: number };

export const MAIL_FONTS: readonly MailFontRow[] = [
  { id: "yu-gothic", label: "游ゴシック", ascii: "Yu Gothic", fareast: "游ゴシック" },
  { id: "yu-mincho", label: "游明朝", ascii: "Yu Mincho", fareast: "游明朝" },
  { id: "meiryo", label: "メイリオ", ascii: "Meiryo", fareast: "メイリオ" },
  { id: "ms-pgothic", label: "ＭＳ Ｐゴシック", ascii: "MS PGothic", fareast: "ＭＳ Ｐゴシック" },
  { id: "ms-pmincho", label: "ＭＳ Ｐ明朝", ascii: "MS PMincho", fareast: "ＭＳ Ｐ明朝" },
  { id: "biz-udpgothic", label: "BIZ UDPゴシック", ascii: "BIZ UDPGothic", fareast: "BIZ UDPゴシック" },
  { id: "calibri", label: "Calibri", ascii: "Calibri", fareast: "Calibri" },
];
export const DEFAULT_MAIL_FONT_ID: MailFontId = "yu-gothic";
export const DEFAULT_MAIL_FONT_SIZE_PT = 10.5;
export const MAIL_FONT_SIZE_MIN = 8;
export const MAIL_FONT_SIZE_MAX = 36;
export const MAIL_FONT_SIZE_STEP = 0.5;

function findRow(id: unknown): MailFontRow | undefined {
  return MAIL_FONTS.find((row) => row.id === id);
}

function validSize(value: number): boolean {
  if (!Number.isFinite(value) || value < MAIL_FONT_SIZE_MIN || value > MAIL_FONT_SIZE_MAX) return false;
  const steps = value / MAIL_FONT_SIZE_STEP;
  return Math.abs(steps - Math.round(steps)) < 1e-9;
}

export function normalizeMailFontId(value: unknown): MailFontId {
  return findRow(value)?.id ?? DEFAULT_MAIL_FONT_ID;
}

export function normalizeMailFontSizePt(value: unknown): number {
  return typeof value === "number" && validSize(value) ? value : DEFAULT_MAIL_FONT_SIZE_PT;
}

export function mailFontStamp(settings: { mailFontId: MailFontId; mailFontSizePt: number }): MailFontStamp {
  const row = findRow(settings.mailFontId) ?? MAIL_FONTS[0];
  return { ascii: row.ascii, fareast: row.fareast, sizePt: settings.mailFontSizePt };
}

export function mailFontSizeFromInput(text: string): number | null {
  if (text.trim() === "") return null;
  const value = Number(text);
  return validSize(value) ? value : null;
}
