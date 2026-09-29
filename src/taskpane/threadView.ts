export type ThreadGate = { busy: boolean; loading: boolean };
export type ThreadMove = { kind: "stay" } | { kind: "switch"; key: string };

export function decideThread(shownKey: string, observedKey: string, gate: ThreadGate): ThreadMove {
  // 予定、未選択、フォルダ切替ではキーが空になる。その一瞬で今の会話は消さない。
  if (!observedKey || observedKey === shownKey || gate.busy || gate.loading) {
    return { kind: "stay" };
  }
  return { kind: "switch", key: observedKey };
}

export type Parked<F> = { text: string; pending: F[] };

export function park<F>(drafts: Map<string, Parked<F>>, key: string, value: Parked<F>): void {
  if (!value.text && value.pending.length === 0) {
    drafts.delete(key);
    return;
  }
  drafts.set(key, { text: value.text, pending: value.pending.slice() });
}

export function unpark<F>(drafts: Map<string, Parked<F>>, key: string): Parked<F> {
  const found = drafts.get(key);
  drafts.delete(key);
  if (!found) return { text: "", pending: [] };
  return found;
}

export function splitHistory<T extends { conversationKey?: string }>(
  rows: T[],
  threadKey: string
): { here: T[]; elsewhere: T[] } {
  if (!threadKey) return { here: [], elsewhere: rows.slice() };
  const here: T[] = [];
  const elsewhere: T[] = [];
  for (const row of rows) {
    if (row.conversationKey === threadKey) here.push(row);
    else elsewhere.push(row);
  }
  return { here, elsewhere };
}
