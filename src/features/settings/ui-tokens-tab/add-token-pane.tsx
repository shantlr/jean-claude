import { ExternalLink, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/common/ui/button';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
import { Select } from '@/common/ui/select';
import { useValidateAzureDevOpsToken } from '@/hooks/use-azure-devops';
import { useCreateToken } from '@/hooks/use-tokens';
import type { ProviderType } from '@shared/types';

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
    <div className="border-glass-border bg-bg-1/50 w-80 shrink-0 rounded-lg border p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-ink-1 font-medium">Add Token</h3>
        <IconButton
          onClick={onClose}
          icon={<X />}
          tooltip="Close pane"
          size="sm"
        />
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <label className="text-ink-2 mb-2 block text-sm font-medium">
            Provider Type
          </label>
          <Select
            value={providerType}
            options={PROVIDER_OPTIONS}
            onChange={(value) => setProviderType(value as ProviderType)}
            className="w-full justify-between"
          />
        </div>

        <div>
          <label
            htmlFor="token-label"
            className="text-ink-2 mb-2 block text-sm font-medium"
          >
            Label
          </label>
          <Input
            id="token-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g., Work Azure PAT"
            autoComplete="off"
          />
        </div>

        <div>
          <label
            htmlFor="token-pat"
            className="text-ink-2 mb-2 block text-sm font-medium"
          >
            Personal Access Token
          </label>
          <Input
            id="token-pat"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your PAT"
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <div>
          <label className="text-ink-2 mb-2 block text-sm font-medium">
            Expiration Date (optional)
          </label>
          <Input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </div>

        {providerType === 'azure-devops' && (
          <a
            href="https://learn.microsoft.com/en-us/azure/devops/organizations/accounts/use-personal-access-tokens-to-authenticate"
            target="_blank"
            rel="noopener noreferrer"
            className="text-acc-ink hover:text-acc-ink flex items-center gap-1 text-sm"
          >
            How to create a PAT
            <ExternalLink className="h-3 w-3" aria-hidden />
          </a>
        )}

        {error && (
          <div className="bg-status-fail/10 text-status-fail border-status-fail/50 rounded-lg border px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <Button
          onClick={handleSubmit}
          disabled={!isValid || step === 'validating'}
          loading={step === 'validating'}
          variant="primary"
        >
          {step === 'validating' ? 'Validating...' : 'Add Token'}
        </Button>
      </div>
    </div>
  );
}
