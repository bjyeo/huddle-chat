const COLORS = [
  '#5865f2',
  '#3ba55c',
  '#faa61a',
  '#ed4245',
  '#eb459e',
  '#00a8fc',
  '#9b59b6',
  '#1abc9c',
];

export function initials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? [words[0], words.at(-1)] : words;
  return letters.map((word) => Array.from(word)[0].toUpperCase()).join('') || '?';
}

/** Deterministic color for a username (djb2 hash). */
export function avatarColor(key) {
  let hash = 5381;
  for (const char of String(key)) hash = (hash * 33) ^ char.codePointAt(0);
  return COLORS[Math.abs(hash) % COLORS.length];
}
