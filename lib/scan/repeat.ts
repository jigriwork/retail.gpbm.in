// When does a barcode read count as a new piece?
// A code counts again only after it has been out of view for `absentMs`, so
// one tag held in front of the camera is never counted twice, but identical
// tags on several pieces all count as the camera moves from one to the next.

export type LastRead = { code: string; seen: number };

export const ABSENT_MS = 700;

/** Returns whether this read is a new piece, and the updated last read. */
export function readCounts(last: LastRead, code: string, now: number, absentMs = ABSENT_MS): { counts: boolean; last: LastRead } {
  const repeat = code === last.code && now - last.seen < absentMs;
  return { counts: !repeat, last: { code, seen: now } };
}
