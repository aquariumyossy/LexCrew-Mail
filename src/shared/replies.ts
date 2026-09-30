import { FreeSlot } from "./freeSlots";

export const REPLY_SHORTCUTS = [
  { id: "thanks", label: "御礼", lead: "御礼の返信を書いて。" },
  { id: "accept", label: "承諾", lead: "承諾の返信を書いて。" },
  { id: "decline", label: "お断り", lead: "お断りの返信を書いて。" },
  { id: "schedule", label: "日程調整", lead: "日程調整の返信を書いて。" },
  { id: "toJa", label: "邦訳", lead: "開いているメールの英文を日本語に訳して。" },
  { id: "toEn", label: "英訳", lead: "開いているメールの日本語を英語に訳して。" },
] as const;

export type ReplyShortcutId = (typeof REPLY_SHORTCUTS)[number]["id"];

const KEEP = ["件名、宛先、CC は変えない。本文だけを書く。", "署名と、その下の引用は残す。", "送信はしない。"].join("\n");

function translateInstruction(lead: string, into: string): string {
  return [
    lead,
    "get_open_item で本文を読む。",
    `閲覧中は本文全体を${into}に訳し、チャットに出す。apply_draft はしない。`,
    `作成中とインライン返信は、署名と引用より前の前文だけを${into}に訳し、apply_draft する。`,
    "訳文に署名と引用は含めない。",
    "要約しない。説明を本文に足さない。",
    "固有名詞、日付、数値、段落の区切りは残す。",
    "search_sent、search、search_index、find_free_slots、list_events は使わない。",
    `作成中は、前文が空、またはすでに${into}なら、apply_draft せずチャットでその旨を伝える。`,
    KEEP,
  ].join("\n");
}

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
  if (id === "toJa" || id === "toEn") {
    return translateInstruction(shortcut.lead, id === "toJa" ? "日本語" : "英語");
  }
  if (id !== "schedule") return "";
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
