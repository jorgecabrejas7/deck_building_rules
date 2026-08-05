import { REMINDER_TEXT_RE } from "./stats.js";

// ---- ramp acceleration heuristics ----
export function manaProduced(card) {
  const o = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  const m = o.match(/add ([^.\n]*)/i);
  if (!m) return 0;
  const seg = m[1];
  const sym = (seg.match(/\{[wubrgc0-9]\}/gi) || []).length;
  if (sym) return sym;
  const words = { one: 1, two: 2, three: 3, four: 4 };
  const wm = seg.match(/\b(one|two|three|four)\b/i);
  if (wm) return words[wm[1].toLowerCase()];
  const dm = seg.match(/(\d+)/);
  return dm ? Math.min(+dm[1], 6) : 1;
}
export function isLandRamp(card) {
  const o = (card.oracle_text || "").replace(REMINDER_TEXT_RE, "");
  return /search (?:your|their) library for [^.]{0,60}land[^.]{0,80}onto the battlefield/i.test(o);
}
