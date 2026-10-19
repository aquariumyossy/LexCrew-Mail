import { MailDraft } from "./draft";
import { stripSteeringMarks } from "./untrusted";

export type ThreadParty = { name?: string; address?: string };

export type ThreadSnapshot = {
  subject: string;
  from: string;
  to: string[];
  cc: string[];
  parties: ThreadParty[];
};

export type DraftChange = {
  field: "subject" | "to" | "cc";
  before: string;
  after: string;
};

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

export function reviewDraftChange(draft: MailDraft, thread: ThreadSnapshot): DraftReview {
  const known = knownParties(thread);
  const allow = new Set(known.map((party) => party.address));
  for (const label of [thread.from, ...(thread.to || []), ...(thread.cc || [])]) {
    const smtp = smtpOf(label);
    if (smtp) allow.add(smtp);
  }

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
    changes.push({ field: "subject", before: currentSubject || "（なし）", after: subject });
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
      });
    }
  }

  return { ok: true, draft: next, changes };
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
    if (!address) continue;
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
): { ok: true; present: boolean; addresses: string[] } | { ok: false; error: string } {
  if (!values) return { ok: true, present: false, addresses: [] };
  const addresses: string[] = [];
  for (const raw of values) {
    const pieces = stripSteeringMarks(raw).split(/[;,]/).map((piece) => piece.trim()).filter(Boolean);
    if (!pieces.length) continue;
    for (const piece of pieces) {
      const smtp = smtpOf(piece);
      if (smtp) {
        if (!allow.has(smtp)) {
          return { ok: false, error: `スレッドの参加者以外の宛先です。${smtp}` };
        }
        addresses.push(smtp);
        continue;
      }
      const matches = parties.filter((party) => party.name === piece);
      const unique = [...new Set(matches.map((party) => party.address))];
      if (unique.length === 1 && allow.has(unique[0])) {
        addresses.push(unique[0]);
        continue;
      }
      if (lenient) continue;
      return { ok: false, error: `${label}を解釈できません。${piece}` };
    }
  }
  return { ok: true, present: true, addresses };
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
