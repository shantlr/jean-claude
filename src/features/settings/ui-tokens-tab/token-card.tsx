import { AlertCircle, CheckCircle, Clock, Key } from 'lucide-react';

import type { Token } from '../../../../shared/types';

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
    return { label: 'No expiration', color: 'text-neutral-400', icon: Clock };
  }

  const now = new Date();
  const expiry = new Date(expiresAt);
  const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    return { label: 'Expired', color: 'text-red-400', icon: AlertCircle };
  }
  if (daysUntil <= 7) {
    return { label: `Expires in ${daysUntil} days`, color: 'text-yellow-400', icon: AlertCircle };
  }
  if (daysUntil <= 30) {
    return { label: `Expires in ${daysUntil} days`, color: 'text-yellow-500', icon: Clock };
  }
  return { label: `Expires in ${daysUntil} days`, color: 'text-green-400', icon: CheckCircle };
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
    <button
      onClick={onSelect}
      className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-4 text-left transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-neutral-700 bg-neutral-800/50 hover:border-neutral-600'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-neutral-400" />
          <span className="font-medium text-neutral-200">{token.label}</span>
        </div>
        <span className="rounded-full bg-neutral-700 px-2 py-0.5 text-xs text-neutral-300">
          {PROVIDER_LABELS[token.providerType] || token.providerType}
        </span>
      </div>

      <div className={`flex items-center gap-1.5 text-sm ${expiration.color}`}>
        <ExpirationIcon className="h-3.5 w-3.5" />
        {expiration.label}
      </div>
    </button>
  );
}
