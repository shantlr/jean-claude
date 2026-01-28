import { ExternalLink, Loader2, X } from 'lucide-react';
import { useState } from 'react';

import { useValidateAzureDevOpsToken } from '@/hooks/use-azure-devops';
import { useCreateToken } from '@/hooks/use-tokens';

import type { ProviderType } from '../../../../shared/types';

type Step = 'form' | 'validating';

const PROVIDER_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'azure-devops', label: 'Azure DevOps' },
  { value: 'github', label: 'GitHub' },
  { value: 'gitlab', label: 'GitLab' },
];

export function AddTokenPane({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<Step>('form');
  const [label, setLabel] = useState('');
  const [token, setToken] = useState('');
  const [providerType, setProviderType] =
    useState<ProviderType>('azure-devops');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState<string | null>(null);

  const validateToken = useValidateAzureDevOpsToken();
  const createToken = useCreateToken();

  const handleSubmit = async () => {
    setError(null);
    setStep('validating');

    try {
      // For Azure DevOps, validate the token first
      if (providerType === 'azure-devops') {
        await validateToken.mutateAsync(token);
      }

      // Create the token
      await createToken.mutateAsync({
        label,
        token,
        providerType,
        expiresAt: expiresAt || null,
        updatedAt: new Date().toISOString(),
      });

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create token');
      setStep('form');
    }
  };

  const isValid = label.trim() && token.trim();

  return (
    <div className="w-80 shrink-0 rounded-lg border border-neutral-700 bg-neutral-800/50 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-medium text-neutral-200">Add Token</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Provider Type
          </label>
          <select
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as ProviderType)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          >
            {PROVIDER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Label
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Work Azure PAT"
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Personal Access Token
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your PAT"
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-neutral-400">
            Expiration Date (optional)
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-lg border border-neutral-600 bg-neutral-700 px-3 py-2 text-sm text-neutral-200 focus:border-blue-500 focus:outline-none"
          />
        </div>

        {providerType === 'azure-devops' && (
          <a
            href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            How to create a PAT
            <ExternalLink className="h-3 w-3" />
          </a>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!isValid || step === 'validating'}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-600"
        >
          {step === 'validating' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Validating...
            </>
          ) : (
            'Add Token'
          )}
        </button>
      </div>
    </div>
  );
}
