import { Provider } from '@shared/types';

export function OrganizationCard({
  provider,
  isSelected,
  onSelect,
}: {
  provider: Provider;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className={`flex cursor-pointer items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
        isSelected
          ? 'border-acc bg-acc/10'
          : 'border-glass-border bg-bg-1/50 hover:border-glass-border-strong'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="bg-acc/20 text-acc-ink flex h-8 w-8 items-center justify-center rounded-lg">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M0 8.877L2.247 5.91l8.405-3.416V.022l7.37 5.393L2.966 8.338v8.225L0 15.707zm24-4.45v14.651l-5.753 4.9-9.303-3.057v3.056l-5.978-7.416 15.057 1.798V5.415z" />
          </svg>
        </div>
        <div>
          <div className="text-ink-1 font-medium">{provider.label}</div>
          <div className="text-ink-3 text-sm">{provider.baseUrl}</div>
        </div>
      </div>
    </div>
  );
}
