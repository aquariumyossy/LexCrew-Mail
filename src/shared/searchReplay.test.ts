import { compactSearchReplay } from "./searchReplay";

const PREFIX = "本文は省略した。要るときは同じ語で呼び直す。\n";

describe("compactSearchReplay", () => {
  it("compacts only search tools before the second-to-last user", () => {
    const sentHit = {
      subject: "期日",
      to: "相手",
      addresses: ["a@b.co"],
      sentOn: "2026-01-01",
      folder: "送信済み",
      excerpt: "本文長い",
      prior: "前のやりとり",
    };
    const receivedHit = {
      subject: "返信",
      from: "相手",
      address: "a@b.co",
      receivedOn: "2026-01-02",
      folder: "受信トレイ",
      excerpt: "受信本文",
    };
    const openItem = { subject: "件名", body: "本文" };
    const searchHit = { title: "記事", url: "https://example.com", content: "全文" };

    const messages = [
      { role: "user", content: "一回目" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "a", function: { name: "search_sent" } },
          { id: "b", function: { name: "get_open_item" } },
        ],
      },
      { role: "tool", content: JSON.stringify({ sent: [sentHit], received: [receivedHit] }), tool_call_id: "a" },
      { role: "tool", content: JSON.stringify(openItem), tool_call_id: "b" },
      { role: "assistant", content: "答え1" },
      { role: "user", content: "二回目" },
      {
        role: "assistant",
        content: "",
        tool_calls: [
          { id: "c", function: { name: "search_sent" } },
          { id: "d", function: { name: "search" } },
        ],
      },
      {
        role: "tool",
        content: JSON.stringify({
          sent: [{ subject: "近", to: "x", addresses: [], sentOn: "", folder: "", excerpt: "e", prior: "p" }],
          received: [],
        }),
        tool_call_id: "c",
      },
      { role: "tool", content: JSON.stringify([searchHit]), tool_call_id: "d" },
      { role: "assistant", content: "答え2" },
      { role: "user", content: "三回目" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "e", function: { name: "search" } }],
      },
      { role: "tool", content: JSON.stringify([{ title: "新", url: "https://n.example", content: "今" }]), tool_call_id: "e" },
    ];

    const out = compactSearchReplay(messages);
    expect(out[2].content).toBe(
      PREFIX +
        JSON.stringify({
          sent: [
            {
              subject: "期日",
              to: "相手",
              addresses: ["a@b.co"],
              sentOn: "2026-01-01",
              folder: "送信済み",
            },
          ],
          received: [
            {
              subject: "返信",
              from: "相手",
              address: "a@b.co",
              receivedOn: "2026-01-02",
              folder: "受信トレイ",
            },
          ],
        })
    );
    expect(out[3].content).toBe(JSON.stringify(openItem));
    expect(out[7].content).toBe(messages[7].content);
    expect(out[8].content).toBe(messages[8].content);
    expect(out[12].content).toBe(messages[12].content);
  });

  it("drops content from an old search hit", () => {
    const messages = [
      { role: "user", content: "一" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "s1", function: { name: "search" } }],
      },
      {
        role: "tool",
        content: JSON.stringify([{ title: "判例", url: "https://law.example", content: "判決文" }]),
        tool_call_id: "s1",
      },
      { role: "assistant", content: "ok" },
      { role: "user", content: "二" },
      { role: "assistant", content: "ok2" },
      { role: "user", content: "三" },
    ];
    const out = compactSearchReplay(messages);
    expect(out[2].content).toBe(PREFIX + '[{"title":"判例","url":"https://law.example"}]');
  });

  it("leaves non-JSON and unknown tool rows alone", () => {
    const messages = [
      { role: "user", content: "一" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "known", function: { name: "search" } }],
      },
      { role: "tool", content: "ヒットなし", tool_call_id: "known" },
      { role: "tool", content: "エラー: x", tool_call_id: "known" },
      { role: "tool", content: "{not-json", tool_call_id: "known" },
      { role: "tool", content: '[{"title":"a","url":"u","content":"c"}]', tool_call_id: "ghost" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "二" },
      { role: "assistant", content: "ok2" },
      { role: "user", content: "三" },
    ];
    const out = compactSearchReplay(messages);
    expect(out[2].content).toBe("ヒットなし");
    expect(out[3].content).toBe("エラー: x");
    expect(out[4].content).toBe("{not-json");
    expect(out[5].content).toBe('[{"title":"a","url":"u","content":"c"}]');
  });

  it("does not mutate the input row objects", () => {
    const original = '[{"title":"t","url":"u","content":"全文"}]';
    const messages = [
      { role: "user", content: "一" },
      {
        role: "assistant",
        content: "",
        tool_calls: [{ id: "s1", function: { name: "search" } }],
      },
      { role: "tool", content: original, tool_call_id: "s1" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "二" },
      { role: "assistant", content: "ok2" },
      { role: "user", content: "三" },
    ];
    compactSearchReplay(messages);
    expect(messages[2].content).toBe(original);
  });
});
