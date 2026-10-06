// Which camera reads count, and when a code counts again.
//
// - EAN/UPC codes carry a check digit: a read with a wrong check digit is a
//   misread and is dropped; a correct one counts at once.
// - Code 128 (the shop's price stickers) has a check character that both
//   readers verify, so one read counts at once too.
// - Code 39 has no check: it counts only after the same text is read twice
//   within a second.
// - A code counts again only after it has been out of view for `ABSENT_MS`:
//   one tag held in front of the camera counts once, but identical tags on
//   several pieces all count as the camera moves between them.

export type LastRead = { code: string; seen: number };
export type ReadState = { last: LastRead; pending: LastRead };

export const ABSENT_MS = 700;
export const CONFIRM_MS = 1000;

export const emptyReadState: ReadState = { last: { code: "", seen: 0 }, pending: { code: "", seen: 0 } };

const ean = /^(ean_13|ean_8|upc_a|upc_e|EAN_13|EAN_8|UPC_A|UPC_E)$/;
const checked = /^(code_128|CODE_128)$/;

/** Check digit of an EAN-8, UPC-A (12) or EAN-13 code. */
export function validEanUpc(code: string) {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop()!;
  const sum = digits.reverse().reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

/** Old name kept for callers that only need the repeat rule. */
export function readCounts(last: LastRead, code: string, now: number, absentMs = ABSENT_MS): { counts: boolean; last: LastRead } {
  const repeat = code === last.code && now - last.seen < absentMs;
  return { counts: !repeat, last: { code, seen: now } };
}

/** Whether this camera read should be used now, and the next state. */
export function acceptRead(state: ReadState, raw: string, format: string, now: number): { accept: boolean; state: ReadState } {
  const code = raw.trim();
  if (code.length < 4) return { accept: false, state };
  if (ean.test(format) || /^\d{12,13}$/.test(code)) {
    if (!validEanUpc(code) && /^\d{8}$|^\d{12,13}$/.test(code)) return { accept: false, state };
  } else if (checked.test(format)) {
    // Verified by the reader's check character: counts at once.
  } else if (!(state.pending.code === code && now - state.pending.seen < CONFIRM_MS)) {
    // First sighting of a code without a check digit: wait for a second read.
    if (state.last.code === code && now - state.last.seen < ABSENT_MS) {
      return { accept: false, state: { ...state, last: { code, seen: now } } };
    }
    return { accept: false, state: { ...state, pending: { code, seen: now } } };
  }
  const counted = readCounts(state.last, code, now);
  return { accept: counted.counts, state: { last: counted.last, pending: { code: "", seen: 0 } } };
}
