import {
  ArgosScopeRow,
  argosButtonLabel,
  argosFolderListLabel,
  argosScopeChipLabel,
  collapseArgosScopes,
  matchesArgosFilter,
  sameArgosPath,
  searchPrefixes,
} from "../shared/argos";
import { foreignCharNoticeForAssistant } from "../shared/japaneseHan";
import { COOLDOWN_MINUTES, MAX_HORIZON_DAYS, MIN_HORIZON_DAYS, SLOT_MINUTES } from "../shared/freeSlots";
import { REPLY_SHORTCUTS, ReplyShortcutId, replyShortcutLabel, shortcutInstruction } from "../shared/replies";
import { TOOL_FIND_FREE_SLOTS, TOOL_LIST_EVENTS, TOOL_SEARCH, TOOL_SEARCH_INDEX, TOOL_SEARCH_SENT, ToolCall, TOOL_ROUND_PRESETS, describeToolCall, toolRoundPresetLabel } from "../shared/tools";
import { DEFAULT_ARGOS_BASE_URL, MAX_ATTACHED_FILES, MAX_TIMEOUT_MS, clampTimeoutMs } from "../shared/constants";
import {
  ACCEPTED_EXTENSIONS,
  CommittedFile,
  FileSource,
  commit,
  filesChars,
  historyTurnText,
  splitHistoryFiles,
  isPending,
  isReady,
  mergeFiles,
  modelTurnText,
  rejectReason,
  sameFile,
  tooManyFiles,
} from "../shared/attachedFiles";
import { REMOTE_OCR_NOTICE } from "../shared/ocr";
import { THINKING_LEVELS, THINKING_LEVEL_LABELS } from "../shared/thinking";
import { MAIL_FONTS, MAIL_FONT_SIZE_MAX, MAIL_FONT_SIZE_MIN, MAIL_FONT_SIZE_STEP, mailFontSizeFromInput, normalizeMailFontId } from "../shared/mailFont";
import { countOutgoingTokens } from "../shared/meter";
import { Memory, Party, renderMemorySection } from "../shared/memory";
import { renderMailHeader, systemPrompt } from "../shared/prompts";
import { ScopeRow, Settings, TextSetting, UiFontSize, adoptStoredConnection, checkHealth, connectionFields, deleteConversation, ensureConversation, fetchConnection, fetchMemory, listConversations, loadConversation, loadMessages, loadScopes, loadSettings, removePerson, saveConversationFiles, saveNotes, savePerson, saveSettings, saveStoredConnection, storeMessage, takeAdoptedSettings } from "./api";
import { badgeLabel, ingestBytes, ingestFile, readErrorMessage } from "./files/attach";
import { conversationKey, currentHostMode, listMailFiles, openThreadKey, outlookReady, readMailFile, readMailHeader, readParties } from "./host";
import { MAIL_ATTACH_HINT, MailAttachPlan, planMailAttach } from "./mailAttach";
import { collectFreeSlots } from "./slots";
import { renderMarkdown } from "./markdown";
import { runTurn } from "./runTurn";
import { Parked, decideThread, park, splitHistory, unpark } from "./threadView";
import { aboutCopy } from "./about";

type Banner = { kind: "success" | "warning" | "error"; text: string };
type ChatRow = { role: string; content: string; reasoningContent?: string; toolCalls?: ToolCall[]; toolCallId?: string; streaming?: boolean };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(path: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 20 20");
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS("http://www.w3.org/2000/svg", "path");
  shape.setAttribute("d", path);
  shape.setAttribute("fill", "currentColor");
  svg.append(shape);
  return svg;
}

const ICONS = {
  history: "M10 4a6 6 0 1 1-5.98 5.54.5.5 0 1 0-1-.08L3 10a7 7 0 1 0 2-4.9V3.5a.5.5 0 0 0-1 0v3c0 .28.22.5.5.5h3a.5.5 0 0 0 0-1H5.53c1.1-1.23 2.7-2 4.47-2m0 2.5a.5.5 0 0 0-1 0v4c0 .28.22.5.5.5h3a.5.5 0 0 0 0-1H10z",
  plug: "M17.85 2.85a.5.5 0 0 0-.7-.7L14.48 4.8a4.04 4.04 0 0 0-5.33.34l-.3.3a1.5 1.5 0 0 0 0 2.1l3.6 3.6c.58.59 1.52.59 2.1 0l.3-.3a4.04 4.04 0 0 0 .34-5.33zm-4 7.6c-.2.19-.5.19-.7 0l-3.6-3.6c-.19-.2-.19-.5 0-.7l.3-.3a3.04 3.04 0 0 1 4.3 4.3zm-6.3-1.6a1.5 1.5 0 0 0-2.1 0l-.3.3a4.04 4.04 0 0 0-.34 5.33l-2.66 2.67a.5.5 0 0 0 .7.7l2.67-2.66a4.04 4.04 0 0 0 5.33-.34l.3-.3c.59-.58.59-1.52 0-2.1zm-1.4.7c.2-.19.5-.19.7 0l3.6 3.6c.19.2.19.5 0 .7l-.3.3a3.04 3.04 0 1 1-4.3-4.3z",
  settings: "M1.91 7.38A8.5 8.5 0 0 1 3.7 4.3a.5.5 0 0 1 .54-.13l1.92.68a1 1 0 0 0 1.32-.76l.36-2a.5.5 0 0 1 .4-.4 9 9 0 0 1 3.55 0q.32.08.38.4l.37 2a1 1 0 0 0 1.32.76l1.92-.68a.5.5 0 0 1 .54.13 8.5 8.5 0 0 1 1.78 3.08q.08.31-.15.54l-1.56 1.32a1 1 0 0 0 0 1.52l1.56 1.32a.5.5 0 0 1 .15.54 8.5 8.5 0 0 1-1.78 3.08.5.5 0 0 1-.54.13l-1.92-.68a1 1 0 0 0-1.32.76l-.37 2a.5.5 0 0 1-.38.4 8.5 8.5 0 0 1-3.56 0 .5.5 0 0 1-.39-.4l-.36-2a1 1 0 0 0-1.32-.76l-1.92.68a.5.5 0 0 1-.54-.13 8.5 8.5 0 0 1-1.78-3.08.5.5 0 0 1 .15-.54l1.56-1.32a1 1 0 0 0 0-1.52L2.06 7.92a.5.5 0 0 1-.15-.54m1.06 0 1.3 1.1a2 2 0 0 1 0 3.04l-1.3 1.1q.45 1.19 1.25 2.16l1.6-.58a2 2 0 0 1 2.63 1.53l.3 1.67a8 8 0 0 0 2.5 0l.3-1.67a2 2 0 0 1 2.64-1.53l1.6.58a8 8 0 0 0 1.24-2.16l-1.3-1.1a2 2 0 0 1 0-3.04l1.3-1.1a8 8 0 0 0-1.25-2.16l-1.6.58a2 2 0 0 1-2.63-1.53l-.3-1.67a8 8 0 0 0-2.5 0l-.3 1.67A2 2 0 0 1 5.81 5.8l-1.6-.58a8 8 0 0 0-1.24 2.16M7.5 10a2.5 2.5 0 1 1 5 0 2.5 2.5 0 0 1-5 0m1 0a1.5 1.5 0 1 0 3 0 1.5 1.5 0 0 0-3 0",
  info: "M10 2a8 8 0 1 1 0 16 8 8 0 0 1 0-16m0 1a7 7 0 1 0 0 14 7 7 0 0 0 0-14m0 2.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5M10 8.25a.5.5 0 0 1 .5.41v4.75a.5.5 0 0 1-1 .09v-4.75c0-.28.22-.5.5-.5",
  send: "M3.2 9.2 16.8 3.4c.5-.2 1 .3.8.8l-4.2 13.2c-.2.5-.8.6-1.1.1l-2.6-4.2-4.2-2.6c-.5-.3-.4-.9.1-1.1z",
  attach: "M7.5 4.5A2.5 2.5 0 0 1 10 2a2.5 2.5 0 0 1 2.5 2.5v9a3.5 3.5 0 1 1-7 0V8a.5.5 0 0 1 1 0v5.5a2.5 2.5 0 0 0 5 0v-9A1.5 1.5 0 0 0 10 3a1.5 1.5 0 0 0-1.5 1.5v8.75a.75.75 0 0 0 1.5 0V8a.5.5 0 0 1 1 0v5.25a1.75 1.75 0 0 1-3.5 0V4.5Z",
  close: "M5.2 4.2 10 9l4.8-4.8 1 1L11 10l4.8 4.8-1 1L10 11l-4.8 4.8-1-1L9 10 4.2 5.2l1-1z",
  check: "M7.6 13.2 4.4 10l1.1-1.1 2.1 2.1 5.9-5.9 1.1 1.1-7 7z",
  calendar: "M6.5 2.5a.5.5 0 0 1 .5.5V4h6V3a.5.5 0 0 1 1 0v1h1A1.5 1.5 0 0 1 16.5 5.5v11a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3.5 16.5v-11A1.5 1.5 0 0 1 5 4h1V3a.5.5 0 0 1 .5-.5zM5 5a.5.5 0 0 0-.5.5V7h11V5.5A.5.5 0 0 0 15 5H5zm10.5 3h-11v8a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5V8zM6.5 10h2v1.5h-2V10zm3.25 0h2v1.5h-2V10z",
  memory: "M6 2.5h8A1.5 1.5 0 0 1 15.5 4v13.1a.5.5 0 0 1-.78.42L10 14.6l-4.72 2.92a.5.5 0 0 1-.78-.42V4A1.5 1.5 0 0 1 6 2.5m0 1a.5.5 0 0 0-.5.5v12.2l4.24-2.62a.5.5 0 0 1 .52 0l4.24 2.62V4a.5.5 0 0 0-.5-.5z",
};

export function mount(root: HTMLElement): void {
  const selected = new Set<string>();
  let settings = loadSettings();
  applyUiFont(settings.uiFontSize);
  let busy = false;
  let banner: Banner | null = null;
  let models: string[] = [];
  const thread: ChatRow[] = [];
  let conversationId = "";
  let freshConversation = false;
  let shownKey = "";
  let threadSync: Promise<void> | null = null;
  let threadBanner = false;
  const threadDrafts = new Map<string, Parked<FileSource>>();
  const unsavedKept = new Map<string, CommittedFile[]>();
  let filesFor = "";
  let remoteWarned = false;
  let turnAbort: AbortController | null = null;
  let pending: FileSource[] = [];
  let mailJobs: FileSource[] = [];
  let committed: CommittedFile[] = [];
  let memory: Memory = { notes: [], people: [] };
  let parties: Party[] = [];
  let mailHeader: Parameters<typeof renderMailHeader>[0] = null;
  let openFileList: "pending" | "kept" | "mail" | null = null;
  let mailGuide = false;
  let mailNotice = "";
  const fileAborts = new Map<string, AbortController>();
  let fileSerial = 0;

  root.innerHTML = "";
  root.append(el("style", css()));
  const app = el("div");
  app.className = "app";
  const header = el("header");
  header.className = "header";
  const meter = el("div");
  meter.className = "meter";
  meter.title = "この会話を送るときの目安です。";
  const meterCount = el("span");
  meterCount.className = "meter-count";
  const meterWarn = el("span", "上限に近いので、新しい会話に切り替えてください。");
  meterWarn.className = "meter-warn";
  meterWarn.hidden = true;
  meter.append(meterCount, meterWarn);
  const actions = el("div");
  actions.className = "actions";
  const missing = el("span", "未設定");
  missing.className = "missing";
  const historyBtn = iconButton("会話の履歴", ICONS.history, "前の会話に戻ります");
  const memoryBtn = iconButton("コンテキスト", ICONS.memory, "LLMに渡す文脈（コンテキスト）を設定します。");
  const connectBtn = iconButton("接続", ICONS.plug, "接続先を確認します");
  const scheduleBtn = iconButton("日程調整", ICONS.calendar, "空きを探す曜日、時間、日数を決めます");
  const settingsBtn = iconButton("設定", ICONS.settings, "文字サイズや書体、待ち時間を変えます");
  const infoBtn = iconButton(aboutCopy.buttonLabel, ICONS.info, "できることの説明を開きます");
  actions.append(historyBtn, memoryBtn, missing, connectBtn, scheduleBtn, settingsBtn, infoBtn);
  header.append(meter, actions);

  const bannerHost = el("div");
  const chat = el("div");
  chat.className = "chat";
  const composer = buildComposer();
  app.append(header, bannerHost, chat, composer.box);
  root.append(app);

  const dialog = buildDialog(root);
  historyBtn.addEventListener("click", () => void openHistory());
  memoryBtn.addEventListener("click", () => openMemory());
  connectBtn.addEventListener("click", () => void openConnection());
  scheduleBtn.addEventListener("click", () => openSchedule());
  settingsBtn.addEventListener("click", () => openSettings());
  infoBtn.addEventListener("click", () => openInfo());
  composer.send.addEventListener("click", () => void send());
  for (const shortcut of composer.shortcuts) {
    shortcut.button.addEventListener("click", () => void sendShortcut(shortcut.id));
  }
  composer.input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    void send();
  });
  composer.input.addEventListener("input", () => {
    fit(composer.input);
    composer.send.disabled = !canSend();
    refreshMeter();
  });
  function refuseBusyAttach(): boolean {
    if (!busy) return false;
    banner = { kind: "error", text: "応答中はファイルを添付できません。" };
    paint();
    return true;
  }
  composer.attach.addEventListener("click", () => {
    if (refuseBusyAttach()) return;
    composer.picker.click();
  });
  composer.picker.addEventListener("change", () => {
    const picked = Array.from(composer.picker.files || []);
    composer.picker.value = "";
    addFiles(picked);
  });
  let fileDragDepth = 0;
  function fileDrag(data: DataTransfer | null): boolean {
    return Boolean(data && Array.from(data.types).includes("Files"));
  }
  function overComposer(target: EventTarget | null): boolean {
    return target instanceof Node && composer.box.contains(target);
  }
  function markFileDrag(on: boolean): void {
    composer.box.classList.toggle("dropping", on);
  }
  document.addEventListener("dragenter", (event) => {
    if (!fileDrag(event.dataTransfer) || !overComposer(event.target)) return;
    fileDragDepth += 1;
    markFileDrag(true);
  }, true);
  document.addEventListener("dragleave", (event) => {
    if (fileDragDepth === 0 || !overComposer(event.target)) return;
    fileDragDepth -= 1;
    if (fileDragDepth === 0) markFileDrag(false);
  }, true);
  document.addEventListener("dragover", (event) => {
    if (!fileDrag(event.dataTransfer)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }, true);
  document.addEventListener("drop", (event) => {
    if (!fileDrag(event.dataTransfer)) return;
    event.preventDefault();
    fileDragDepth = 0;
    markFileDrag(false);
    if (!overComposer(event.target)) return;
    if (refuseBusyAttach()) return;
    const picked = Array.from(event.dataTransfer?.files || []);
    if (picked.length) addFiles(picked);
  }, true);
  document.addEventListener("dragend", () => {
    fileDragDepth = 0;
    markFileDrag(false);
  }, true);
  document.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (!(target instanceof Node) || composer.badges.contains(target) || composer.mailBadges.contains(target)) return;
    if (!openFileList) return;
    openFileList = null;
    paintBadges();
  });
  composer.argos.addEventListener("click", () => void openArgos());

  paint();
  void start();

  async function start(): Promise<void> {
    try {
      const result = await adoptStoredConnection(connectionFields(settings));
      settings = takeAdoptedSettings(settings, result);
      if (result.kind === "ready") saveSettings(settings);
    } catch {
      // ファイルを読めない起動では、今の localStorage を残す。
    }
    paint();
    void fetchMemory()
      .then((loaded) => {
        memory = loaded;
        paint();
      })
      .catch(() => {});
    void runHealth();
    void syncThread();
    setInterval(() => syncThread(), 1000);
  }

  function paint(): void {
    missing.hidden = Boolean(settings.llmBaseUrl.trim() && settings.llmApiKey.trim());
    bannerHost.textContent = "";
    if (banner) bannerHost.append(bannerView(banner, () => { banner = null; paint(); }));
    chat.textContent = "";
    if (!thread.length) {
      const empty = el("div");
      empty.className = "empty";
      empty.append(
        el("p", "開いているメールについて、やりたいことをそのまま書いてください。"),
        el("p", "例:「返信の下書きを書いて」「この文面を短くして」「関連する契約を索引から探して」")
      );
      chat.append(empty);
    } else {
      const names = toolNames(thread);
      for (const message of thread) {
        const node = renderRow(message, names);
        if (node) chat.append(node);
      }
      chat.scrollTop = chat.scrollHeight;
    }
    composer.argos.hidden = !settings.argosBaseUrl.trim();
    const reading = pending.some(isPending) || mailJobs.some(isPending);
    paintBadges();
    for (const shortcut of composer.shortcuts) shortcut.button.disabled = busy || reading;
    composer.send.disabled = !canSend();
    composer.attach.disabled = busy;
    composer.stop.hidden = !busy;
    composer.input.disabled = busy;
    refreshMeter();
  }

  function canSend(): boolean {
    return !busy && !pending.some(isPending) && !mailJobs.some(isPending) && Boolean(composer.input.value.trim());
  }

  function rememberMail(): void {
    parties = readParties();
    mailHeader = readMailHeader();
  }

  function refreshMeter(): void {
    const readyPending = pending.filter(isReady).map(commit);
    const tokens = countOutgoingTokens({
      history: thread.map((row) => ({
        role: row.role,
        content: row.content,
        tool_calls: row.toolCalls,
        tool_call_id: row.toolCallId,
      })),
      instruction: composer.input.value,
      files: mergeFiles(committed, readyPending),
      contextLimit: settings.contextLimit,
      searxng: Boolean(settings.searxngUrl.trim()),
      argos: Boolean(settings.argosBaseUrl.trim()),
      memory: renderMemorySection(memory, parties),
      mail: renderMailHeader(mailHeader),
    });
    const warn = settings.contextLimit > 0 && tokens / settings.contextLimit >= 0.8;
    meterCount.textContent = `${tokens.toLocaleString("ja-JP")} / ${settings.contextLimit.toLocaleString("ja-JP")}`;
    meterCount.className = warn ? "meter-count warn" : "meter-count";
    meterWarn.hidden = !warn;
  }

  async function runHealth(): Promise<void> {
    if (!settings.llmBaseUrl.trim() || !settings.llmApiKey.trim()) {
      banner = { kind: "warning", text: "接続の URL と API キーを入れてください。" };
      paint();
      return;
    }
    try {
      const result = await checkHealth(settings);
      models = result.llm?.models ?? [];
      if (models.length && !models.includes(settings.model)) {
        settings = { ...settings, model: models[0] };
        saveSettings(settings);
      }
      if (!result.llm?.ok) {
        banner = { kind: "error", text: result.llm?.error || "MTPLX に接続できませんでした。" };
      } else {
        const searx = !settings.searxngUrl.trim()
          ? " SearXNG URL が空のためウェブ検索は使えません。"
          : result.searxng?.ok
            ? " SearXNG も応答しました。"
            : ` SearXNG: ${result.searxng?.error || "失敗"}`;
        const argos = !settings.argosBaseUrl.trim()
          ? " Argos URL が空のため索引検索は使えません。"
          : result.argos?.ok
            ? " Argos も応答しました。"
            : ` Argos: ${result.argos?.error || "失敗"}`;
        const warning = Boolean(settings.searxngUrl.trim() && !result.searxng?.ok) || Boolean(settings.argosBaseUrl.trim() && !result.argos?.ok);
        banner = { kind: warning ? "warning" : "success", text: `MTPLX に接続できました。${searx}${argos}` };
      }
    } catch (error) {
      banner = { kind: "error", text: error instanceof Error ? error.message : "接続確認に失敗しました。" };
    }
    paint();
  }

  async function send(): Promise<void> {
    const instruction = composer.input.value.trim();
    if (!canSend()) return;
    await deliver(instruction);
  }

  async function sendShortcut(id: ReplyShortcutId): Promise<void> {
    if (busy || pending.some(isPending) || mailJobs.some(isPending)) return;
    const blocked = openMessageError();
    if (blocked) {
      banner = { kind: "error", text: blocked };
      paint();
      return;
    }
    let instruction = shortcutInstruction(id);
    if (id === "schedule") {
      busy = true;
      paint();
      try {
        instruction = shortcutInstruction(id, await collectFreeSlots(settings));
      } catch (error) {
        banner = { kind: "error", text: error instanceof Error ? error.message : "予定表を読めません。" };
        return;
      } finally {
        busy = false;
        paint();
      }
    }
    await deliver(instruction);
  }

  async function deliver(instruction: string): Promise<void> {
    if (!instruction || busy || pending.some(isPending) || mailJobs.some(isPending)) return;
    const prefixes = searchPrefixes([...selected]);
    if (!prefixes.ok) {
      banner = { kind: "error", text: prefixes.error };
      paint();
      return;
    }
    const pathPrefixes = prefixes.pathPrefixes;
    if (composer.input.value.trim() === instruction) {
      composer.input.value = "";
      fit(composer.input);
    }
    busy = true;
    turnAbort = new AbortController();
    paint();
    try {
      const wasFresh = freshConversation;
      const conversation =
        conversationId && !freshConversation
          ? { id: conversationId }
          : await ensureConversation(conversationKey(), freshConversation);
      freshConversation = false;
      conversationId = conversation.id;
      if (!wasFresh && filesFor !== conversation.id) {
        const loaded = await loadConversation(conversation.id);
        committed = mergeFiles(loaded.files, committed);
      }
      filesFor = conversation.id;
      committed = mergeFiles(committed, pending.filter(isReady).map(commit));
      pending = pending.filter((row) => row.status !== "ready");
      committed = await saveConversationFiles(conversation.id, committed);
      const hasFiles = committed.length > 0;
      rememberMail();
      const memoryText = renderMemorySection(memory, parties);
      const mailText = renderMailHeader(mailHeader);
      const reserved = systemPrompt({
        files: hasFiles,
        searxng: Boolean(settings.searxngUrl.trim()),
        argos: Boolean(settings.argosBaseUrl.trim()),
        memory: memoryText,
        mail: mailText,
      }).length + instruction.length;
      const forModel = modelTurnText(instruction, committed, settings.contextLimit, reserved);
      const forHistory = historyTurnText(instruction, committed, settings.contextLimit, reserved);
      thread.push({ role: "user", content: forHistory });
      paint();
      await storeMessage(conversation.id, { role: "user", content: forHistory });
      const history = await loadMessages(conversation.id);
      const prior = history.slice(0, -1);
      await runTurn({
        settings,
        history: prior,
        instruction: forModel,
        hasFiles,
        memory: memoryText,
        mail: mailText,
        pathPrefixes,
        signal: turnAbort.signal,
        onDelta: (snapshot) => {
          const draft = thread.find((row) => row.streaming);
          if (draft) {
            draft.content = snapshot.content;
            draft.reasoningContent = snapshot.reasoningContent;
          } else {
            thread.push({ role: "assistant", content: snapshot.content, reasoningContent: snapshot.reasoningContent, streaming: true });
          }
          paint();
        },
        onMessage: (message) => {
          const draft = thread.findIndex((row) => row.streaming);
          if (draft >= 0) thread.splice(draft, 1);
          thread.push({
            role: message.role,
            content: message.content,
            reasoningContent: message.reasoningContent,
            toolCalls: message.tool_calls,
            toolCallId: message.tool_call_id,
          });
          void storeMessage(conversation.id, {
            role: message.role,
            content: message.content,
            reasoningContent: message.reasoningContent,
            toolCalls: message.tool_calls,
            toolCallId: message.tool_call_id,
          });
          paint();
        },
      });
      banner = null;
    } catch (error) {
      const draft = thread.findIndex((row) => row.streaming);
      if (draft >= 0) thread.splice(draft, 1);
      const aborted = error instanceof DOMException && error.name === "AbortError";
      banner = aborted ? null : { kind: "error", text: error instanceof Error ? error.message : "失敗しました。" };
    } finally {
      busy = false;
      turnAbort = null;
      paint();
    }
  }

  function openMessageError(): string | null {
    try {
      const mode = currentHostMode();
      if (mode === "read" || mode === "compose") return null;
      if (mode === "none") return "メールが選択されていません。";
      return "予定は本文を書きません。";
    } catch (error) {
      return error instanceof Error ? error.message : "メールが選択されていません。";
    }
  }

  function leadChecks(): HTMLElement {
    const row = el("div");
    row.className = "choices";
    const options: Array<{ key: "slotFromTomorrow" | "slotFromDayAfter"; label: string }> = [
      { key: "slotFromTomorrow", label: "翌営業日以降" },
      { key: "slotFromDayAfter", label: "翌々営業日以降" },
    ];
    for (const option of options) {
      const label = el("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = settings[option.key];
      input.addEventListener("change", () => {
        settings = { ...settings, [option.key]: input.checked };
        saveSettings(settings);
      });
      label.append(input, el("span", option.label));
      row.append(label);
    }
    return row;
  }

  function weekdayChecks(): HTMLElement {
    const row = el("div");
    row.className = "choices";
    const order = [1, 2, 3, 4, 5, 6, 0];
    const names = ["月", "火", "水", "木", "金", "土", "日"];
    order.forEach((day, index) => {
      const label = el("label");
      label.className = "choice";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = settings.excludedWeekdays.includes(day);
      input.addEventListener("change", () => {
        const next = new Set(settings.excludedWeekdays);
        if (input.checked) next.add(day);
        else next.delete(day);
        settings = { ...settings, excludedWeekdays: [...next].sort((a, b) => a - b) };
        saveSettings(settings);
      });
      label.append(input, el("span", names[index]));
      row.append(label);
    });
    return row;
  }

  function horizonField(): HTMLInputElement {
    const input = numberField(String(settings.slotHorizonDays), (n) => {
      const days = Math.min(MAX_HORIZON_DAYS, Math.max(MIN_HORIZON_DAYS, n));
      input.value = String(days);
      settings = { ...settings, slotHorizonDays: days };
      saveSettings(settings);
    });
    return input;
  }

  function hourFields(): HTMLElement {
    const row = el("div");
    row.className = "pair";
    const start = document.createElement("input");
    start.type = "time";
    start.value = settings.slotDayStart;
    const end = document.createElement("input");
    end.type = "time";
    end.value = settings.slotDayEnd;
    const commit = () => {
      if (!start.value || !end.value || start.value >= end.value) return;
      settings = { ...settings, slotDayStart: start.value, slotDayEnd: end.value };
      saveSettings(settings);
    };
    start.addEventListener("change", commit);
    end.addEventListener("change", commit);
    row.append(start, end);
    return row;
  }

  function calendarSourceFields(): HTMLElement {
    const box = el("div");
    box.className = "stack";
    const outlook = document.createElement("input");
    outlook.type = "checkbox";
    outlook.checked = settings.calendarOutlook;
    outlook.addEventListener("change", () => {
      settings = { ...settings, calendarOutlook: outlook.checked };
      saveSettings(settings);
    });
    const google = document.createElement("input");
    google.type = "checkbox";
    google.checked = settings.calendarGoogle;
    const url = document.createElement("input");
    url.type = "text";
    url.value = settings.googleIcalUrl;
    url.placeholder = "https://calendar.google.com/calendar/ical/…/basic.ics";
    url.spellcheck = false;
    const urlWrap = el("label");
    urlWrap.append(el("span", "非公開 iCal URL"), url);
    const syncUrl = () => {
      url.disabled = !google.checked;
      urlWrap.hidden = !google.checked;
    };
    google.addEventListener("change", () => {
      settings = { ...settings, calendarGoogle: google.checked };
      saveSettings(settings);
      syncUrl();
      if (google.checked) url.focus();
    });
    url.addEventListener("change", () => {
      settings = { ...settings, googleIcalUrl: url.value.trim() };
      url.value = settings.googleIcalUrl;
      saveSettings(settings);
    });
    syncUrl();
    const checks = el("div");
    checks.className = "choices";
    const outlookLabel = el("label");
    outlookLabel.className = "choice";
    outlookLabel.append(outlook, el("span", "Outlook"));
    const googleLabel = el("label");
    googleLabel.className = "choice";
    googleLabel.append(google, el("span", "Google カレンダー"));
    checks.append(outlookLabel, googleLabel);
    box.append(checks, urlWrap);
    return labeled(
      "読み込む予定",
      "オンにした予定を合わせて空きを見ます。どちらもオフのときは予定を読まず、対応時間だけで候補を出します。URL には秘密のトークンが含まれ、この端末の設定にだけ保存します。",
      box
    );
  }

  function openSchedule(): void {
    const stack = el("div");
    stack.className = "stack";
    stack.append(
      calendarSourceFields(),
      note("日程調整で使う曜日、対応時間、枠の長さ、探す日数です。"),
      labeled(
        "候補の開始",
        "翌営業日以降は、空き枠にしたくない曜日を除いた次の日から探します。翌々営業日以降は、その次の営業日から探します。",
        leadChecks()
      ),
      labeled(
        "空き枠にしたくない曜日",
        "チェックした曜日は候補にしません。",
        weekdayChecks()
      ),
      labeled(
        "対応時間",
        "開始が終了以降のときは保存しません。既定は 9:00–18:00。",
        hourFields()
      ),
      labeled(
        "枠の刻み",
        "候補1件の長さです。探索の刻みも同じです。",
        choices(
          "slot-minutes",
          SLOT_MINUTES.map((minutes) => ({ value: String(minutes), label: `${minutes}分` })),
          String(settings.slotMinutes),
          (value) => {
            settings = { ...settings, slotMinutes: Number(value) as Settings["slotMinutes"] };
            saveSettings(settings);
          }
        )
      ),
      labeled(
        "枠候補の最大件数",
        "1から10まで。既定は3。",
        numberField(String(settings.maxSlots), (n) => {
          settings = { ...settings, maxSlots: Math.min(10, Math.max(1, n)) };
          saveSettings(settings);
        })
      ),
      labeled(
        "探す日数",
        "今日から数えて何日先まで空きを探すか。7から60まで。既定は14。",
        horizonField()
      ),
      labeled(
        "クールダウン",
        "予定の前後を塞ぎます。対応時間の端では足しません。",
        choices(
          "slot-cooldown",
          COOLDOWN_MINUTES.map((minutes) => ({ value: String(minutes), label: minutes === 0 ? "なし" : `${minutes}分` })),
          String(settings.cooldownMinutes),
          (value) => {
            settings = { ...settings, cooldownMinutes: Number(value) as Settings["cooldownMinutes"] };
            saveSettings(settings);
          }
        )
      )
    );
    dialog.open("日程調整", stack);
  }

  async function openConnection(): Promise<void> {
    try {
      const result = await fetchConnection();
      if (result.kind === "ready") {
        settings = takeAdoptedSettings(settings, result);
        saveSettings(settings);
      }
    } catch {
      // 欄は今の画面の値で開く。
    }
    dialog.open("接続", connectionForm());
  }

  function openMemory(): void {
    rememberMail();
    const stack = el("div");
    stack.className = "stack";
    const failure = note("");
    failure.hidden = true;
    const showError = (text: string) => {
      failure.textContent = text;
      failure.hidden = !text;
    };
    const caught = (error: unknown) => showError(error instanceof Error ? error.message : "保存できませんでした。");
    const seen = new Set<string>();
    const here: Party[] = [];
    for (const party of parties) {
      if (seen.has(party.address)) continue;
      seen.add(party.address);
      here.push(party);
    }
    const noteRows: Array<{ id: string; input: HTMLInputElement }> = [];
    const notesHost = el("div");
    notesHost.className = "stack";
    let notesStatus = note("");

    const fillNotes = () => {
      notesHost.textContent = "";
      noteRows.length = 0;
      for (const row of memory.notes) notesHost.append(noteRow(row.id, row.text));
      const actions = el("div");
      actions.className = "memory-actions";
      const add = textButton("行を足す", "chip", () => {
        notesStatus.hidden = true;
        notesHost.insertBefore(noteRow("", ""), actions);
      });
      const save = textButton("保存", "primary", () => void saveNoteList(save).catch(caught));
      notesStatus = note("");
      notesStatus.className = "note ok";
      notesStatus.hidden = true;
      actions.append(add, save, notesStatus);
      notesHost.append(actions);
    };

    function noteRow(id: string, text: string): HTMLElement {
      const line = el("div");
      line.className = "memory-line";
      const input = document.createElement("input");
      input.type = "text";
      input.value = text;
      const entry = { id, input };
      noteRows.push(entry);
      const remove = textButton("削除", "chip", () => {
        notesStatus.hidden = true;
        const index = noteRows.indexOf(entry);
        if (index >= 0) noteRows.splice(index, 1);
        line.remove();
      });
      input.addEventListener("input", () => {
        notesStatus.hidden = true;
      });
      line.append(input, remove);
      return line;
    }

    async function saveNoteList(save: HTMLButtonElement): Promise<void> {
      save.disabled = true;
      try {
        const notes = await saveNotes(noteRows.map((row) => ({ id: row.id, text: row.input.value })));
        memory = { ...memory, notes };
        showError("");
        fillNotes();
        notesStatus.textContent = "保存しました。";
        notesStatus.hidden = false;
        refreshMeter();
      } finally {
        save.disabled = false;
      }
    }

    function personCard(name: string, address: string, text: string): HTMLElement {
      const card = el("div");
      card.className = "stack";
      const title = el("p", name ? `${name}（${address}）` : address);
      title.className = "note";
      const area = document.createElement("textarea");
      area.className = "memory-text";
      area.value = text;
      const actions = el("div");
      actions.className = "memory-actions";
      const status = note("");
      status.className = "note ok";
      status.hidden = true;
      const save = textButton("保存", "primary", () => void storePerson(address, name, area, save, status).catch(caught));
      actions.append(
        save,
        textButton("削除", "chip", () => void deleteOne(address, area, status).catch(caught)),
        status
      );
      area.addEventListener("input", () => {
        status.hidden = true;
      });
      card.append(title, area, actions);
      return card;
    }

    async function storePerson(address: string, name: string, area: HTMLTextAreaElement, save: HTMLButtonElement, status: HTMLElement): Promise<void> {
      save.disabled = true;
      try {
        const stored = memory.people.find((person) => person.address === address);
        const saved = await savePerson(address, { name: name || stored?.name || "", text: area.value });
        memory = {
          notes: memory.notes,
          people: [saved, ...memory.people.filter((person) => person.address !== saved.address)],
        };
        if (area.value !== saved.text) area.value = saved.text;
        showError("");
        status.textContent = "保存しました。";
        status.hidden = false;
        refreshMeter();
      } finally {
        save.disabled = false;
      }
    }

    async function deleteOne(address: string, area: HTMLTextAreaElement, status: HTMLElement): Promise<void> {
      await removePerson(address);
      memory = { notes: memory.notes, people: memory.people.filter((person) => person.address !== address) };
      area.value = "";
      showError("");
      status.textContent = "削除しました。";
      status.hidden = false;
      refreshMeter();
    }

    stack.append(failure);
    fillNotes();
    stack.append(aboutHeading("共通コンテキスト"), notesHost, aboutHeading("このメールの相手方とのコンテキスト"));
    if (!here.length) {
      stack.append(note("開いているメールに相手がいません。"));
    }
    for (const party of here) {
      const stored = memory.people.find((person) => person.address === party.address);
      stack.append(personCard(party.name || stored?.name || "", party.address, stored?.text ?? ""));
    }
    dialog.open("コンテキスト", stack);
  }

  function openSettings(): void {
    const stack = el("div");
    stack.className = "stack";
    stack.append(
      labeled(
        "画面の文字サイズ",
        "この画面の文字です。メールへ書き戻す大きさとは別です。",
        choices(
          "ui-font",
          [
            { value: "small", label: "小" },
            { value: "medium", label: "標準" },
            { value: "large", label: "大" },
          ],
          settings.uiFontSize,
          (value) => {
            settings = { ...settings, uiFontSize: value };
            saveSettings(settings);
            applyUiFont(settings.uiFontSize);
            fit(composer.input);
          }
        )
      ),
      mailReadField(),
      labeled("書き戻す書体", "前文だけに付きます。署名と引用はそのままです。既定は 10.5pt の游ゴシック。", mailFontSelect()),
      labeled("書き戻す大きさ（pt）", "8から36まで、0.5刻み。", mailFontSizeInput()),
      field("タイムアウト（秒）", String(Math.round(settings.timeoutMs / 1000)), "number", (value) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        settings = { ...settings, timeoutMs: clampTimeoutMs(seconds * 1000) };
        saveSettings(settings);
      }),
      note(`1回の応答待ち。長い契約書は ${Math.round(MAX_TIMEOUT_MS / 1000)} 秒まで延ばせます。`),
      labeled(
        "思考レベル",
        "既定は中。オフは推奨しません（ツール呼び出しが不安定になります）。",
        choices(
          "thinking-level",
          THINKING_LEVELS.map((level) => ({ value: level, label: THINKING_LEVEL_LABELS[level] })),
          settings.thinkingLevel,
          (value) => {
            settings = { ...settings, thinkingLevel: value };
            saveSettings(settings);
          }
        )
      ),
      labeled(
        "ツール往復の上限",
        "1回の指示あたり。コメントが多い点検は32か制限なし。上限に達するとチャットに知らせます。止まらなければキャンセルしてください。",
        choices(
          "tool-rounds",
          TOOL_ROUND_PRESETS.map((rounds) => ({ value: String(rounds), label: toolRoundPresetLabel(rounds) })),
          String(settings.maxToolRounds),
          (value) => {
            settings = { ...settings, maxToolRounds: Number(value) };
            saveSettings(settings);
          }
        )
      )
    );
    const pair = el("div");
    pair.className = "pair";
    pair.append(
      labeled(
        "思考トークン予算",
        "長考を抑えます。",
        numberField(String(settings.thinkingBudget), (n) => {
          settings = { ...settings, thinkingBudget: n };
          saveSettings(settings);
        })
      ),
      labeled(
        "コンテキスト上限",
        "トークン。超える分は古い順に落とします。",
        numberField(String(settings.contextLimit), (n) => {
          settings = { ...settings, contextLimit: n };
          saveSettings(settings);
          refreshMeter();
        })
      )
    );
    stack.append(pair);
    dialog.open("設定", stack);
  }

  function mailReadField(): HTMLElement {
    const wrap = el("div");
    wrap.className = "field";
    const choice = el("label");
    choice.className = "choice";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settings.readMailAttachments;
    input.addEventListener("change", () => {
      settings = { ...settings, readMailAttachments: input.checked };
      saveSettings(settings);
      refreshMailAttachments();
    });
    choice.append(input, el("span", "メール添付ファイルを読む"));
    wrap.append(choice, note("オンのとき、開いているメールに添付があれば自動で読みます。"));
    return wrap;
  }

  function mailFontSelect(): HTMLSelectElement {
    const select = document.createElement("select");
    for (const row of MAIL_FONTS) {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.label;
      select.append(option);
    }
    select.value = settings.mailFontId;
    select.addEventListener("change", () => {
      settings = { ...settings, mailFontId: normalizeMailFontId(select.value) };
      saveSettings(settings);
    });
    return select;
  }

  function mailFontSizeInput(): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "number";
    input.min = String(MAIL_FONT_SIZE_MIN);
    input.max = String(MAIL_FONT_SIZE_MAX);
    input.step = String(MAIL_FONT_SIZE_STEP);
    input.value = String(settings.mailFontSizePt);
    input.addEventListener("change", () => {
      const pt = mailFontSizeFromInput(input.value);
      if (pt === null) {
        input.value = String(settings.mailFontSizePt);
        return;
      }
      settings = { ...settings, mailFontSizePt: pt };
      saveSettings(settings);
    });
    return input;
  }

  function openInfo(): void {
    const stack = el("div");
    stack.className = "stack";
    stack.append(aboutHeading("概要"));
    for (const paragraph of aboutCopy.overview) stack.append(note(paragraph));
    stack.append(aboutHeading("機能"));
    for (const feature of aboutCopy.features) {
      const item = el("div");
      item.className = "about-item";
      const title = el("p", feature.title);
      title.className = "about-item-title";
      item.append(title, note(feature.body));
      stack.append(item);
    }
    stack.append(aboutHeading("ライセンス"));
    stack.append(note(aboutCopy.licenseNote));
    for (const row of aboutCopy.licenses) {
      stack.append(note(`${row.name} — ${row.license} — ${row.copyright}`));
      if (row.choice) stack.append(note(row.choice));
    }
    stack.append(aboutHeading("開発"));
    stack.append(note(aboutCopy.credit));
    dialog.open(aboutCopy.title, stack);
  }

  function connectionForm(): HTMLElement {
    const stack = el("div");
    stack.className = "stack";
    const fields: Array<[TextSetting, string, string]> = [
      ["llmBaseUrl", "MTPLX Base URL", "http://192.168.x.x:8000/v1"],
      ["llmApiKey", "APIキー", "mtplx の API キー"],
      ["model", "モデル", ""],
      ["searxngUrl", "SearXNG URL", "http://192.168.x.x:8080"],
      ["argosBaseUrl", "Argos URL", DEFAULT_ARGOS_BASE_URL],
      ["argosApiKey", "Argos API キー", "任意"],
    ];
    const inputs = new Map<TextSetting, HTMLInputElement>();
    for (const [name, label, placeholder] of fields) {
      const input = document.createElement("input");
      input.value = settings[name];
      input.placeholder = placeholder;
      if (name.toLowerCase().includes("key")) input.type = "password";
      inputs.set(name, input);
      const wrap = el("label");
      wrap.append(el("span", label), input);
      stack.append(wrap);
      if (name === "model" && models.length) {
        const row = el("div");
        row.className = "chips";
        const paintChips = () => {
          row.textContent = "";
          for (const id of models) {
            const chip = el("button", id);
            chip.type = "button";
            chip.className = id === input.value ? "chip on" : "chip";
            chip.addEventListener("click", () => {
              input.value = id;
              paintChips();
            });
            row.append(chip);
          }
        };
        paintChips();
        stack.append(row);
      }
    }
    const failure = note("");
    failure.hidden = true;
    const save = el("button", "保存して接続確認");
    save.type = "button";
    save.className = "primary";
    save.addEventListener("click", () => {
      const next = { ...settings };
      for (const [name, input] of inputs) next[name] = input.value;
      failure.hidden = true;
      save.disabled = true;
      void saveStoredConnection(connectionFields(next))
        .then(() => {
          settings = takeAdoptedSettings(next, { kind: "ready", ...connectionFields(next) });
          saveSettings(settings);
          dialog.close();
          void runHealth();
        })
        .catch((error: unknown) => {
          failure.hidden = false;
          failure.textContent = error instanceof Error ? error.message : "接続を保存できません。";
          save.disabled = false;
        });
    });
    stack.append(failure, save);
    return stack;
  }


  async function openArgos(): Promise<void> {
    const stack = el("div");
    stack.className = "stack";
    const filter = document.createElement("input");
    filter.placeholder = "フォルダ名で絞り込み…";
    filter.setAttribute("aria-label", "フォルダ名で絞り込み");
    const error = note("");
    error.hidden = true;
    const list = el("div");
    list.className = "scope-list";
    const footer = el("div");
    footer.className = "scope-foot";
    const footLabel = el("span", "索引全体");
    footLabel.className = "foot-label";
    const apply = el("button", "適用");
    apply.type = "button";
    apply.className = "primary";
    footer.append(footLabel, apply);
    stack.append(filter, error, list, footer);
    dialog.open("LexCrew に参照させるフォルダを選択してください。", stack);

    let recent: ArgosScopeRow[] = [];
    let scopes: ArgosScopeRow[] = [];
    let draft = [...selected];
    const paintList = () => {
      const roots = scopes.filter((row) => row.isRoot);
      const query = filter.value;
      list.textContent = "";
      list.append(scopeChoice("全体", "索引全体", draft.length === 0, false, () => {
        draft = [];
        paintList();
      }));
      for (const row of recent.filter((item) => matchesArgosFilter(item, query, item.label))) {
        list.append(scopeChoice("直近", row.label || argosScopeChipLabel(row.path), draft.some((item) => sameArgosPath(item, row.path)), false, () => toggleScope(row.path)));
      }
      for (const row of scopes.filter((item) => matchesArgosFilter(item, query, argosFolderListLabel(item, roots)))) {
        const label = argosFolderListLabel(row, roots);
        list.append(scopeChoice(row.isRoot ? "ルート" : "", label, draft.some((item) => sameArgosPath(item, row.path)), !row.isRoot, () => toggleScope(row.path)));
      }
      footLabel.textContent = scopeFootLabel(draft, [...recent, ...scopes]);
    };
    const toggleScope = (path: string) => {
      const next = draft.some((item) => sameArgosPath(item, path))
        ? draft.filter((item) => !sameArgosPath(item, path))
        : collapseArgosScopes([...draft, path]);
      const gate = searchPrefixes(next);
      error.hidden = gate.ok;
      error.textContent = gate.ok ? "" : gate.error;
      if (gate.ok) draft = next;
      paintList();
    };
    apply.addEventListener("click", () => {
      const gate = searchPrefixes(draft);
      if (!gate.ok) {
        error.hidden = false;
        error.textContent = gate.error;
        return;
      }
      selected.clear();
      for (const path of draft) selected.add(path);
      composer.argos.textContent = argosButtonLabel([...selected].join("\n"));
      dialog.close();
    });
    filter.addEventListener("input", paintList);
    list.append(note("読み込み中…"));
    try {
      const payload = await loadScopes(settings);
      recent = (payload.recent ?? []).filter((row) => row.path).map(asScope);
      scopes = (payload.scopes ?? []).filter((row) => row.path).map(asScope);
      paintList();
    } catch (caught) {
      list.textContent = "";
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : "Argos の範囲を取得できません。";
    }
  }

  async function openHistory(): Promise<void> {
    const stack = el("div");
    stack.className = "stack";
    const newer = el("button", "＋ 新しい会話");
    newer.type = "button";
    newer.className = "primary history-new";
    newer.addEventListener("click", () => {
      dropFiles();
      conversationId = "";
      freshConversation = true;
      filesFor = "";
      thread.splice(0, thread.length);
      dialog.close();
      paint();
    });
    stack.append(newer);
    let threadKey = "";
    try {
      threadKey = openThreadKey();
    } catch {
      threadKey = "";
    }
    try {
      const rows = await listConversations();
      if (!threadKey) {
        if (!rows.length) stack.append(note("履歴はまだありません。"));
        for (const row of rows) stack.append(historyRow(row));
      } else {
        const split = splitHistory(rows, threadKey);
        stack.append(historyHeading("このメール"));
        if (!split.here.length) stack.append(note("このメールの履歴はまだありません。"));
        for (const row of split.here) stack.append(historyRow(row));
        if (split.elsewhere.length) {
          stack.append(historyHeading("ほかのメール"));
          for (const row of split.elsewhere) stack.append(historyRow(row));
        }
      }
    } catch (error) {
      stack.append(note(error instanceof Error ? error.message : "履歴を読めません。"));
    }
    dialog.open("会話の履歴", stack);

    function historyHeading(text: string): HTMLElement {
      const heading = el("p", text);
      heading.className = "history-heading";
      return heading;
    }

    function historyRow(row: { id: string; title: string }): HTMLElement {
      const line = el("div");
      line.className = "history-row";
      const button = el("button", row.title || "無題");
      button.type = "button";
      button.className = "history";
      button.addEventListener("click", () => void showConversation(row.id));
      const remove = el("button", "削除");
      remove.type = "button";
      remove.className = "history-delete";
      remove.addEventListener("click", () => {
        void deleteConversation(row.id).then(() => {
          if (conversationId === row.id) {
            dropFiles();
            conversationId = "";
            filesFor = "";
            thread.splice(0, thread.length);
            paint();
          }
          void openHistory();
        });
      });
      line.append(button);
      if (row.id === conversationId) {
        const mark = el("span", "表示中");
        mark.className = "history-current";
        line.append(mark);
      }
      line.append(remove);
      return line;
    }
  }

  async function showConversation(id: string): Promise<void> {
    await restoreConversation(id);
    dialog.close();
    paint();
  }

  async function restoreConversation(id: string): Promise<void> {
    const loaded = await loadConversation(id);
    clearThread();
    conversationId = id;
    freshConversation = false;
    filesFor = id;
    committed = loaded.files;
    thread.splice(0, thread.length, ...loaded.messages.map((message) => ({
      role: message.role,
      content: message.content,
      reasoningContent: message.reasoningContent,
      toolCalls: message.tool_calls,
      toolCallId: message.tool_call_id,
    })));
  }

  function clearThread(): void {
    dropFiles();
    conversationId = "";
    filesFor = "";
    thread.splice(0, thread.length);
  }

  function syncThread(): void {
    if (!outlookReady() || document.visibilityState === "hidden" || threadSync) return;
    let observed = "";
    try {
      observed = openThreadKey();
    } catch {
      return;
    }
    const move = decideThread(shownKey, observed, {
      busy,
      loading: pending.some(isPending) || mailJobs.some(isPending),
    });
    if (move.kind === "stay") {
      if (busy || pending.some(isPending) || mailJobs.some(isPending)) return;
      refreshMailAttachments();
      return;
    }
    threadSync = applyThread(move.key).finally(() => {
      threadSync = null;
    });
  }

  async function applyThread(key: string): Promise<void> {
    const typed = { text: composer.input.value, pending: pending.slice() };
    const carried = !shownKey && !conversationId ? committed.slice() : [];
    if (shownKey) {
      park(threadDrafts, shownKey, typed);
      if (!conversationId && committed.length) unsavedKept.set(shownKey, committed.slice());
      else unsavedKept.delete(shownKey);
    }
    const saved = unpark(threadDrafts, key);
    const tookSaved = Boolean(shownKey || saved.text || saved.pending.length);
    const draft = tookSaved ? saved : { text: typed.text, pending: typed.pending };
    const kept = unsavedKept.get(key) ?? carried;
    unsavedKept.delete(key);
    const putBack = () => {
      if (tookSaved) park(threadDrafts, key, draft);
      if (kept.length) unsavedKept.set(key, kept);
    };
    try {
      const rows = await listConversations(key);
      let current = "";
      try {
        current = openThreadKey();
      } catch {
        current = "";
      }
      if (current !== key) {
        putBack();
        return;
      }
      if (rows[0]) {
        await restoreConversation(rows[0].id);
        if (kept.length) committed = mergeFiles(committed, kept);
      } else {
        clearThread();
        committed = kept;
      }
      freshConversation = false;
      shownKey = key;
      rememberMail();
      composer.input.value = draft.text;
      pending = draft.pending;
      fit(composer.input);
      if (threadBanner) {
        banner = null;
        threadBanner = false;
      }
      paint();
      refreshMailAttachments();
    } catch (error) {
      putBack();
      const text = error instanceof Error ? error.message : "このメールの会話を読めません。";
      if (banner?.text !== text) {
        banner = { kind: "error", text };
        threadBanner = true;
        paint();
      }
    }
  }

  function dropFiles(): void {
    for (const abort of fileAborts.values()) abort.abort();
    fileAborts.clear();
    pending = [];
    mailJobs = [];
    committed = [];
    mailGuide = false;
  }

  function putMail(source: FileSource): void {
    if (!mailJobs.some((row) => row.id === source.id)) {
      return;
    }
    if (source.status === "ready") {
      mailJobs = mailJobs.filter((row) => row.id !== source.id);
      fileAborts.delete(source.id);
      committed = mergeFiles(committed, [{ ...commit(source), via: "mail" }]);
      if (conversationId) {
        void saveConversationFiles(conversationId, committed);
      }
    } else {
      mailJobs = mailJobs.map((row) => (row.id === source.id ? source : row));
    }
    paint();
  }

  function refreshMailAttachments(): void {
    if (!outlookReady() || busy || pending.some(isPending) || mailJobs.some(isPending)) return;
    let listed: { files: { index: number; name: string; size: number }[]; error?: string };
    try {
      listed = listMailFiles();
    } catch (error) {
      publishMailDecision({ kind: "error", text: error instanceof Error ? error.message : "添付を読めません。" });
      return;
    }
    const held = [...committed.filter((file) => file.via === "mail"), ...mailJobs].map((row) => ({
      name: row.name,
      size: row.size,
    }));
    publishMailDecision(planMailAttach(settings.readMailAttachments, listed, held));
  }

  function publishMailDecision(decision: MailAttachPlan): void {
    if (decision.kind === "hint") {
      const cleared = clearMailNotice();
      if (mailGuide && !cleared) return;
      mailGuide = true;
      paint();
      return;
    }
    const guideWasOn = mailGuide;
    mailGuide = false;
    if (decision.kind === "quiet") {
      const cleared = clearMailNotice();
      if (guideWasOn || cleared) paint();
      return;
    }
    if (decision.kind === "error") {
      if (guideWasOn || raiseMailNotice(decision.text)) paint();
      return;
    }
    let started = false;
    let raised = false;
    let blocked = false;
    for (const row of decision.files) {
      const reason = rejectReason({ name: row.name, size: row.size });
      if (reason) {
        blocked = true;
        if (raiseMailNotice(`${row.name}: ${reason}`)) raised = true;
        continue;
      }
      if (tooManyFiles(pending.length + mailJobs.length + committed.length, 1)) {
        blocked = true;
        if (raiseMailNotice(`添付できるのは ${MAX_ATTACHED_FILES} 件までです。`)) raised = true;
        break;
      }
      const base = { id: nextFileId(), name: row.name, size: row.size, mtime: 0 };
      const abort = new AbortController();
      fileAborts.set(base.id, abort);
      mailJobs = [...mailJobs, { ...base, status: "extracting" }];
      void loadMail(base, row.index, abort);
      started = true;
    }
    if (blocked) {
      if (started || raised || guideWasOn) paint();
      return;
    }
    const cleared = clearMailNotice();
    if (started || cleared || guideWasOn) paint();
  }

  function raiseMailNotice(text: string): boolean {
    if (mailNotice === text) return false;
    mailNotice = text;
    banner = { kind: "error", text };
    return true;
  }

  function clearMailNotice(): boolean {
    if (!mailNotice) return false;
    const showing = banner?.text === mailNotice;
    mailNotice = "";
    if (!showing) return false;
    banner = null;
    return true;
  }

  async function loadMail(
    base: { id: string; name: string; size: number; mtime: number },
    index: number,
    abort: AbortController
  ): Promise<void> {
    try {
      const bytes = await readMailFile(index);
      abort.signal.throwIfAborted();
      await ingestBytes({
        name: base.name,
        bytes,
        base,
        settings,
        signal: abort.signal,
        onUpdate: putMail,
        onRemote: () => {
          if (remoteWarned) return;
          remoteWarned = true;
          banner = { kind: "warning", text: REMOTE_OCR_NOTICE };
          paint();
        },
      });
    } catch (error) {
      fileAborts.delete(base.id);
      if (abort.signal.aborted) return;
      putMail({ ...base, status: "error", message: readErrorMessage(error) });
    }
  }

  function putFile(source: FileSource): void {
    if (!pending.some((row) => row.id === source.id)) return;
    pending = pending.map((row) => (row.id === source.id ? source : row));
    paint();
  }

  function addFiles(files: File[]): void {
    for (const file of files) {
      const reason = rejectReason({ name: file.name, size: file.size });
      if (reason) {
        banner = { kind: "error", text: `${file.name}: ${reason}` };
        continue;
      }
      if (tooManyFiles(pending.length + committed.length, 1)) {
        banner = { kind: "error", text: `添付できるのは ${MAX_ATTACHED_FILES} 件までです。` };
        break;
      }
      const base = { id: nextFileId(), name: file.name, size: file.size, mtime: file.lastModified };
      if ([...pending, ...committed].some((row) => sameFile(base, row))) {
        banner = { kind: "error", text: `${file.name} はすでに読み込んでいます。` };
        continue;
      }
      pending = [...pending, { ...base, status: "extracting" }];
      const abort = new AbortController();
      fileAborts.set(base.id, abort);
      void ingestFile({
        file,
        base,
        settings,
        signal: abort.signal,
        onUpdate: putFile,
        onRemote: () => {
          if (remoteWarned) return;
          remoteWarned = true;
          banner = { kind: "warning", text: REMOTE_OCR_NOTICE };
          paint();
        },
      }).catch((error) => {
        fileAborts.delete(base.id);
        if (abort.signal.aborted) return;
        putFile({ ...base, status: "error", message: readErrorMessage(error) });
      });
    }
    paint();
  }

  function nextFileId(): string {
    fileSerial += 1;
    return `f_${Date.now().toString(36)}_${fileSerial.toString(36)}`;
  }

  function removePending(id: string): void {
    fileAborts.get(id)?.abort();
    fileAborts.delete(id);
    pending = pending.filter((row) => row.id !== id);
    paint();
  }

  function removeCommitted(id: string): void {
    committed = committed.filter((row) => row.id !== id);
    if (conversationId) void saveConversationFiles(conversationId, committed);
    paint();
  }

  function paintBadges(): void {
    composer.badges.textContent = "";
    composer.mailBadges.textContent = "";
    const kept = committed.filter((file) => file.via !== "mail");
    if (pending.length) {
      const reading = pending.some(isPending);
      if (reading) {
        const spin = el("span");
        spin.className = "file-spin";
        composer.badges.append(spin);
      }
      const failed = !reading && pending.some((row) => row.status === "error");
      composer.badges.append(fileChip("pending", pendingChipLabel(pending), failed ? "danger" : ""));
    }
    if (kept.length) {
      const chars = filesChars(kept).toLocaleString("ja-JP");
      composer.badges.append(fileChip("kept", `この会話の資料 ${kept.length.toLocaleString("ja-JP")} 件 ${chars} 字`, "kept"));
    }
    if (openFileList === "pending" && !pending.length) openFileList = null;
    if (openFileList === "kept" && !kept.length) openFileList = null;
    const mailKept = committed.filter((file) => file.via === "mail");
    if (openFileList === "mail" && !mailJobs.length && !mailKept.length) openFileList = null;
    if (mailJobs.length || mailKept.length) {
      const reading = mailJobs.some(isPending);
      if (reading) {
        const spin = el("span");
        spin.className = "file-spin";
        composer.mailBadges.append(spin);
      }
      const failed = !reading && mailJobs.some((row) => row.status === "error");
      composer.mailBadges.append(fileChip("mail", mailChipLabel(mailJobs, mailKept), failed ? "danger" : ""));
    }
    if (mailGuide) {
      const hint = el("p", MAIL_ATTACH_HINT);
      hint.className = "mail-hint";
      composer.mailBadges.append(hint);
    }
  }

  function fileChip(kind: "pending" | "kept" | "mail", label: string, tone: string): HTMLElement {
    const wrap = el("span");
    wrap.className = "file-chip-wrap";
    const chip = el("button", label);
    chip.type = "button";
    chip.className = `file-chip${tone ? ` ${tone}` : ""}`;
    chip.title = label;
    chip.addEventListener("click", () => {
      openFileList = openFileList === kind ? null : kind;
      paintBadges();
    });
    wrap.append(chip);
    if (openFileList === kind) {
      wrap.append(kind === "pending" ? pendingList() : kind === "kept" ? keptList() : mailList());
    }
    return wrap;
  }

  function openPreview(file: { name: string; origin: "text" | "ocr"; body: string; truncated: boolean }): void {
    openFileList = null;
    paintBadges();
    const body = el("div");
    const how = file.origin === "ocr" ? "画像から読み取り" : "テキストを読み取り";
    const cut = file.truncated ? "・長いので途中まで渡します" : "";
    const meta = el("p", `${how}・${file.body.length.toLocaleString("ja-JP")} 字${cut}`);
    meta.className = "file-meta";
    const text = el("pre", file.body || "本文は読み取れませんでした。");
    text.className = "file-preview";
    body.append(meta, text);
    dialog.open(file.name, body);
  }

  function pendingList(): HTMLElement {
    return fileList(pending.map((source) => ({
      id: source.id,
      name: source.name,
      detail: source.status === "ready" ? `${source.body.length.toLocaleString("ja-JP")} 字` : badgeLabel(source),
      failed: source.status === "error",
      preview: source.status === "ready" ? source : null,
      remove: () => removePending(source.id),
      locked: false,
    })), openPreview);
  }

  function keptList(): HTMLElement {
    return fileList(committed.filter((file) => file.via !== "mail").map((file) => ({
      id: file.id,
      name: file.name,
      detail: `${file.body.length.toLocaleString("ja-JP")} 字`,
      failed: false,
      preview: file,
      remove: () => removeCommitted(file.id),
      locked: busy,
    })), openPreview);
  }

  function mailList(): HTMLElement {
    const jobs = mailJobs.map((source) => ({
      id: source.id,
      name: source.name,
      detail: badgeLabel(source),
      failed: source.status === "error",
      preview: source.status === "ready" ? source : null,
      remove: () => removeMail(source.id),
      locked: false,
    }));
    const kept = committed.filter((file) => file.via === "mail").map((file) => ({
      id: file.id,
      name: file.name,
      detail: `${file.body.length.toLocaleString("ja-JP")} 字`,
      failed: false,
      preview: file,
      remove: () => removeCommitted(file.id),
      locked: busy,
    }));
    return fileList([...jobs, ...kept], openPreview);
  }

  function removeMail(id: string): void {
    fileAborts.get(id)?.abort();
    fileAborts.delete(id);
    mailJobs = mailJobs.filter((row) => row.id !== id);
    paint();
  }

  function buildComposer(): { box: HTMLElement; input: HTMLTextAreaElement; send: HTMLButtonElement; stop: HTMLButtonElement; argos: HTMLButtonElement; attach: HTMLButtonElement; picker: HTMLInputElement; badges: HTMLElement; mailBadges: HTMLElement; shortcuts: Array<{ id: ReplyShortcutId; button: HTMLButtonElement }> } {
    const box = el("div");
    box.className = "composer";
    const badges = el("div");
    badges.className = "file-badges";
    const mailBadges = el("div");
    mailBadges.className = "mail-badges";
    const shortcutsRow = el("div");
    shortcutsRow.className = "shortcuts";
    const shortcuts = REPLY_SHORTCUTS.map((shortcut) => {
      const button = el("button", shortcut.label);
      button.type = "button";
      button.className = "shortcut";
      shortcutsRow.append(button);
      return { id: shortcut.id, button };
    });
    const frame = el("div");
    frame.className = "frame";
    const input = document.createElement("textarea");
    input.rows = 1;
    input.placeholder = "例: 返信の下書きを書いて / この文面を短くして";
    input.setAttribute("aria-label", "プロンプト");
    const bar = el("div");
    bar.className = "bar";
    const attach = el("button");
    attach.type = "button";
    attach.className = "clip";
    attach.setAttribute("aria-label", "ファイルを添付");
    attach.append(icon(ICONS.attach));
    const picker = document.createElement("input");
    picker.type = "file";
    picker.multiple = true;
    picker.accept = ACCEPTED_EXTENSIONS.join(",");
    picker.hidden = true;
    const argos = el("button", "argos");
    argos.type = "button";
    argos.className = "argos";
    argos.setAttribute("aria-label", "Argos の検索範囲");
    const send = el("button");
    send.type = "button";
    send.className = "send";
    send.setAttribute("aria-label", "送信");
    send.append(icon(ICONS.send));
    const stop = el("button", "止める");
    stop.type = "button";
    stop.className = "stop";
    stop.hidden = true;
    stop.addEventListener("click", () => turnAbort?.abort());
    bar.append(argos, attach, picker, stop, send);
    frame.append(input, bar);
    box.append(mailBadges, badges, shortcutsRow, frame);
    return { box, input, send, stop, argos, attach, picker, badges, mailBadges, shortcuts };
  }
}

function mailChipLabel(jobs: FileSource[], kept: CommittedFile[]): string {
  const items = [
    ...jobs.map((source) => ({ name: source.name, detail: badgeLabel(source), reading: isPending(source), failed: source.status === "error" })),
    ...kept.map((file) => ({ name: file.name, detail: `${file.body.length.toLocaleString("ja-JP")} 字`, reading: false, failed: false })),
  ];
  if (items.length === 1) {
    return `${items[0].name}（${items[0].detail}）`;
  }
  const reading = items.find((item) => item.reading);
  const failed = items.filter((item) => item.failed).length;
  const note = reading ? `・${reading.detail}` : failed ? `・${failed.toLocaleString("ja-JP")} 件失敗` : "";
  return `添付 ${items.length.toLocaleString("ja-JP")} 件${note}`;
}

function pendingChipLabel(rows: FileSource[]): string {
  if (rows.length === 1) {
    const only = rows[0];
    const detail = only.status === "ready" ? `${only.body.length.toLocaleString("ja-JP")} 字` : badgeLabel(only);
    return `${only.name}（${detail}）`;
  }
  const reading = rows.find(isPending);
  const failed = rows.filter((row) => row.status === "error").length;
  const note = reading ? `・${badgeLabel(reading)}` : failed ? `・${failed.toLocaleString("ja-JP")} 件失敗` : "";
  return `添付 ${rows.length.toLocaleString("ja-JP")} 件${note}`;
}

function fileList(rows: Array<{ id: string; name: string; detail: string; failed: boolean; preview: { name: string; origin: "text" | "ocr"; body: string; truncated: boolean } | null; remove: () => void; locked: boolean }>, onPreview: (file: { name: string; origin: "text" | "ocr"; body: string; truncated: boolean }) => void): HTMLElement {
  const list = el("div");
  list.className = "file-pop";
  for (const row of rows) {
    const line = el("div");
    line.className = "file-row";
    const name = el("button", row.name);
    name.type = "button";
    name.className = "file-name";
    name.disabled = !row.preview;
    name.title = row.name;
    if (row.preview) {
      const preview = row.preview;
      name.addEventListener("click", () => onPreview(preview));
    }
    const detail = el("span", row.detail);
    detail.className = row.failed ? "file-detail fail" : "file-detail";
    detail.title = row.detail;
    const drop = iconButton(`${row.name} を外す`, ICONS.close);
    drop.className = "file-drop";
    drop.disabled = row.locked;
    drop.addEventListener("click", row.remove);
    line.append(name, detail, drop);
    list.append(line);
  }
  return list;
}

function toolNames(rows: ChatRow[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const row of rows) {
    for (const call of row.toolCalls ?? []) names.set(call.id, call.function.name);
  }
  return names;
}

function md(text: string): HTMLElement {
  const node = el("div");
  node.className = "md";
  node.innerHTML = renderMarkdown(text);
  return node;
}

function textButton(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", label);
  button.type = "button";
  button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function renderRow(message: ChatRow, names: Map<string, string>): HTMLElement | null {
  if (message.role === "tool") return renderTool(message.content, names.get(message.toolCallId || "") || "");
  const wrap = el("div");
  wrap.className = "turn";
  if (message.role === "user") {
    const parts = splitHistoryFiles(message.content);
    const bubble = el("div");
    bubble.className = "user";
    const shortcut = replyShortcutLabel(parts.instruction);
    bubble.append(md(shortcut ?? parts.instruction));
    wrap.append(bubble);
    if (parts.files) {
      const details = el("details");
      details.className = "fold";
      details.append(el("summary", "資料ファイルを添付"), el("pre", parts.files));
      wrap.append(details);
    }
    return wrap;
  }
  if (message.reasoningContent) {
    const details = el("details");
    details.className = "fold";
    if (message.streaming) details.open = true;
    details.append(el("summary", message.streaming ? "思考中…" : "思考を表示"), el("pre", message.reasoningContent));
    wrap.append(details);
  }
  if (message.content || message.streaming) {
    const bubble = el("div");
    bubble.className = "assistant";
    bubble.append(md(message.content));
    if (message.streaming) {
      const caret = el("span");
      caret.className = "caret";
      bubble.append(caret);
    }
    wrap.append(bubble);
  }
  const notice = message.streaming ? null : foreignCharNoticeForAssistant(message.content, message.toolCalls ?? []);
  if (notice) {
    const warn = el("p", notice);
    warn.className = "warn";
    wrap.append(warn);
  }
  if (!message.streaming && message.toolCalls?.length) {
    const chips = el("div");
    chips.className = "chips";
    for (const call of message.toolCalls) {
      chips.append(el("span", describeToolCall(call.function.name, call.function.arguments)));
    }
    wrap.append(chips);
  }
  return wrap;
}

function renderTool(content: string, name: string): HTMLElement | null {
  if (content.startsWith("エラー")) {
    const box = el("div", content);
    box.className = "tool-error";
    return box;
  }
  if (name === TOOL_FIND_FREE_SLOTS) return renderSlots(content);
  if (name === TOOL_LIST_EVENTS) return renderEvents(content);
  if (name === TOOL_SEARCH_SENT) return renderSentMail(content);
  if (name !== TOOL_SEARCH && name !== TOOL_SEARCH_INDEX) return null;
  let hits: Array<{ title?: string; url?: string; path?: string; content?: string }> = [];
  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed) || !parsed.length) return null;
    hits = parsed as typeof hits;
  } catch {
    return null;
  }
  const details = el("details");
  details.className = "fold";
  details.append(el("summary", `${name === TOOL_SEARCH_INDEX ? "索引結果" : "検索結果"} ${hits.length} 件`));
  for (const hit of hits) {
    const card = el("div");
    card.className = "hit";
    card.append(el("strong", hit.title || "(無題)"));
    const href = hit.url || hit.path || "";
    if (href) card.append(md(href.startsWith("http") ? href : `\`${href}\``));
    if (hit.content) card.append(el("p", hit.content));
    details.append(card);
  }
  return details;
}

function renderSentMail(content: string): HTMLElement | null {
  let parsed: {
    sent?: Array<{ subject?: string; to?: string; sentOn?: string }>;
    received?: Array<{ subject?: string; from?: string; receivedOn?: string }>;
  } = {};
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return null;
  }
  const sent = Array.isArray(parsed.sent) ? parsed.sent : [];
  const received = Array.isArray(parsed.received) ? parsed.received : [];
  if (!sent.length && !received.length) return null;
  const details = el("details");
  details.className = "fold";
  details.append(el("summary", `過去のメール 送信 ${sent.length} 件、受信 ${received.length} 件`));
  for (const hit of sent) {
    const card = el("div");
    card.className = "hit";
    card.append(el("strong", hit.subject || "(無題)"));
    const meta = [hit.sentOn, hit.to].filter(Boolean).join(" ");
    if (meta) card.append(el("p", meta));
    details.append(card);
  }
  for (const hit of received) {
    const card = el("div");
    card.className = "hit";
    card.append(el("strong", hit.subject || "(無題)"));
    const meta = [hit.receivedOn, hit.from].filter(Boolean).join(" ");
    if (meta) card.append(el("p", meta));
    details.append(card);
  }
  return details;
}

function renderEvents(content: string): HTMLElement | null {
  let parsed: { events?: Array<{ start?: string; end?: string; allDay?: boolean; subject?: string; location?: string }>; note?: string } = {};
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return null;
  }
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  if (!events.length && !parsed.note) return null;
  const details = el("details");
  details.className = "fold";
  details.append(el("summary", events.length ? `予定 ${events.length} 件` : "予定なし"));
  if (parsed.note) details.append(el("p", parsed.note));
  for (const item of events) {
    const when = item.allDay ? "終日" : `${item.start ?? ""} から ${item.end ?? ""}`;
    const title = item.subject?.trim() || "(無題)";
    const line = `${when} ${title}`;
    details.append(el("p", item.location?.trim() ? `${line} ${item.location.trim()}` : line));
  }
  return details;
}

function renderSlots(content: string): HTMLElement | null {
  let parsed: { slots?: Array<{ start?: string; end?: string }>; note?: string; cutoff?: string; events?: number } = {};
  try {
    parsed = JSON.parse(content) as typeof parsed;
  } catch {
    return null;
  }
  const slots = Array.isArray(parsed.slots) ? parsed.slots : [];
  if (!slots.length && !parsed.note && !parsed.cutoff) return null;
  const details = el("details");
  details.className = "fold";
  const events = typeof parsed.events === "number" ? `（予定 ${parsed.events} 件）` : "";
  details.append(el("summary", (slots.length ? `空き ${slots.length} 件` : "空きなし") + events));
  if (parsed.note) details.append(el("p", parsed.note));
  if (parsed.cutoff) details.append(el("p", parsed.cutoff));
  for (const slot of slots) {
    details.append(el("p", `${slot.start ?? ""} から ${slot.end ?? ""}`));
  }
  return details;
}

function iconButton(label: string, path: string, hint = ""): HTMLButtonElement {
  const button = el("button");
  button.type = "button";
  button.className = "icon";
  button.setAttribute("aria-label", label);
  if (hint) button.title = hint;
  button.append(icon(path));
  return button;
}

function labeled(label: string, hint: string, control: HTMLElement): HTMLElement {
  const wrap = el("div");
  wrap.className = "field";
  const title = el("span", label);
  title.className = "field-label";
  wrap.append(title, control, note(hint));
  return wrap;
}

function choices<T extends string>(
  name: string,
  options: Array<{ value: T; label: string }>,
  current: T,
  onChange: (value: T) => void
): HTMLElement {
  const row = el("div");
  row.className = "choices";
  row.setAttribute("role", "radiogroup");
  row.setAttribute("aria-label", name);
  for (const option of options) {
    const label = el("label");
    label.className = "choice";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = option.value === current;
    input.addEventListener("change", () => {
      if (input.checked) onChange(option.value);
    });
    label.append(input, el("span", option.label));
    row.append(label);
  }
  return row;
}

function numberField(value: string, onNumber: (value: number) => void): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "number";
  input.value = value;
  input.addEventListener("change", () => {
    const n = Number(input.value);
    if (Number.isFinite(n) && n > 0) onNumber(Math.round(n));
  });
  return input;
}

function field(label: string, value: string, type: string, onInput: (value: string) => void): HTMLElement {
  const wrap = el("label");
  wrap.append(el("span", label));
  const input = document.createElement("input");
  input.type = type;
  input.value = value;
  input.addEventListener("change", () => onInput(input.value));
  wrap.append(input);
  return wrap;
}

function note(text: string): HTMLElement {
  const node = el("p", text);
  node.className = "note";
  return node;
}

function aboutHeading(text: string): HTMLElement {
  const heading = el("p", text);
  heading.className = "about-heading";
  return heading;
}

function asScope(row: ScopeRow): ArgosScopeRow {
  return { path: row.path, label: row.label || "", isRoot: Boolean(row.isRoot) };
}

function scopeFootLabel(draft: string[], rows: ArgosScopeRow[]): string {
  if (!draft.length) return "索引全体";
  const first = rows.find((row) => sameArgosPath(row.path, draft[0]));
  const name = first ? first.label || argosScopeChipLabel(first.path) : argosScopeChipLabel(draft[0]);
  return draft.length === 1 ? name : `${name} ほか${draft.length - 1}件`;
}

function scopeChoice(badge: string, label: string, active: boolean, nested: boolean, onClick: () => void): HTMLButtonElement {
  const button = el("button");
  button.type = "button";
  button.className = `scope-row${active ? " on" : ""}${nested ? " nested" : ""}`;
  button.addEventListener("click", onClick);
  const mark = el("span");
  mark.className = "tick";
  if (active) mark.append(icon(ICONS.check));
  button.append(mark);
  if (badge) {
    const pill = el("span", badge);
    pill.className = "pill";
    button.append(pill);
  }
  const text = el("span", label);
  text.className = "scope-name";
  text.title = label;
  button.append(text);
  return button;
}

function bannerView(banner: Banner, onClose: () => void): HTMLElement {
  const bar = el("div");
  bar.className = `banner ${banner.kind}`;
  bar.append(el("span", banner.text));
  const close = iconButton("閉じる", ICONS.close);
  close.addEventListener("click", onClose);
  bar.append(close);
  return bar;
}

function buildDialog(root: HTMLElement): { open: (title: string, body: HTMLElement) => void; close: () => void } {
  const back = el("div");
  back.className = "back";
  back.hidden = true;
  const surface = el("div");
  surface.className = "dialog";
  surface.setAttribute("role", "dialog");
  const head = el("div");
  head.className = "dialog-head";
  const title = el("div");
  title.className = "dialog-title";
  const close = iconButton("閉じる", ICONS.close);
  head.append(title, close);
  const body = el("div");
  body.className = "dialog-body";
  surface.append(head, body);
  back.append(surface);
  root.append(back);
  const closeDialog = () => {
    back.hidden = true;
  };
  close.addEventListener("click", closeDialog);
  back.addEventListener("click", (event) => { if (event.target === back) closeDialog(); });
  return {
    close: closeDialog,
    open: (label, content) => {
      title.textContent = label;
      body.textContent = "";
      body.append(content);
      back.hidden = false;
    },
  };
}

function applyUiFont(size: UiFontSize): void {
  document.documentElement.dataset.uiFont = size;
}

function fit(input: HTMLTextAreaElement): void {
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 168)}px`;
}

function css(): string {
  return `
    html, body { height: 100%; margin: 0; }
    html { font-size: 14px; }
    html[data-ui-font="small"] { font-size: 12px; }
    html[data-ui-font="large"] { font-size: 16px; }
    body { background: #fff; color: #1a1a1a; font: 1rem/1.5 "Yu Gothic UI","Meiryo",sans-serif; }
    button, input, textarea, select { font: inherit; color: inherit; }
    .app { box-sizing: border-box; height: 100vh; display: flex; flex-direction: column; gap: 10px; padding: 12px; }
    .header { display: flex; align-items: center; justify-content: space-between; gap: 4px; min-height: 24px; padding-bottom: 2px; border-bottom: 1px solid #b8e4f4; }
    .meter { display: flex; flex-direction: column; min-width: 0; flex-shrink: 1; line-height: 16px; }
    .meter-count, .meter-warn, .missing { color: #3f6c83; font-size: 0.857rem; line-height: 16px; }
    .meter-count.warn, .meter-warn { color: #bc2f32; }
    .actions { display: flex; align-items: center; flex-shrink: 0; }
    .icon, .banner button { width: 24px; height: 24px; border: 0; background: transparent; color: #333; padding: 0; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .header .icon { min-width: 24px; max-width: 24px; color: #0e344e; }
    .icon svg, .banner svg { width: 16px; height: 16px; }
    .icon:hover { background: #f0f0f0; }
    .header .icon:hover { background: #d2eff9; }
    .banner { display: flex; align-items: flex-start; gap: 8px; border-radius: 4px; padding: 6px 8px; font-size: 0.857rem; line-height: 16px; }
    .banner span { flex: 1; white-space: pre-wrap; }
    .banner.success, .banner.warning, .banner.error { background: #f5f5f5; color: #1a1a1a; border: 1px solid #d0d0d0; }
    .chat { flex: 1; min-height: 120px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
    .empty { border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px 8px; text-align: center; color: #5c5c5c; }
    .empty p { margin: 0 0 8px; }
    .empty p:last-child { margin: 0; font-size: 0.857rem; }
    .turn { display: flex; flex-direction: column; gap: 6px; }
    .user { align-self: flex-end; max-width: 92%; background: #f2f2f2; border: 1px solid #e0e0e0; border-radius: 8px; padding: 8px 10px; }
    .assistant { align-self: flex-start; max-width: 100%; padding: 8px 10px; }
    .md { overflow-wrap: anywhere; word-break: break-word; }
    .md > :first-child { margin-top: 0; }
    .md > :last-child { margin-bottom: 0; }
    .md h1, .md h2, .md h3, .md h4 { margin: 0.7em 0 0.35em; line-height: 1.35; font-weight: 600; }
    .md h1 { font-size: 1.143rem; } .md h2 { font-size: 1.071rem; } .md h3 { font-size: 1rem; }
    .md p { margin: 0 0 0.55em; }
    .md ul, .md ol { margin: 0 0 0.55em; padding-left: 1.35em; }
    .md blockquote { margin: 0 0 0.55em; padding-left: 8px; border-left: 3px solid #bdbdbd; color: #333; }
    .md code { font-family: Consolas, "Yu Gothic UI", monospace; font-size: 0.857rem; background: #f2f2f2; padding: 0 4px; border-radius: 3px; }
    .md pre { overflow-x: auto; background: #f2f2f2; padding: 8px; border-radius: 6px; }
    .md pre code { background: transparent; padding: 0; }
    .md table { border-collapse: collapse; font-size: 0.857rem; width: 100%; }
    .md th, .md td { border: 1px solid #d0d0d0; padding: 4px 6px; vertical-align: top; }
    .md th { background: #f2f2f2; text-align: left; }
    .md a { color: #1a1a1a; }
    .fold { border: 1px solid #d0d0d0; border-radius: 6px; padding: 6px 8px; color: #5c5c5c; font-size: 0.857rem; }
    .fold pre, .fold p, .hit p { white-space: pre-wrap; word-break: break-word; margin: 6px 0 0; }
    .hit { border: 1px solid #e0e0e0; border-radius: 6px; padding: 8px; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chips span, .tool-error { border: 1px solid #d0d0d0; border-radius: 999px; padding: 2px 8px; font-size: 0.857rem; }
    .tool-error { font-weight: 600; border-radius: 6px; }
    .warn { margin: 0; font-size: 0.857rem; font-weight: 600; }
    .caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; background: #333; vertical-align: text-bottom; }
    .stop { border: 1px solid #d0d0d0; background: #fff; border-radius: 6px; font-size: 0.857rem; padding: 2px 8px; }
    .composer { border-top: 1px solid #e0e0e0; padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
    .composer.dropping { background: #e8f3fb; border-radius: 8px; box-shadow: inset 0 0 0 1px #0e344e; }
    .file-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .file-badges:empty { display: none; }
    .file-spin { width: 12px; height: 12px; border: 2px solid #d0d0d0; border-top-color: #0e344e; border-radius: 50%; animation: file-spin .8s linear infinite; }
    @keyframes file-spin { to { transform: rotate(360deg); } }
    .file-chip-wrap { position: relative; max-width: 100%; }
    .file-chip { border: 0; background: #e8f3fb; color: #0e344e; border-radius: 999px; font-size: 0.857rem; line-height: 18px; padding: 1px 8px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
    .file-chip.kept { background: #f2f2f2; color: #333; }
    .file-chip.danger { background: #fde7e9; color: #bc2f32; }
    .file-pop { position: absolute; z-index: 4; bottom: calc(100% + 4px); left: 0; background: #fff; border: 1px solid #d0d0d0; border-radius: 6px; box-shadow: 0 4px 16px rgba(0,0,0,.12); padding: 4px; min-width: 200px; max-width: 260px; max-height: 40vh; overflow: auto; display: flex; flex-direction: column; gap: 2px; }
    .file-row { display: flex; align-items: center; gap: 4px; }
    .file-name { flex: 1; min-width: 0; border: 0; background: transparent; text-align: left; font-size: 0.857rem; padding: 2px 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-name:hover:not(:disabled) { background: #f0f0f0; border-radius: 4px; }
    .file-name:disabled { color: #888; }
    .file-detail { flex: none; max-width: 96px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5c5c5c; font-size: 0.786rem; }
    .file-detail.fail { color: #bc2f32; }
    .file-drop { width: 20px; height: 20px; min-width: 20px; border: 0; background: transparent; color: #333; padding: 0; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .file-drop svg { width: 12px; height: 12px; }
    .file-drop:hover:not(:disabled) { background: #f0f0f0; }
    .file-drop:disabled { color: #888; }
    .file-meta { margin: 0 0 8px; color: #5c5c5c; font-size: 0.786rem; line-height: 16px; }
    .file-preview { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 0.857rem; line-height: 17px; font-family: inherit; }
    .mail-badges { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .mail-badges:empty { display: none; }
    .mail-hint { margin: 0; flex-basis: 100%; color: #5c5c5c; font-size: 0.857rem; line-height: 16px; }
    .clip { width: 24px; height: 24px; min-width: 24px; border: 0; background: transparent; color: #333; padding: 0; border-radius: 4px; display: inline-flex; align-items: center; justify-content: center; }
    .clip svg { width: 16px; height: 16px; }
    .clip:hover:not(:disabled) { background: #f0f0f0; }
    .clip:disabled { color: #bdbdbd; }
    .shortcuts { display: flex; flex-wrap: wrap; gap: 4px; }
    .shortcut { border: 1px solid #d0d0d0; background: #fff; border-radius: 999px; padding: 2px 8px; font-size: 0.857rem; }
    .shortcut:hover { background: #f0f0f0; }
    .shortcut:disabled { color: #888; }
    .frame { border: 1px solid #e0e0e0; border-radius: 10px; padding: 8px 8px 6px; display: flex; flex-direction: column; gap: 4px; }
    .frame:focus-within { border-color: #333; }
    textarea { border: 0; outline: 0; resize: none; width: 100%; min-height: 1.5em; max-height: 168px; padding: 2px 4px; background: transparent; }
    textarea::placeholder { color: #888; }
    .bar { display: flex; justify-content: flex-end; align-items: center; gap: 6px; }
    .argos { border: 0; background: transparent; color: #5c5c5c; font-size: 0.857rem; max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 2px 6px; }
    .argos:hover { background: #f0f0f0; border-radius: 4px; }
    .primary, .chip, .history { border-radius: 6px; border: 1px solid #d0d0d0; background: #fff; padding: 2px 8px; font-size: 0.857rem; }
    .send { width: 28px; height: 28px; border: 0; border-radius: 999px; background: #333; color: #fff; display: inline-flex; align-items: center; justify-content: center; }
    .send:disabled { background: #f0f0f0; color: #888; }
    .send svg { width: 14px; height: 14px; }
    .back { position: fixed; inset: 0; background: rgba(0,0,0,.28); display: flex; align-items: flex-start; justify-content: center; padding: 16px 8px; }
    .back[hidden] { display: none; }
    .dialog { width: 100%; background: #fff; border-radius: 8px; padding: 8px; box-shadow: 0 8px 24px rgba(14,52,78,.18); max-height: calc(100vh - 32px); display: flex; flex-direction: column; }
    .dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; color: #333; font-size: 0.857rem; }
    .dialog-title { line-height: 16px; }
    .scope-list { display: flex; flex-direction: column; min-height: 140px; max-height: 360px; overflow: auto; border: 1px solid #d0d0d0; border-radius: 6px; padding: 2px; }
    .scope-row { display: flex; align-items: center; gap: 6px; width: 100%; border: 0; background: transparent; text-align: left; padding: 4px 6px; border-radius: 4px; font-size: 0.857rem; line-height: 16px; }
    .scope-row:hover, .scope-row.on { background: #f0f0f0; }
    .scope-row.nested { padding-left: 22px; }
    .tick { width: 14px; height: 14px; flex: none; color: #333; display: inline-flex; }
    .tick svg { width: 14px; height: 14px; }
    .pill { flex: none; font-size: 0.714rem; line-height: 16px; padding: 0 6px; border-radius: 999px; border: 1px solid #d0d0d0; color: #5c5c5c; }
    .scope-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .scope-foot { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .foot-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5c5c5c; font-size: 0.857rem; }
    .dialog-body { overflow: auto; }
    .stack { display: flex; flex-direction: column; gap: 8px; }
    .memory-actions { display: flex; align-items: center; gap: 6px; }
    .memory-line { display: flex; gap: 6px; align-items: center; }
    .memory-line input { flex: 1; min-width: 0; border: 1px solid #d0d0d0; border-radius: 6px; padding: 2px 6px; }
    .memory-text { box-sizing: border-box; width: 100%; min-height: 72px; max-height: 160px; border: 1px solid #d0d0d0; border-radius: 6px; padding: 4px 6px; background: #fff; }
    .field { display: flex; flex-direction: column; gap: 2px; }
    .field-label { font-size: 0.857rem; }
    .choices { display: flex; flex-wrap: wrap; gap: 4px 10px; }
    .choice { flex-direction: row; align-items: center; gap: 4px; }
    .choice input { min-height: 0; width: auto; }
    .pair { display: flex; gap: 8px; }
    .pair > * { flex: 1; min-width: 0; }
    label { display: flex; flex-direction: column; gap: 2px; font-size: 0.857rem; }
    input, select { border: 1px solid #d0d0d0; border-radius: 4px; padding: 4px 6px; min-height: 24px; background: #fff; }
    .note { margin: 0; color: #5c5c5c; font-size: 0.857rem; }
    .note.ok { color: #0e344e; }
    .check { flex-direction: row; align-items: center; gap: 6px; }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; }
    .chip.on, .primary { background: #333; color: #fff; border-color: #333; }
    .history-new { width: 100%; }
    .history-heading { margin: 8px 0 0; color: #5c5c5c; font-size: 0.857rem; }
    .about-heading { margin: 0; color: #1a1a1a; font-size: 0.857rem; font-weight: 600; line-height: 16px; }
    .about-item { display: flex; flex-direction: column; gap: 2px; }
    .about-item-title { margin: 0; color: #1a1a1a; font-size: 0.857rem; font-weight: 600; line-height: 16px; }
    .history-row { display: flex; align-items: center; gap: 6px; }
    .history { flex: 1; min-width: 0; text-align: left; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .history-current { flex-shrink: 0; color: #3f6c83; font-size: 0.857rem; }
    .history-delete { border: 1px solid #d0d0d0; background: #fff; border-radius: 6px; font-size: 0.857rem; padding: 2px 8px; }
  `;
}

const root = document.getElementById("app");
if (root && outlookReady()) {
  mount(root);
} else if (root) {
  root.textContent = "Outlook の LexCrew から開いてください。";
}
