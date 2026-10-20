import { describe, expect, it } from "vitest";
import {
  beginNewConversation,
  deleteShownConversation,
  detachPreviousMail,
  priorLines,
  restoreDecision,
  sendTarget,
  turnPayload,
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
});
