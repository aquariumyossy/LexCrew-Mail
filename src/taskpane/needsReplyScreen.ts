import {
  JudgeLabel,
  LabeledMail,
  NeedsReplyCandidate,
  NeedsReplyCollected,
  NeedsReplyProgress,
  NeedsReplyScanRequest,
  NeedsReplySummary,
  WIDEN_QUESTION,
  collectNeedsReply,
  finishNote,
  formatReceived,
  labelCandidates,
  namesMissingNote,
  progressText,
  searchHeading,
  sortLabeled,
  summarizeNeedsReply,
  widerDays,
} from "../shared/needsReply";

export type NeedsReplyScreenDeps = {
  sender: string;
  note: string | null;
  signal: AbortSignal;
  abort: () => void;
  query: () => { days: number; names: string[] };
  scan: (request: NeedsReplyScanRequest) => Promise<unknown>;
  judge: (candidates: NeedsReplyCandidate[], names: string[], signal: AbortSignal) => Promise<JudgeLabel[]>;
  jump: (entryId: string, storeId: string) => Promise<void>;
  openWindow: (entryId: string, storeId: string) => Promise<void>;
  saveDays: (days: number) => string | null;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException ? error.name === "AbortError" : error instanceof Error && error.name === "AbortError";
}

export function startNeedsReplyScreen(deps: NeedsReplyScreenDeps): { view: HTMLElement; result: Promise<NeedsReplySummary> } {
  const view = el("div");
  view.className = "stack";
  const heading = el("p");
  heading.className = "note";
  const missing = el("p");
  missing.className = "note";
  const note = el("p");
  note.className = "note ok";
  note.hidden = true;
  const progress = el("div");
  progress.className = "reply-progress";
  const progressLabel = el("span", "準備しています");
  const stop = el("button", "止める");
  stop.type = "button";
  stop.className = "stop";
  progress.append(progressLabel, stop);
  const status = el("p");
  status.className = "note";
  status.hidden = true;
  const failure = el("p");
  failure.className = "warn";
  failure.hidden = true;
  const list = el("div");
  list.className = "reply-list";
  const ask = el("div");
  ask.className = "stack";
  const foot = el("p", "探すだけでは、既読やフラグは変わりません。移動も削除もしません。");
  foot.className = "note";
  view.append(heading, missing, note, progress, status, failure, list, ask, foot);

  if (deps.note) {
    note.textContent = deps.note;
    note.hidden = false;
  }
  const namesNote = namesMissingNote(deps.query().names);
  missing.hidden = !namesNote;
  missing.textContent = namesNote ?? "";

  let current: AbortController | null = null;
  let settled = false;
  let resolveResult: (summary: NeedsReplySummary) => void = () => {};
  let rejectResult: (error: unknown) => void = () => {};
  const result = new Promise<NeedsReplySummary>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const finish = (summary: NeedsReplySummary) => {
    if (settled) return;
    settled = true;
    resolveResult(summary);
  };

  stop.addEventListener("click", () => current?.abort());
  const onParentAbort = () => current?.abort();
  if (deps.signal.aborted) onParentAbort();
  else deps.signal.addEventListener("abort", onParentAbort);

  const showProgress = (value: NeedsReplyProgress) => {
    progress.hidden = false;
    stop.hidden = false;
    progressLabel.textContent = progressText(value);
  };

  const renderRows = (rows: LabeledMail[], partial: boolean) => {
    list.textContent = "";
    if (!rows.length) {
      list.append(el("p", partial ? "ここまでで候補はありません。" : "この期間に候補はありません。"));
      return;
    }
    for (const row of rows) {
      const card = el("div");
      card.className = "reply-row";
      const subject = el("div", row.subject.trim() || "(無題)");
      subject.className = "reply-subject";
      const meta = el("div", [row.from.trim() || "(差出人なし)", formatReceived(row.receivedOn)].filter(Boolean).join(" · "));
      meta.className = "reply-meta";
      const badge = el("span", row.label);
      badge.className = row.label === "要返信" ? "reply-label need" : row.label === "不要" ? "reply-label skip" : "reply-label check";
      const reason = el("div", row.reason);
      reason.className = "reply-meta";
      const actions = el("div");
      actions.className = "reply-actions";
      const rowError = el("div");
      rowError.className = "warn";
      rowError.hidden = true;
      const fail = (error: unknown) => {
        rowError.hidden = false;
        rowError.textContent = error instanceof Error ? error.message : "開けませんでした。";
      };
      const jump = el("button", "ジャンプ");
      jump.type = "button";
      jump.className = "chip";
      jump.addEventListener("click", () => {
        rowError.hidden = true;
        void deps.jump(row.entryId, row.storeId).catch(fail);
      });
      const open = el("button", "別ウィンドウで開く");
      open.type = "button";
      open.className = "chip";
      open.addEventListener("click", () => {
        rowError.hidden = true;
        void deps.openWindow(row.entryId, row.storeId).catch(fail);
      });
      actions.append(jump, open);
      card.append(subject, meta, badge, reason, actions, rowError);
      list.append(card);
    }
  };

  const run = async (initial: boolean) => {
    current?.abort();
    const local = new AbortController();
    current = local;
    if (deps.signal.aborted) local.abort();
    const query = deps.query();
    heading.textContent = searchHeading(query.days, deps.sender);
    failure.hidden = true;
    status.hidden = true;
    ask.textContent = "";
    list.textContent = "";
    showProgress({ phase: "sent", scanned: 0, found: 0 });
    let collected: NeedsReplyCollected = { candidates: [], scanned: 0, sentScanned: 0, stopped: false, truncated: false };
    try {
      collected = await collectNeedsReply({
        days: query.days,
        names: query.names,
        sender: deps.sender,
        signal: local.signal,
        onProgress: showProgress,
        scan: deps.scan,
      });
      let judged: JudgeLabel[] = [];
      let fallback = "判定できませんでした";
      if (!collected.stopped && !local.signal.aborted && collected.candidates.length) {
        showProgress({ phase: "judge", scanned: collected.scanned, found: collected.candidates.length });
        try {
          judged = await deps.judge(collected.candidates, query.names, local.signal);
        } catch (error) {
          if (!isAbort(error) && !local.signal.aborted) throw error;
          collected = { ...collected, stopped: true };
          fallback = "判定を止めました";
        }
      } else if (collected.stopped || local.signal.aborted) {
        collected = { ...collected, stopped: true };
        fallback = "判定を止めました";
      }
      const labeled = sortLabeled(labelCandidates(collected.candidates, judged, fallback));
      const summary = summarizeNeedsReply({
        days: query.days,
        note: note.hidden ? null : note.textContent,
        scanned: collected.scanned,
        labeled,
        stopped: collected.stopped,
        truncated: collected.truncated,
      });
      progress.hidden = true;
      const ended = finishNote(collected);
      status.hidden = !ended;
      status.textContent = ended ?? "";
      renderRows(labeled, Boolean(ended));
      if (summary.askWider) {
        const next = widerDays(query.days);
        ask.append(el("p", WIDEN_QUESTION));
        if (next !== null) {
          const more = el("button", `過去${next}日も探す`);
          more.type = "button";
          more.className = "primary";
          more.addEventListener("click", () => {
            const changed = deps.saveDays(next);
            if (changed) {
              note.textContent = changed;
              note.hidden = false;
            }
            void run(false);
          });
          ask.append(more);
        }
      }
      if (initial) finish(summary);
    } catch (error) {
      progress.hidden = true;
      if (isAbort(error) || local.signal.aborted) {
        collected = { ...collected, stopped: true };
        status.hidden = false;
        status.textContent = "途中で止めました。";
        if (initial) {
          finish(
            summarizeNeedsReply({
              days: query.days,
              note: note.hidden ? null : note.textContent,
              scanned: collected.scanned,
              labeled: [],
              stopped: true,
              truncated: collected.truncated,
            })
          );
        }
        return;
      }
      failure.hidden = false;
      failure.textContent = error instanceof Error ? error.message : "検索に失敗しました。";
      if (initial && !settled) rejectResult(error);
    }
  };

  void run(true);
  return { view, result };
}
