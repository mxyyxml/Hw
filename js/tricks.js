// =============================================================================
//  tricks.js — flick-input trick resolver.
//  (The combo / scoring system is added below it in the scoring stage.)
// =============================================================================
import { FLIP_TRICKS, DEFAULT_POP } from './config.js';

// Longest sequences first so "↓ ↑ ←" (360 Flip) wins over "↑ ←" etc.
const SORTED = [...FLIP_TRICKS].sort((a, b) => b.seq.length - a.seq.length);

// dirs: direction keys pressed while Space was held, oldest first.
// Returns the matching trick definition (or the plain Ollie).
export function resolveFlick(dirs) {
  for (const t of SORTED) {
    if (dirs.length < t.seq.length) continue;
    const tail = dirs.slice(dirs.length - t.seq.length);
    if (tail.every((d, i) => d === t.seq[i])) return t;
  }
  return DEFAULT_POP;
}

// "BS 360" style spin label from a signed spin angle (radians). '' if < 180°.
export function spinLabel(spin) {
  const halfTurns = Math.round(Math.abs(spin) / Math.PI);
  if (halfTurns < 1) return { label: '', halfTurns: 0 };
  return { label: (spin > 0 ? 'BS ' : 'FS ') + halfTurns * 180, halfTurns };
}
