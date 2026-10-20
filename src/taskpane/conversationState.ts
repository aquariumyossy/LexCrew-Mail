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
