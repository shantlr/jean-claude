import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';


import { api } from '@/lib/api';
import type { DetectedProjectLogo } from '@shared/types';

function LogoSuggestion({
  logo,
  isSelected,
  onSelect,
}: {
  logo: DetectedProjectLogo;
  isSelected: boolean;
  onSelect: (path: string) => void;
}) {
  const { data: imageUrl } = useQuery({
    queryKey: ['project-logo-suggestion', logo.path],
    queryFn: () => api.fs.getImageUrl(logo.path),
    staleTime: Infinity,
  });

  return (
    <button
      type="button"
      onClick={() => onSelect(logo.path)}
      className={clsx(
        'border-glass-border bg-bg-1/60 hover:border-glass-border-strong flex min-w-0 items-center gap-2 rounded-lg border px-2 py-2 text-left transition-colors',
        isSelected && 'border-acc bg-acc/10',
      )}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="bg-glass-medium h-9 w-9 shrink-0 rounded-lg" />
      )}
      <span className="min-w-0 flex-1">
        <span className="text-ink-1 block truncate text-xs font-medium">
          {logo.label}
        </span>
        <span className="text-ink-3 block truncate text-[11px]">
          {logo.source}
        </span>
      </span>
    </button>
  );
}

export function ProjectLogoSuggestions({
  logos,
  selectedPath,
  onSelect,
}: {
  logos: DetectedProjectLogo[];
  selectedPath?: string | null;
  onSelect: (path: string) => void;
}) {
  if (logos.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {logos.slice(0, 8).map((logo) => (
        <LogoSuggestion
          key={logo.path}
          logo={logo}
          isSelected={selectedPath === logo.path}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
