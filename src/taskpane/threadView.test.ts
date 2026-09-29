import { describe, expect, it } from "vitest";
import { decideThread, park, splitHistory, unpark } from "./threadView";

const idle = { busy: false, loading: false };

describe("decideThread", () => {
  it("switches when the open thread changes", () => {
    expect(decideThread("A", "B", idle)).toEqual({ kind: "switch", key: "B" });
  });

  it("stays on the same thread, an empty key, a running turn, or a file read", () => {
    expect(decideThread("A", "A", idle)).toEqual({ kind: "stay" });
    expect(decideThread("A", "", idle)).toEqual({ kind: "stay" });
    expect(decideThread("A", "B", { busy: true, loading: false })).toEqual({ kind: "stay" });
    expect(decideThread("A", "B", { busy: false, loading: true })).toEqual({ kind: "stay" });
  });
});

describe("splitHistory", () => {
  it("keeps this mail's rows in order and puts the rest aside", () => {
    const rows = [
      { id: "new-b", conversationKey: "B" },
      { id: "new-a", conversationKey: "A" },
      { id: "old-a", conversationKey: "A" },
      { id: "none" },
    ];
    expect(splitHistory(rows, "A")).toEqual({
      here: [
        { id: "new-a", conversationKey: "A" },
        { id: "old-a", conversationKey: "A" },
      ],
      elsewhere: [{ id: "new-b", conversationKey: "B" }, { id: "none" }],
    });
  });

  it("puts every row aside when no mail is open", () => {
    const rows = [{ id: "a", conversationKey: "A" }];
    expect(splitHistory(rows, "")).toEqual({ here: [], elsewhere: rows });
  });
});

describe("park", () => {
  it("returns the draft once and then nothing", () => {
    const drafts = new Map<string, { text: string; pending: { id: string }[] }>();
    const file = { id: "f" };
    park(drafts, "A", { text: "途中", pending: [file] });
    expect(unpark(drafts, "A")).toEqual({ text: "途中", pending: [file] });
    expect(unpark(drafts, "A")).toEqual({ text: "", pending: [] });
  });

  it("drops an empty draft", () => {
    const drafts = new Map<string, { text: string; pending: never[] }>();
    park(drafts, "A", { text: "途中", pending: [] });
    park(drafts, "A", { text: "", pending: [] });
    expect(unpark(drafts, "A")).toEqual({ text: "", pending: [] });
  });
});
