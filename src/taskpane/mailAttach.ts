export type MailFileRef = { index: number; name: string; size: number };
export type HeldMailFile = { name: string; size: number };

export type MailAttachPlan =
  | { kind: "quiet" }
  | { kind: "hint" }
  | { kind: "error"; text: string }
  | { kind: "read"; files: MailFileRef[] };

export const MAIL_ATTACH_HINT =
  "添付ファイルを読む場合は、設定の「メール添付ファイルを読む」をオンにしてください。";

const QUIET_ERRORS = new Set(["メールが選択されていません。", "添付を読めるメールがありません。"]);

/** Suffix for a mail chip that lists more than one file. Reading wins, then failure, then a scan that is waiting. */
export function mailChipNote(state: { reading: string | null; waiting: number; failed: number }): string {
  if (state.reading) return `・${state.reading}`;
  if (state.failed > 0) return `・${state.failed.toLocaleString("ja-JP")} 件失敗`;
  if (state.waiting > 0) return `・OCR待ち ${state.waiting.toLocaleString("ja-JP")} 件`;
  return "";
}

export function planMailAttach(
  enabled: boolean,
  listed: { files: MailFileRef[]; error?: string },
  held: HeldMailFile[]
): MailAttachPlan {
  if (listed.error) {
    if (QUIET_ERRORS.has(listed.error)) return { kind: "quiet" };
    return { kind: "error", text: listed.error };
  }
  const fresh = listed.files.filter((file) => !held.some((row) => row.name === file.name && row.size === file.size));
  if (!fresh.length) return { kind: "quiet" };
  if (!enabled) return { kind: "hint" };
  return { kind: "read", files: fresh };
}
