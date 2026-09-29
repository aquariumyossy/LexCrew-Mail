import fs from "fs";
import Database from "better-sqlite3";
import { historyPath } from "../src/sidecar/history";
import { messagesTokens, messageTokens } from "../src/shared/context";
import { compactSearchReplay } from "../src/shared/searchReplay";

type ReplayRow = {
  role: string;
  content: string;
  tool_calls?: Array<{ id?: string; function: { name: string; arguments?: string } }>;
  tool_call_id?: string;
};

function main(): void {
  const file = historyPath();
  if (!fs.existsSync(file)) {
    console.log("履歴データベースが見つかりません。");
    process.exit(0);
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const conversations = db.prepare("SELECT id, title FROM conversations ORDER BY updated_at DESC").all() as Array<{
    id: string;
    title: string;
  }>;
  const loadMessages = db.prepare(
    "SELECT role, content, tool_calls_json, tool_call_id FROM messages WHERE conversation_id = ? ORDER BY created_at"
  );

  let totalMessages = 0;
  let totalTokens = 0;
  let totalCompactedTokens = 0;
  let compactedRows = 0;
  let compactedJsonOk = 0;
  let compactedJsonBad = 0;
  let inputMutated = false;
  const totalByTool: Record<string, number> = {};
  let conversationCount = 0;

  for (const conversation of conversations) {
    const rows = loadMessages.all(conversation.id) as Array<{
      role: string;
      content: string;
      tool_calls_json: string;
      tool_call_id: string;
    }>;
    const mapped: ReplayRow[] = rows.map((row) => ({
      role: row.role,
      content: row.content,
      tool_calls: row.tool_calls_json ? JSON.parse(row.tool_calls_json) : undefined,
      tool_call_id: row.tool_call_id || undefined,
    }));
    const lastUser = mapped.map((row, index) => (row.role === "user" ? index : -1)).filter((index) => index >= 0).pop();
    if (lastUser === undefined) continue;
    const list = mapped.slice(0, lastUser + 1);
    conversationCount += 1;

    const originals = list.map((row) => row.content);
    const compacted = compactSearchReplay(list);
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].content !== originals[i]) inputMutated = true;
      if (compacted[i].content === list[i].content) continue;
      if (compacted[i].role !== "tool") continue;
      compactedRows += 1;
      const body = (compacted[i].content || "").split("\n").slice(1).join("\n");
      try {
        JSON.parse(body);
        compactedJsonOk += 1;
      } catch {
        compactedJsonBad += 1;
      }
    }

    const idToName = new Map<string, string>();
    for (const row of list) {
      for (const call of row.tool_calls || []) {
        if (call.id) idToName.set(call.id, call.function.name);
      }
    }
    const byTool: Record<string, number> = {};
    for (const row of list) {
      if (row.role !== "tool") continue;
      const name = (row.tool_call_id && idToName.get(row.tool_call_id)) || "?";
      byTool[name] = (byTool[name] || 0) + messageTokens(row);
    }

    const tokens = messagesTokens(list);
    const afterTokens = messagesTokens(compacted);
    const delta = tokens - afterTokens;
    const pct = tokens ? ((delta / tokens) * 100).toFixed(1) : "0.0";
    totalMessages += list.length;
    totalTokens += tokens;
    totalCompactedTokens += afterTokens;
    for (const [name, value] of Object.entries(byTool)) {
      totalByTool[name] = (totalByTool[name] || 0) + value;
    }

    console.log(`--- ${conversation.id} ${conversation.title}`);
    console.log(`messages=${list.length} tokens=${tokens} after=${afterTokens} delta=${delta} (${pct}%)`);
    console.log(`toolTokens=${JSON.stringify(byTool)}`);
  }

  const totalDelta = totalTokens - totalCompactedTokens;
  const totalPct = totalTokens ? ((totalDelta / totalTokens) * 100).toFixed(1) : "0.0";
  console.log("=== TOTALS ===");
  console.log(`conversations=${conversationCount}`);
  console.log(`messages=${totalMessages} tokens=${totalTokens}`);
  console.log(`after=${totalCompactedTokens} delta=${totalDelta} (${totalPct}%)`);
  console.log(`toolTokens=${JSON.stringify(totalByTool)}`);
  console.log(`compactedRows=${compactedRows} jsonOk=${compactedJsonOk} jsonBad=${compactedJsonBad}`);
  console.log(`inputUnchanged=${!inputMutated}`);
  db.close();
}

main();
