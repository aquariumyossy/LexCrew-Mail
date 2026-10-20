import { MailDraft } from "./draft";
import { stripSteeringMarks } from "./untrusted";

export type ThreadParty = { name?: string; address?: string };

/** One message in the open conversation. Addresses here are in-thread even when the open item does not list them. */
export type ThreadMessage = {
  from?: string;
  sender?: string;
  to?: string[];
  cc?: string[];
  replyTo?: string[];
};

export type ThreadSnapshot = {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  bcc?: string[];
  parties: ThreadParty[];
  messages?: ThreadMessage[];
};

export type DraftChange = {
  field: "subject" | "to" | "cc" | "bcc";
  before: string;
  after: string;
  /** Mailboxes on this field that are not in the thread. The pane renders these, not model text. */
  outside: string[];
};

/** Fixed pane copy. A message in the mail or the draft cannot replace it. */
export const OUTSIDE_THREAD_WARNING = "このアドレスはスレッド内に出てきません。宛先として正しいか確認してください。";

const FIELD_LABEL: Record<DraftChange["field"], string> = {
  subject: "件名",
  to: "宛先",
  cc: "CC",
  bcc: "BCC",
};

const MAILBOX = /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export type DraftReview =
  | { ok: true; draft: MailDraft; changes: DraftChange[] }
  | { ok: false; error: string };

type NamedAddress = { name: string; address: string };

export function smtpOf(value: string): string {
  const text = stripSteeringMarks(value || "").trim();
  const angled = text.match(/<([^<>]+)>/);
  const paren = text.match(/[（(]([^（）()]+)[）)]/);
  const candidate = (angled?.[1] || paren?.[1] || text).trim().toLowerCase();
  if (!candidate || candidate.startsWith("/") || /\s/.test(candidate)) return "";
  const at = candidate.indexOf("@");
  if (at <= 0 || at !== candidate.lastIndexOf("@") || at === candidate.length - 1) return "";
  return candidate;
}

export function isMailbox(value: string): boolean {
  const smtp = smtpOf(value);
  return smtp.length > 0 && smtp.length <= 254 && MAILBOX.test(smtp);
}

export function reviewDraftChange(draft: MailDraft, thread: ThreadSnapshot): DraftReview {
  const known = knownParties(thread);
  const allow = threadMailboxes(thread, known);

  const next: MailDraft = {
    subject: "",
    bodyHtml: draft.bodyHtml,
    citations: draft.citations,
  };
  const changes: DraftChange[] = [];

  const subject = stripSteeringMarks(draft.subject || "").trim();
  const currentSubject = stripSteeringMarks(thread.subject || "").trim();
  if (subject && subject !== currentSubject) {
    next.subject = subject;
    changes.push({ field: "subject", before: currentSubject || "（なし）", after: subject, outside: [] });
  }

  const to = resolveField(draft.to, "宛先", known, allow);
  if (!to.ok) return to;
  if (to.present) {
    const current = resolveField(thread.to || [], "宛先", known, allowAll(thread.to || [], allow), true);
    if (!sameSet(to.addresses, current.ok ? current.addresses : [])) {
      next.to = to.addresses;
      changes.push({
        field: "to",
        before: shown(thread.to),
        after: shown(to.addresses),
        outside: to.outside,
      });
    }
  }

  const cc = resolveField(draft.cc, "CC", known, allow);
  if (!cc.ok) return cc;
  if (cc.present) {
    const current = resolveField(thread.cc || [], "CC", known, allowAll(thread.cc || [], allow), true);
    if (!sameSet(cc.addresses, current.ok ? current.addresses : [])) {
      next.cc = cc.addresses;
      changes.push({
        field: "cc",
        before: shown(thread.cc),
        after: shown(cc.addresses),
        outside: cc.outside,
      });
    }
  }

  const bcc = resolveField(draft.bcc, "BCC", known, allow);
  if (!bcc.ok) return bcc;
  if (bcc.present) {
    const current = resolveField(thread.bcc || [], "BCC", known, allowAll(thread.bcc || [], allow), true);
    if (!sameSet(bcc.addresses, current.ok ? current.addresses : [])) {
      next.bcc = bcc.addresses;
      changes.push({
        field: "bcc",
        before: shown(thread.bcc),
        after: shown(bcc.addresses),
        outside: bcc.outside,
      });
    }
  }

  return { ok: true, draft: next, changes };
}

export function renderDraftConfirm(changes: DraftChange[]): { warning: string | null; outside: string[]; rows: Array<{ label: string; before: string; after: string }> } {
  const outside: string[] = [];
  for (const change of changes) {
    for (const address of change.outside) {
      if (!outside.includes(address)) outside.push(address);
    }
  }
  return {
    warning: outside.length ? OUTSIDE_THREAD_WARNING : null,
    outside,
    rows: changes.map((change) => ({
      label: FIELD_LABEL[change.field],
      before: change.before,
      after: change.after,
    })),
  };
}

/**
 * Fields the host may write. Approval is an argument, never a property of the draft,
 * so tool JSON cannot set headerApproved or replace the pane warning.
 */
export function sealDraftWrite(draft: MailDraft, headerApproved: boolean): Record<string, unknown> {
  const sealed: Record<string, unknown> = {
    subject: draft.subject,
    bodyHtml: draft.bodyHtml,
    citations: draft.citations,
  };
  if (draft.to !== undefined) sealed.to = draft.to;
  if (draft.cc !== undefined) sealed.cc = draft.cc;
  if (draft.bcc !== undefined) sealed.bcc = draft.bcc;
  if (headerApproved) sealed.headerApproved = true;
  return sealed;
}

/** Confirmation is the only way a header change, including an out-of-thread address, may be written. */
export async function gateDraftWrite(
  draft: MailDraft,
  thread: ThreadSnapshot,
  confirm: ((changes: DraftChange[]) => Promise<boolean>) | undefined
): Promise<{ ok: true; draft: MailDraft; headerApproved: boolean } | { ok: false; error: string }> {
  const review = reviewDraftChange(draft, thread);
  if (!review.ok) return review;
  if (!review.changes.length) return { ok: true, draft: review.draft, headerApproved: false };
  if (!confirm) return { ok: false, error: "件名または宛先の変更は確認できません。" };
  const approved = await confirm(review.changes);
  if (!approved) return { ok: false, error: "件名または宛先の変更はキャンセルされました。本文は書いていません。" };
  return { ok: true, draft: review.draft, headerApproved: true };
}

/** From, Sender, To, Cc, and Reply-To on every message in the conversation, plus the open item. */
function threadMailboxes(thread: ThreadSnapshot, known: NamedAddress[]): Set<string> {
  const allow = new Set(known.map((party) => party.address));
  const labels = [thread.from, ...(thread.to || []), ...(thread.cc || []), ...(thread.bcc || [])];
  for (const message of thread.messages || []) {
    labels.push(message.from || "", message.sender || "", ...(message.to || []), ...(message.cc || []), ...(message.replyTo || []));
  }
  for (const label of labels) {
    const smtp = smtpOf(label);
    if (smtp && isMailbox(smtp)) allow.add(smtp);
  }
  return allow;
}

export function parseConversation(value: unknown): ThreadMessage[] {
  if (!value || typeof value !== "object") return [];
  const rows = (value as { messages?: unknown }).messages;
  if (!Array.isArray(rows)) return [];
  const messages: ThreadMessage[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    messages.push({
      from: typeof record.from === "string" ? record.from : "",
      sender: typeof record.sender === "string" ? record.sender : "",
      to: stringList(record.to),
      cc: stringList(record.cc),
      replyTo: stringList(record.replyTo),
    });
  }
  return messages;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter((item) => item.length > 0);
}

function allowAll(labels: string[], allow: Set<string>): Set<string> {
  const widened = new Set(allow);
  for (const label of labels) {
    const smtp = smtpOf(label);
    if (smtp) widened.add(smtp);
  }
  return widened;
}

function knownParties(thread: ThreadSnapshot): NamedAddress[] {
  const out: NamedAddress[] = [];
  for (const party of thread.parties || []) {
    const address = smtpOf(party.address || "");
    if (!address || !isMailbox(address)) continue;
    out.push({ name: stripSteeringMarks(party.name || "").trim(), address });
  }
  return out;
}

function resolveField(
  values: string[] | undefined,
  label: string,
  parties: NamedAddress[],
  allow: Set<string>,
  lenient = false
): { ok: true; present: boolean; addresses: string[]; outside: string[] } | { ok: false; error: string } {
  if (!values) return { ok: true, present: false, addresses: [], outside: [] };
  const addresses: string[] = [];
  const outside: string[] = [];
  for (const raw of values) {
    const pieces = stripSteeringMarks(raw).split(/[;,]/).map((piece) => piece.trim()).filter(Boolean);
    if (!pieces.length) continue;
    for (const piece of pieces) {
      const smtp = smtpOf(piece);
      if (smtp) {
        if (!isMailbox(smtp)) return { ok: false, error: `${label}の形式が不正です。${piece}` };
        pushUnique(addresses, smtp);
        if (!allow.has(smtp)) pushUnique(outside, smtp);
        continue;
      }
      const matches = parties.filter((party) => party.name === piece);
      const unique = [...new Set(matches.map((party) => party.address))];
      if (unique.length === 1 && allow.has(unique[0])) {
        pushUnique(addresses, unique[0]);
        continue;
      }
      if (lenient) continue;
      return { ok: false, error: `${label}の形式が不正です。${piece}` };
    }
  }
  return { ok: true, present: true, addresses, outside };
}

function pushUnique(into: string[], value: string): void {
  if (!into.includes(value)) into.push(value);
}

function sameSet(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function shown(values: string[] | undefined): string {
  const items = (values || []).map((item) => stripSteeringMarks(item).trim()).filter(Boolean);
  return items.length ? items.join("、") : "（なし）";
}
