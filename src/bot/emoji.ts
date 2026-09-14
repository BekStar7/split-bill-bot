/** Stable per-participant avatar emoji — same user always gets the same one within a bill. */
const PALETTE = [
  '🦊', '🐱', '🐶', '🐼', '🦁', '🐸', '🐵', '🐯',
  '🐨', '🐰', '🦄', '🐷', '🐮', '🐔', '🐧', '🦉',
  '🐻', '🐺', '🦝', '🐹',
];

export function personEmoji(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length]!;
}
