import { EVENT_PRESETS, eventChipLabel, parseEventQuery, EventQuery } from "./calendarEvents";
import { MAX_TOOL_ROUNDS } from "./constants";

export const TOOL_GET_OPEN_ITEM = "get_open_item";
export const TOOL_APPLY_DRAFT = "apply_draft";
export const TOOL_SEARCH = "search";
export const TOOL_SEARCH_INDEX = "search_index";
export const TOOL_SEARCH_SENT = "search_sent";
export const TOOL_FIND_FREE_SLOTS = "find_free_slots";
export const TOOL_LIST_EVENTS = "list_events";

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

const queryParams = {
  type: "object",
  properties: { q: { type: "string", description: "検索語" } },
  required: ["q"],
};

const sentParams = {
  type: "object",
  properties: {
    q: { type: "string", description: "用件の語。会社名だけで相手を決めない" },
    address: { type: "string", description: "直前のヒットで返った SMTP アドレス。表示名は渡さない" },
  },
};

const eventParams = {
  type: "object",
  properties: {
    preset: {
      type: "string",
      enum: [...EVENT_PRESETS],
      description: "今日、明日、今週、来週。日付より優先する。空なら今日。週は月曜に始まる。",
    },
    from: { type: "string", description: "YYYY-MM-DD。to と組む。両端を含む。31日まで。" },
    to: { type: "string", description: "YYYY-MM-DD。from と組む。" },
    q: { type: "string", description: "件名の部分一致。今日や今週を探すときは空にする。言い換えでは当たらない。" },
  },
};

const draftParams = {
  type: "object",
  properties: {
    subject: { type: "string" },
    to: { type: "array", items: { type: "string" } },
    cc: { type: "array", items: { type: "string" } },
    bodyHtml: { type: "string", description: "新しい前文だけ。署名と引用は含めない" },
  },
  required: ["bodyHtml"],
};

export function buildTools(options: { searxng: boolean; argos: boolean }): ToolDefinition[] {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: TOOL_GET_OPEN_ITEM,
        description: "開いているメールの件名、差出人、宛先、CC、本文の平文を読む。予定と未選択では失敗する。",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_APPLY_DRAFT,
        description:
          "作成ウィンドウの件名と宛先を置き換え、本文は新しい前文だけを差し替える。閲覧中は書かない。bodyHtml は新しい前文だけ。署名と引用は含めない。宛先を変えてほしいと頼まれたとき以外は、to と cc を省略する。省略するとその欄は残る。空の配列を渡すとその欄を空にする。",
        parameters: draftParams,
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_FIND_FREE_SLOTS,
        description:
          "設定済みの対応時間、曜日、探す日数で、予定表から連続して空いている時間帯を最大件数まで返す。各時間帯は枠の長さ以上ある。引数は使わない。件名は含まれない。名前のある予定は list_events。",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_LIST_EVENTS,
        description:
          "名前のある予定を、件名と場所つきで返す。今日、今週、期日、会議の質問はこちらを使う。空き候補は find_free_slots。今日や今週を探すときは q を空にして一覧から選ぶ。終日は allDay が true。引数が空なら今日。",
        parameters: eventParams,
      },
    },
    {
      type: "function",
      function: {
        name: TOOL_SEARCH_SENT,
        description:
          "送信済みと受信トレイから、用件の語と SMTP アドレスで過去のメールを探す。送信は最大3件、受信は最大2件。excerpt は自分または相手の前文、prior は送信済みに引用された経緯。作成ウィンドウに宛先があれば address が空でもその SMTP を使う。複数の相手が返ったときは、返った address を指定して呼び直す。",
        parameters: sentParams,
      },
    },
  ];
  if (options.searxng) {
    tools.push({
      type: "function",
      function: {
        name: TOOL_SEARCH,
        description: "SearXNG で公開ウェブを検索する。",
        parameters: queryParams,
      },
    });
  }
  if (options.argos) {
    tools.push({
      type: "function",
      function: {
        name: TOOL_SEARCH_INDEX,
        description:
          "同一 PC の Argos 索引を検索する。path_prefix は渡さない。メールの差出人とフォルダは結果に含まれる。",
        parameters: queryParams,
      },
    });
  }
  return tools;
}

export type ParsedTool =
  | { name: typeof TOOL_GET_OPEN_ITEM }
  | { name: typeof TOOL_APPLY_DRAFT; draft: unknown }
  | { name: typeof TOOL_SEARCH; q: string }
  | { name: typeof TOOL_SEARCH_INDEX; q: string }
  | { name: typeof TOOL_SEARCH_SENT; q: string; address: string }
  | { name: typeof TOOL_FIND_FREE_SLOTS }
  | { name: typeof TOOL_LIST_EVENTS; query: EventQuery };

export function parseToolCall(call: ToolCall): { ok: true; tool: ParsedTool } | { ok: false; error: string } {
  let args: Record<string, unknown> = {};
  const raw = call.function.arguments || "{}";
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    return { ok: false, error: "ツール引数が JSON ではありません。" };
  }
  const name = call.function.name;
  if (name === TOOL_GET_OPEN_ITEM || name === TOOL_FIND_FREE_SLOTS) {
    return { ok: true, tool: { name } };
  }
  if (name === TOOL_LIST_EVENTS) {
    const query = parseEventQuery(args);
    if (!query.ok) return query;
    return { ok: true, tool: { name, query: query.query } };
  }
  if (name === TOOL_APPLY_DRAFT) {
    return { ok: true, tool: { name, draft: args } };
  }
  if (name === TOOL_SEARCH || name === TOOL_SEARCH_INDEX) {
    const q = typeof args.q === "string" ? args.q.trim() : "";
    if (!q) {
      return { ok: false, error: "検索語を入力してください。" };
    }
    return { ok: true, tool: { name, q } };
  }
  if (name === TOOL_SEARCH_SENT) {
    const q = typeof args.q === "string" ? args.q.trim() : "";
    const address = typeof args.address === "string" ? args.address.trim() : "";
    if (!q && !address) {
      return { ok: false, error: "検索語を入力してください。" };
    }
    return { ok: true, tool: { name, q, address } };
  }
  return { ok: false, error: `未知のツールです。${name}` };
}

function shorten(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

/** 0 means keep calling tools until the model answers or the user cancels. */
export const UNLIMITED_TOOL_ROUNDS = 0;
export const MAX_MAX_TOOL_ROUNDS = 256;
export const TOOL_ROUND_PRESETS = [8, 16, 32, UNLIMITED_TOOL_ROUNDS] as const;

export function normalizeMaxToolRounds(value: unknown): number {
  if (value === undefined || value === null || value === "") {
    return MAX_TOOL_ROUNDS;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return MAX_TOOL_ROUNDS;
  }
  const rounded = Math.round(n);
  if (rounded === UNLIMITED_TOOL_ROUNDS) {
    return UNLIMITED_TOOL_ROUNDS;
  }
  return Math.min(MAX_MAX_TOOL_ROUNDS, Math.max(1, rounded));
}

export function toolRoundPresetLabel(rounds: number): string {
  if (rounds === UNLIMITED_TOOL_ROUNDS) {
    return "制限なし";
  }
  if (rounds === MAX_TOOL_ROUNDS) {
    return `${rounds}（既定）`;
  }
  return String(rounds);
}

/** Shown in chat when the turn hits the configured tool-round cap. */
export function toolRoundLimitNotice(maxRounds: number): string {
  return (
    `ツール往復が上限の ${maxRounds} 回に達したため、残りの操作はしていません。` +
    "続きはもう一度指示するか、設定の「ツール往復の上限」を上げてください。"
  );
}

export function describeToolCall(name: string, rawArguments: string): string {
  const parsed = parseToolCall({ id: "", type: "function", function: { name, arguments: rawArguments || "{}" } });
  if (!parsed.ok) return name;
  if (parsed.tool.name === TOOL_SEARCH) return `検索「${shorten(parsed.tool.q, 20)}」`;
  if (parsed.tool.name === TOOL_SEARCH_INDEX) return `索引「${shorten(parsed.tool.q, 20)}」`;
  if (parsed.tool.name === TOOL_GET_OPEN_ITEM) return "メールを読む";
  if (parsed.tool.name === TOOL_FIND_FREE_SLOTS) return "空き時間";
  if (parsed.tool.name === TOOL_LIST_EVENTS) {
    return parsed.tool.query.q ? `予定「${shorten(parsed.tool.query.q, 20)}」` : eventChipLabel(parsed.tool.query);
  }
  if (parsed.tool.name === TOOL_SEARCH_SENT) {
    return `送信済み「${shorten(parsed.tool.q || parsed.tool.address, 20)}」`;
  }
  return "下書きを書き戻す";
}
