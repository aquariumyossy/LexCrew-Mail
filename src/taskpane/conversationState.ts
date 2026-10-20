export type TranscriptLine = { role: string; content: string };

export type PaneTranscript = {
  conversationId: string;
  fresh: boolean;
};

export type SendTarget =
  | { kind: "existing"; id: string }
  | { kind: "create" }
  | { kind: "continue" };

/** Deleting the conversation on screen starts a blank one. The next send must not reopen it. */
export function deleteShownConversation(state: PaneTranscript, deletedId: string): PaneTranscript {
  if (!deletedId || state.conversationId !== deletedId) return state;
  return { conversationId: "", fresh: true };
}

export function beginNewConversation(): PaneTranscript {
  return { conversationId: "", fresh: true };
}

/** The previous mail's id is dropped before any await, so a send cannot attach that transcript. */
export function detachPreviousMail(_state: PaneTranscript): PaneTranscript {
  return { conversationId: "", fresh: false };
}

export function sendTarget(state: PaneTranscript): SendTarget {
  if (state.fresh) return { kind: "create" };
  if (state.conversationId) return { kind: "existing", id: state.conversationId };
  return { kind: "continue" };
}

/**
 * Lines eligible for the next request.
 * A new conversation contributes nothing, even if the caller still holds the old transcript.
 */
export function priorLines(
  target: SendTarget,
  load: (id: string) => TranscriptLine[],
  latestForKey: TranscriptLine[]
): TranscriptLine[] {
  if (target.kind === "create") return [];
  if (target.kind === "existing") return load(target.id).slice();
  return latestForKey.slice();
}

/** After a history load returns, a blank new conversation stays blank. */
export function restoreDecision(
  state: PaneTranscript,
  stored: { id: string } | null
): { restoreId: string | null; state: PaneTranscript } {
  if (state.fresh) return { restoreId: null, state: { conversationId: "", fresh: true } };
  if (!stored) return { restoreId: null, state: { conversationId: "", fresh: false } };
  return { restoreId: stored.id, state: { conversationId: stored.id, fresh: false } };
}

export function turnPayload(input: { prior: TranscriptLine[]; instruction: string; mailData: string }): string {
  return [...input.prior.map((row) => row.content), input.mailData, input.instruction].join("\n");
}

/** A cached header belongs to one item. Another item supplies its own text. */
export function activeMailText(cachedItemId: string, cachedText: string, liveItemId: string, liveText: string): string {
  if (liveItemId && cachedItemId !== liveItemId) return liveText;
  if (liveItemId) return liveText;
  return cachedText;
}

/** The click applies only to the item that was open when the card was shown. */
export function confirmationApplies(boundItemId: string, currentItemId: string): boolean {
  if (!boundItemId && !currentItemId) return true;
  return boundItemId.length > 0 && boundItemId === currentItemId;
}

export function refuseStaleWrite(boundItemId: string, currentItemId: string): string | null {
  if (confirmationApplies(boundItemId, currentItemId)) return null;
  return "開いているメールが変わったため、書いていません。";
}

/** Events from a turn that started on an older view must not paint onto the new one. */
export function acceptTurnEvent(startedEpoch: number, currentEpoch: number): boolean {
  return startedEpoch === currentEpoch;
}

/**
 * A conversation id resolved before a view change must not replace the blank conversation
 * the user started in the meantime.
 */
export function adoptStartedConversation(
  startedEpoch: number,
  currentEpoch: number,
  startedId: string,
  view: PaneTranscript
): PaneTranscript & { adopt: boolean } {
  if (!acceptTurnEvent(startedEpoch, currentEpoch)) return { ...view, adopt: false };
  return { conversationId: startedId, fresh: false, adopt: true };
}

/** Lines loaded for a previous view must not replace what the current view is showing. */
export function adoptLoadedLines<T>(startedEpoch: number, currentEpoch: number, loaded: T[], visible: T[]): { lines: T[]; adopt: boolean } {
  if (!acceptTurnEvent(startedEpoch, currentEpoch)) return { lines: visible.slice(), adopt: false };
  return { lines: loaded.slice(), adopt: true };
}

/** Another message in the same thread keeps the transcript. Any other item drops it. */
export function transcriptSurvivesItemSwitch(shownKey: string, nextKey: string): boolean {
  return nextKey.length > 0 && nextKey === shownKey;
}

/** History key for the open item. A temporary key from another item is not reused. */
export function historyKey(conversationId: string, itemId: string, tempKey: string): string {
  if (conversationId) return conversationId;
  if (itemId) return `item:${itemId}`;
  return tempKey;
}

/** What a new conversation on the live item may show. Stale mail text and prior turns stay out. */
export function turnVisibleText(input: {
  fresh: boolean;
  prior: TranscriptLine[];
  cachedItemId: string;
  cachedMail: string;
  liveItemId: string;
  liveMail: string;
  instruction: string;
}): string {
  const prior = input.fresh ? [] : input.prior;
  const mail = activeMailText(input.cachedItemId, input.cachedMail, input.liveItemId, input.liveMail);
  return [...prior.map((row) => row.content), mail, input.instruction].join("\n");
}
