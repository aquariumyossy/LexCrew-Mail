import { FreeSlot } from "./freeSlots";

export const REPLY_SHORTCUTS = [
  { id: "thanks", label: "御礼", lead: "御礼の返信を書いて。" },
  { id: "accept", label: "承諾", lead: "承諾の返信を書いて。" },
  { id: "decline", label: "お断り", lead: "お断りの返信を書いて。" },
  { id: "schedule", label: "日程調整", lead: "日程調整の返信を書いて。" },
] as const;

export type ReplyShortcutId = (typeof REPLY_SHORTCUTS)[number]["id"];

const KEEP = ["件名、宛先、CC は変えない。本文だけを書く。", "署名と、その下の引用は残す。", "送信はしない。"].join("\n");

export function shortcutInstruction(id: ReplyShortcutId, slots?: { slots: FreeSlot[]; note: string }): string {
  const shortcut = REPLY_SHORTCUTS.find((item) => item.id === id);
  if (!shortcut) return "";
  if (id === "thanks") {
    return [
      shortcut.lead,
      "開いているメールへの御礼である。",
      "相手の連絡や対応に礼を述べ、受けた内容を一文で確認する。",
      "新しい約束、期限、候補日は足さない。",
      "相手の文面に合わせた丁寧さにする。",
      KEEP,
    ].join("\n");
  }
  if (id === "accept") {
    return [
      shortcut.lead,
      "開いているメールへの承諾である。",
      "引き受ける結論を先に書く。",
      "条件はメールに書かれたものだけにする。できない条件は足さない。",
      "相手の文面に合わせた丁寧さにする。",
      KEEP,
    ].join("\n");
  }
  if (id === "decline") {
    return [
      shortcut.lead,
      "開いているメールへのお断りである。",
      "断る結論を先に書く。",
      "理由や代替はメールにある事実だけにする。言い訳は作らない。",
      "相手の文面に合わせた丁寧さにする。",
      KEEP,
    ].join("\n");
  }
  const lines = slots?.slots.length
    ? slots.slots.map((slot) => `- ${slot.start} から ${slot.end}`)
    : ["- （なし）"];
  const empty = slots?.note ? slots.note : "空いている枠はない。";
  return [
    shortcut.lead,
    "開いているメールへの日程調整である。",
    "次の空き一覧以外の日時は書かない。",
    "各候補は連続して空いている時間帯である。時間帯のまま「この間でご都合のよい時間」と示してよい。",
    slots?.slots.length ? "相手が文面で示した日時と重なる時間帯を優先する。" : empty,
    ...(slots?.slots.length && slots.note ? [slots.note] : []),
    "一覧が空なら、空いている日時を作らず、相手に候補を尋ねる。",
    "候補:",
    ...lines,
    "相手の文面に合わせた丁寧さにする。",
    KEEP,
  ].join("\n");
}

export function replyShortcutLabel(content: string): string | null {
  const lead = content.split("\n")[0]?.trim();
  return REPLY_SHORTCUTS.find((item) => item.lead === lead)?.lead ?? null;
}
