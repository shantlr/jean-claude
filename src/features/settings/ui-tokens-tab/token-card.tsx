import { AlertCircle, CheckCircle, Clock, Key } from 'lucide-react';

import { Button } from '@/common/ui/button';
import type { Token } from '@shared/types';

const PROVIDER_LABELS: Record<string, string> = {
  'azure-devops': 'Azure DevOps',
  github: 'GitHub',
  gitlab: 'GitLab',
};

function getExpirationStatus(expiresAt: string | null): {
  label: string;
  color: string;
  icon: typeof CheckCircle;
} {
  if (!expiresAt) {
    return { label: 'No expiration', color: 'text-ink-2', icon: Clock };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysUntil = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
  );

  if (daysUntil < 0) {
    return { label: 'Expired', color: 'text-status-fail', icon: AlertCircle };
  }
  if (daysUntil <= 7) {
    return {
      label: `Expires in ${daysUntil} days`,
      color: 'text-status-run',
      icon: AlertCircle,
    };
  }
  if (daysUntil <= 30) {
    return {
      label: `Expires in ${daysUntil} days`,
      color: 'text-status-run',
      icon: Clock,
    };
  }
  return {
    label: `Expires in ${daysUntil} days`,
    color: 'text-status-done',
    icon: CheckCircle,
  };
}

export function TokenCard({
  token,
  isSelected,
  onSelect,
}: {
  token: Token;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const expiration = getExpirationStatus(token.expiresAt);
  const ExpirationIcon = expiration.icon;

  return (
    <Button
      onClick={onSelect}
      variant="unstyled"
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
        isSelected
          ? 'border-acc bg-acc/10'
          : 'border-glass-border bg-bg-1/50 hover:border-glass-border-strong'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Key className="text-ink-2 h-4 w-4" />
          <span className="text-ink-1 font-medium">{token.label}</span>
        </div>
        <span className="bg-glass-medium text-ink-1 rounded-full px-2 py-0.5 text-xs">
          {PROVIDER_LABELS[token.providerType] || token.providerType}
        </span>
      </div>

      <div className={`flex items-center gap-1.5 text-sm ${expiration.color}`}>
        <ExpirationIcon className="h-3.5 w-3.5" />
        {expiration.label}
      </div>
    </Button>
  );
}
