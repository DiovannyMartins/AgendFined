// Bloqueios list order: what still matters comes first, soonest at the top, so
// the next bloqueio is never buried under far-future or long-gone ones. Those
// that already ended follow, most recent first.
export function splitBlocksByTime<T extends { start_at: string; end_at: string }>(
  blocks: T[],
  now: Date,
): { current: T[]; past: T[] } {
  const nowMs = now.getTime();
  const byStart = (a: T, b: T) => Date.parse(a.start_at) - Date.parse(b.start_at);
  return {
    current: blocks.filter((block) => Date.parse(block.end_at) > nowMs).sort(byStart),
    past: blocks
      .filter((block) => Date.parse(block.end_at) <= nowMs)
      .sort((a, b) => byStart(b, a)),
  };
}
