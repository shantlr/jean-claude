export const PROJECT_COLORS = [
  '#5865F2', // blurple
  '#57F287', // green
  '#FEE75C', // yellow
  '#EB459E', // pink
  '#ED4245', // red
  '#9B59B6', // purple
  '#3498DB', // blue
  '#E67E22', // orange
  '#1ABC9C', // teal
  '#7F1D1D', // oxblood
  '#BE123C', // raspberry
  '#F97316', // tangerine
  '#CA8A04', // ochre
  '#84CC16', // lime
  '#15803D', // forest
  '#0F766E', // jade
  '#0891B2', // cyan
  '#1D4ED8', // cobalt
  '#4338CA', // indigo
  '#64748B', // slate
] as const;

export function getRandomColor(): string {
  return PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)];
}

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}
