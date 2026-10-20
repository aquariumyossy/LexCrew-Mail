import { describe, expect, it } from "vitest";
import {
  acceptTurnEvent,
  activeMailText,
  adoptLoadedLines,
  adoptStartedConversation,
  beginNewConversation,
  confirmationApplies,
  deleteShownConversation,
  detachPreviousMail,
  historyKey,
  priorLines,
  refuseStaleWrite,
  restoreDecision,
  sendTarget,
  transcriptSurvivesItemSwitch,
  turnPayload,
  turnVisibleText,
} from "./conversationState";

const sato = [
  { role: "user", content: "佐藤良一さんへの返信を書いて" },
  { role: "assistant", content: "佐藤さんへの返信です。" },
];

describe("delete history then start a new conversation", () => {
  it("sends no previous turns or names", () => {
    const shown = deleteShownConversation({ conversationId: "c-sato", fresh: false }, "c-sato");
    const started = beginNewConversation();
    expect(shown.fresh).toBe(true);
    expect(started).toEqual({ conversationId: "", fresh: true });
    const target = sendTarget(started);
    const prior = priorLines(
      target,
      () => sato,
      sato
    );
    const payload = turnPayload({
      prior,
      instruction: "返信を書いて",
      mailData: "差出人: 自分 <me@example.com>\n件名: 隠し文字の確認",
    });
    expect(payload).not.toContain("佐藤");
    expect(prior).toEqual([]);
  });

  it("does not keep the previous conversation id across a mail switch", () => {
    const detached = detachPreviousMail({ conversationId: "c-sato", fresh: false });
    expect(sendTarget(detached).kind).toBe("continue");
    const prior = priorLines(sendTarget(detached), () => sato, []);
    expect(JSON.stringify(prior)).not.toContain("佐藤");
  });

  it("does not restore a stored transcript over a new conversation", () => {
    const decision = restoreDecision(beginNewConversation(), { id: "c-sato" });
    expect(decision.restoreId).toBeNull();
    expect(decision.state.fresh).toBe(true);
    expect(decision.state.conversationId).toBe("");
  });

  it("shows none of the previous item once a new conversation is open on another mail", () => {
    const text = turnVisibleText({
      fresh: true,
      prior: sato,
      cachedItemId: "item-a",
      cachedMail: "差出人: 佐藤良一 <r.sato@4cs.co.jp>",
      liveItemId: "item-b",
      liveMail: "差出人: 自分 <me@example.com>",
      instruction: "返信を書いて",
    });
    expect(text).not.toContain("佐藤");
    expect(text).not.toContain("r.sato@4cs.co.jp");
    expect(text).toContain("me@example.com");
  });
});

describe("item switch", () => {
  it("drops a cached header when the open item changes", () => {
    const text = activeMailText("item-a", "佐藤良一 <r.sato@4cs.co.jp>", "item-b", "自分 <me@example.com>");
    expect(text).toBe("自分 <me@example.com>");
    expect(text).not.toContain("佐藤");
  });

  it("does not apply a confirmation that belongs to another item", () => {
    expect(confirmationApplies("item-a", "item-a")).toBe(true);
    expect(confirmationApplies("item-a", "item-b")).toBe(false);
    expect(confirmationApplies("item-a", "")).toBe(false);
    expect(refuseStaleWrite("item-a", "item-b")).toContain("変わった");
    expect(refuseStaleWrite("item-a", "item-a")).toBeNull();
  });

  it("ignores a turn that started on the previous view", () => {
    expect(acceptTurnEvent(1, 1)).toBe(true);
    expect(acceptTurnEvent(1, 2)).toBe(false);
  });

  it("does not reuse another item's temporary conversation key", () => {
    expect(historyKey("", "entry-b", "temp_sato")).toBe("item:entry-b");
    expect(historyKey("conv-a", "entry-a", "temp_sato")).toBe("conv-a");
    expect(historyKey("", "entry-b", "temp_sato")).not.toContain("sato");
  });

  it("keeps the transcript only for another message in the same thread", () => {
    expect(transcriptSurvivesItemSwitch("conv-a", "conv-a")).toBe(true);
    expect(transcriptSurvivesItemSwitch("conv-a", "conv-b")).toBe(false);
    expect(transcriptSurvivesItemSwitch("conv-a", "")).toBe(false);
    expect(transcriptSurvivesItemSwitch("conv-a", "item:entry-b")).toBe(false);
  });

  it("does not adopt a conversation that resolved after a new one started", () => {
    const started = adoptStartedConversation(1, 2, "c-sato", beginNewConversation());
    expect(started.adopt).toBe(false);
    expect(started.conversationId).toBe("");
    expect(started.fresh).toBe(true);
    expect(JSON.stringify(started)).not.toContain("sato");
    expect(adoptStartedConversation(1, 1, "c-sato", beginNewConversation()).adopt).toBe(true);
  });

  it("does not paint a history load that belongs to the previous view", () => {
    const settled = adoptLoadedLines(1, 2, sato, []);
    expect(settled.adopt).toBe(false);
    expect(settled.lines).toEqual([]);
    expect(JSON.stringify(settled.lines)).not.toContain("佐藤");
    expect(adoptLoadedLines(1, 1, sato, []).lines).toEqual(sato);
  });
});
