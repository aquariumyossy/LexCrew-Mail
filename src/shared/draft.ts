export type Citation = {
  title: string;
  path: string;
  snippet: string;
  mailFrom: string;
  mailDate: string;
  mailFolder: string;
  mailConversationId: string;
  docKind: string;
};

export type MailDraft = {
  subject: string;
  to: string[];
  cc: string[];
  bodyHtml: string;
  citations: Citation[];
};

export type HostMode = "compose" | "read" | "none" | "not-message";

export function emptyDraft(): MailDraft {
  return { subject: "", to: [], cc: [], bodyHtml: "", citations: [] };
}

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

export function parseMailDraft(value: unknown): { ok: true; draft: MailDraft } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "下書きの形が不正です。" };
  }
  const row = value as Record<string, unknown>;
  if (typeof row.bodyHtml !== "string") {
    return { ok: false, error: "本文 HTML がありません。" };
  }
  const citations = Array.isArray(row.citations)
    ? row.citations.map(parseCitation).filter((item): item is Citation => item !== null)
    : [];
  return {
    ok: true,
    draft: {
      subject: typeof row.subject === "string" ? row.subject : "",
      to: asStringList(row.to),
      cc: asStringList(row.cc),
      bodyHtml: row.bodyHtml,
      citations,
    },
  };
}

function parseCitation(value: unknown): Citation | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const title = typeof row.title === "string" ? row.title : "";
  const path = typeof row.path === "string" ? row.path : "";
  if (!title && !path) {
    return null;
  }
  return {
    title: title || "(無題)",
    path,
    snippet: typeof row.snippet === "string" ? row.snippet : "",
    mailFrom: typeof row.mailFrom === "string" ? row.mailFrom : "",
    mailDate: typeof row.mailDate === "string" ? row.mailDate : "",
    mailFolder: typeof row.mailFolder === "string" ? row.mailFolder : "",
    mailConversationId: typeof row.mailConversationId === "string" ? row.mailConversationId : "",
    docKind: typeof row.docKind === "string" ? row.docKind : "",
  };
}

export function decideApply(mode: HostMode): { ok: true } | { ok: false; error: string } {
  if (mode === "compose") {
    return { ok: true };
  }
  if (mode === "read") {
    return { ok: false, error: "閲覧中は本文を書きません。返信・転送を開いてから書き戻してください。" };
  }
  if (mode === "none") {
    return { ok: false, error: "メールが選択されていません。" };
  }
  return { ok: false, error: "予定は本文を書きません。" };
}

type ItemShape = {
  itemType?: string;
  body?: { setAsync?: unknown };
  displayReplyForm?: unknown;
};

export function hostModeFromItem(item: ItemShape | null | undefined): HostMode {
  if (!item) {
    return "none";
  }
  if (item.itemType && item.itemType !== "message") {
    return "not-message";
  }
  if (typeof item.displayReplyForm === "function") {
    return "read";
  }
  if (item.body && typeof item.body.setAsync === "function") {
    return "compose";
  }
  return "none";
}
