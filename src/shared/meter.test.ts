import { estimateTokens } from "./context";
import { renderMemorySection } from "./memory";
import { systemPrompt } from "./prompts";
import { countOutgoingTokens } from "./meter";

const now = new Date(2026, 8, 29);
const limit = 131_072;

function count(history: Parameters<typeof countOutgoingTokens>[0]["history"], instruction = "続き") {
  return countOutgoingTokens({
    history,
    instruction,
    files: [],
    contextLimit: limit,
    searxng: false,
    argos: false,
    memory: "",
    now,
  });
}

describe("countOutgoingTokens", () => {
  it("ignores an old search body and keeps the previous turn's body", () => {
    const huge = "あ".repeat(3000);
    const oldSearch = (body: string) => [
      { role: "user", content: "最初" },
      { role: "assistant", content: "", tool_calls: [{ id: "s", function: { name: "search", arguments: "{\"q\":\"判例\"}" } }] },
      { role: "tool", content: JSON.stringify([{ title: "判例", url: "https://example.com", content: body }]), tool_call_id: "s" },
      { role: "assistant", content: "答えた" },
      { role: "user", content: "次" },
      { role: "assistant", content: "了解" },
    ];
    expect(count(oldSearch(huge))).toBe(count(oldSearch("短い")));

    const previousSearch = (body: string) => [
      { role: "user", content: "最初" },
      { role: "assistant", content: "答えた" },
      { role: "user", content: "次" },
      { role: "assistant", content: "", tool_calls: [{ id: "s", function: { name: "search", arguments: "{\"q\":\"判例\"}" } }] },
      { role: "tool", content: JSON.stringify([{ title: "判例", url: "https://example.com", content: body }]), tool_call_id: "s" },
      { role: "assistant", content: "了解" },
    ];
    expect(count(previousSearch(huge))).toBeGreaterThan(count(previousSearch("短い")));
  });

  it("counts an attached file body once, inside the draft", () => {
    const bare = countOutgoingTokens({
      history: [],
      instruction: "読んで",
      files: [],
      contextLimit: limit,
      searxng: true,
      argos: true,
      memory: "",
      now,
    });
    const withFile = countOutgoingTokens({
      history: [],
      instruction: "読んで",
      files: [{ id: "f", name: "契約.txt", origin: "text", body: "あ".repeat(1600), truncated: false, size: 1600, mtime: 1 }],
      contextLimit: limit,
      searxng: true,
      argos: true,
      memory: "",
      now,
    });
    expect(withFile - bare).toBeGreaterThan(1000);
    expect(withFile - bare).toBeLessThan(1300);
  });

  it("counts a writing note inside the system prompt", () => {
    const section = renderMemorySection({ notes: [{ id: "n1", text: "結びは短くする。" }], people: [] }, []);
    const bare = count([]);
    const withMemory = countOutgoingTokens({
      history: [],
      instruction: "続き",
      files: [],
      contextLimit: limit,
      searxng: false,
      argos: false,
      memory: section,
      now,
    });
    const base = systemPrompt({ searxng: false, argos: false, now });
    const full = systemPrompt({ searxng: false, argos: false, now, memory: section });
    expect(full).toContain("結びは短くする。");
    expect(withMemory - bare).toBe(estimateTokens(full) - estimateTokens(base));
  });
});
