export const PARTICIPANT_COLORS = [
  "#265327", // dark green
  "#1a3a8a", // blue
  "#8a1a3a", // crimson
  "#6b3fa0", // purple
  "#b85c00", // amber
  "#0a7a7a", // teal
  "#c43c8a", // magenta
  "#4a6b00", // olive
];

export function getColor(index: number): string {
  return PARTICIPANT_COLORS[index % PARTICIPANT_COLORS.length];
}
