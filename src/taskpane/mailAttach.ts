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
