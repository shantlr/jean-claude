import { PROJECT_COLORS } from '@/lib/colors';

export function ProjectColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  const isPaletteColor = PROJECT_COLORS.some(
    (color) => color.toLowerCase() === value.toLowerCase(),
  );

  return (
    <div className="space-y-2">
      <div
        className="flex flex-wrap gap-2"
        role="radiogroup"
        aria-label="Project color"
      >
        {PROJECT_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={value.toLowerCase() === color.toLowerCase()}
            aria-label={`Select color ${color}`}
            onClick={() => onChange(color)}
            className={`h-8 w-8 cursor-pointer rounded-lg border border-white/10 transition-all ${
              value.toLowerCase() === color.toLowerCase()
                ? 'ring-offset-bg-0 scale-105 ring-2 ring-white ring-offset-2'
                : 'hover:scale-110 hover:border-white/30'
            }`}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>

      <label className="border-glass-border bg-bg-1/50 hover:border-glass-border-strong flex w-fit cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors">
        <input
          type="color"
          value={value || PROJECT_COLORS[0]}
          onChange={(event) => onChange(event.target.value)}
          className={`h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0 ${
            isPaletteColor
              ? ''
              : 'ring-offset-bg-0 ring-2 ring-white ring-offset-2'
          }`}
          aria-label="Pick custom project color"
        />
        <span className="text-ink-2 font-mono text-xs uppercase">
          {value || PROJECT_COLORS[0]}
        </span>
      </label>
    </div>
  );
}
