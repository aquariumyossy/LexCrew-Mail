import { describe, expect, it } from "vitest";
import { MailDraft } from "./draft";
import { reviewDraftChange, smtpOf, ThreadSnapshot } from "./draftGate";

const thread: ThreadSnapshot = {
  subject: "契約の件",
  from: "山田 太郎 <taro@example.com>",
  to: ["花子 <hanako@example.com>"],
  cc: ["cc@example.com"],
  parties: [
    { name: "山田 太郎", address: "taro@example.com" },
    { name: "花子", address: "hanako@example.com" },
    { name: "監査", address: "cc@example.com" },
  ],
};

function draft(partial: Partial<MailDraft> & { bodyHtml: string }): MailDraft {
  return { subject: "", citations: [], ...partial };
}

describe("reviewDraftChange", () => {
  it("leaves the body path alone when recipients and subject are omitted", () => {
    const review = reviewDraftChange(draft({ bodyHtml: "<p>本文</p>" }), thread);
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.changes).toEqual([]);
    expect(review.draft.to).toBeUndefined();
    expect(review.draft.cc).toBeUndefined();
    expect(review.draft.subject).toBe("");
  });

  it("does not ask when the addresses are the same participants", () => {
    const review = reviewDraftChange(
      draft({ bodyHtml: "<p>本文</p>", to: ["hanako@example.com"], cc: ["監査"] }),
      thread
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.changes).toEqual([]);
  });

  it("rejects an address that is not on the thread", () => {
    const review = reviewDraftChange(
      draft({ bodyHtml: "<p>本文</p>", to: ["hanako@example.com", "attacker@evil.example"] }),
      thread
    );
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.error).toContain("attacker@evil.example");
    expect(review.error).toContain("参加者以外");
  });

  it("rejects a display name that is not a participant", () => {
    const review = reviewDraftChange(draft({ bodyHtml: "<p>本文</p>", cc: ["知らない人"] }), thread);
    expect(review.ok).toBe(false);
    if (review.ok) return;
    expect(review.error).toContain("知らない人");
  });

  it("asks before a subject or recipient change and shows both sides", () => {
    const review = reviewDraftChange(
      draft({
        bodyHtml: "<p>本文</p>",
        subject: "別の件名",
        to: ["taro@example.com"],
        cc: [],
      }),
      thread
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.changes).toEqual([
      { field: "subject", before: "契約の件", after: "別の件名" },
      { field: "to", before: "花子 <hanako@example.com>", after: "taro@example.com" },
      { field: "cc", before: "cc@example.com", after: "（なし）" },
    ]);
    expect(review.draft.subject).toBe("別の件名");
    expect(review.draft.to).toEqual(["taro@example.com"]);
    expect(review.draft.cc).toEqual([]);
  });

  it("strips bidi marks so the shown subject matches what would be written", () => {
    const review = reviewDraftChange(
      draft({ bodyHtml: "<p>本文</p>", subject: "件名\u202E攻撃" }),
      thread
    );
    expect(review.ok).toBe(true);
    if (!review.ok) return;
    expect(review.draft.subject).toBe("件名攻撃");
    expect(review.changes[0].after).not.toContain("\u202E");
  });
});

describe("smtpOf", () => {
  it("reads an address out of a display label", () => {
    expect(smtpOf("山田 <Taro@Example.com>")).toBe("taro@example.com");
    expect(smtpOf("表示だけ")).toBe("");
  });
});
