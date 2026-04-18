import { useQueryClient } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Input } from '@/common/ui/input';
import { Switch } from '@/common/ui/switch';
import { useCompletionSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';

export function AutocompleteSettings() {
  const { data: setting, isLoading } = useCompletionSetting();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('codestral-latest');
  const [serverUrl, setServerUrl] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Sync local state from loaded setting
  useEffect(() => {
    if (setting) {
      setEnabled(setting.enabled);
      setModel(setting.model || 'codestral-latest');
      setServerUrl(setting.serverUrl);
      // Don't set apiKey — it's encrypted, show placeholder instead
      setHasApiKey(!!setting.apiKey);
      setApiKey('');
    }
  }, [setting]);

  const hasChanges =
    enabled !== (setting?.enabled ?? false) ||
    !!apiKey.trim() ||
    model.trim() !== (setting?.model || 'codestral-latest') ||
    serverUrl.trim() !== (setting?.serverUrl ?? '');

  const handleSave = async () => {
    setTestResult(null);
    setIsSaving(true);

    try {
      await api.completion.saveSettings({
        enabled,
        apiKey: apiKey.trim(), // Empty string means keep existing
        model: model.trim() || 'codestral-latest',
        serverUrl: serverUrl.trim(),
      });

      // Invalidate so other consumers (e.g. MessageInput) pick up changes
      await queryClient.invalidateQueries({
        queryKey: ['settings', 'completion'],
      });

      if (enabled && (apiKey.trim() || hasApiKey)) {
        // Test the connection
        const result = await api.completion.test();
        if (result.success) {
          setTestResult({ type: 'success', text: 'Connection successful!' });
          if (apiKey.trim()) {
            setHasApiKey(true);
          }
          setApiKey('');
        } else {
          setTestResult({
            type: 'error',
            text: result.error ?? 'Connection failed',
          });
        }
      } else {
        setTestResult({ type: 'success', text: 'Settings saved.' });
        if (apiKey.trim()) {
          setHasApiKey(true);
        }
        setApiKey('');
      }
    } catch (error) {
      setTestResult({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <p className="text-ink-3">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-ink-1 text-lg font-semibold">Autocomplete</h2>
      <p className="text-ink-3 mt-1 text-sm">
        Inline ghost text completions powered by Mistral Codestral FIM
        (Fill-in-the-Middle). Press{' '}
        <kbd className="bg-glass-medium text-ink-1 rounded px-1 py-0.5 text-xs">
          Tab
        </kbd>{' '}
        to accept a suggestion.
      </p>

      {/* Setup guide */}
      <div className="border-glass-border bg-bg-1/50 mt-4 max-w-lg rounded-lg border px-4 py-3">
        <p className="text-ink-1 text-sm font-medium">Getting started</p>
        <ol className="text-ink-2 mt-2 list-inside list-decimal space-y-1 text-sm">
          <li>
            Create a Mistral account at{' '}
            <a
              href="https://console.mistral.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-acc-ink hover:text-acc-ink inline-flex items-center gap-1"
            >
              console.mistral.ai
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>
            Get a Codestral API key from{' '}
            <a
              href="https://console.mistral.ai/codestral"
              target="_blank"
              rel="noopener noreferrer"
              className="text-acc-ink hover:text-acc-ink inline-flex items-center gap-1"
            >
              the Codestral section
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>Paste the API key below and save</li>
        </ol>
        <p className="text-ink-3 mt-2 text-xs">
          Codestral API keys use the{' '}
          <code className="text-ink-2">codestral.mistral.ai</code> endpoint and
          have separate (generous) rate limits.{' '}
          <a
            href="https://docs.mistral.ai/capabilities/code_generation"
            target="_blank"
            rel="noopener noreferrer"
            className="text-acc-ink hover:text-acc-ink inline-flex items-center gap-1"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* Enable toggle */}
      <Switch
        checked={enabled}
        onChange={setEnabled}
        label="Enable autocomplete"
        className="mt-6"
      />

      {/* Configuration fields */}
      <div
        className={`mt-6 space-y-4 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {/* API Key */}
        <div>
          <label className="text-ink-2 block text-sm font-medium">
            Codestral API Key
          </label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasApiKey ? '••••••••••••••••' : 'Enter your Codestral API key'
            }
            disabled={!enabled}
            className="mt-1 max-w-md"
          />
          {hasApiKey && (
            <p className="text-ink-3 mt-1 text-xs">
              Leave empty to keep existing key. Enter a new value to replace it.
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="text-ink-2 block text-sm font-medium">Model</label>
          <Input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="codestral-latest"
            disabled={!enabled}
            className="mt-1 max-w-md"
          />
          <p className="text-ink-3 mt-1 text-xs">
            Default: <code className="text-ink-2">codestral-latest</code>
          </p>
        </div>

        {/* Server URL (advanced) */}
        <div>
          <label className="text-ink-2 block text-sm font-medium">
            Server URL
            <span className="text-ink-3 ml-1.5 text-xs font-normal">
              (optional)
            </span>
          </label>
          <Input
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://api.mistral.ai"
            disabled={!enabled}
            className="mt-1 max-w-md"
          />
          <p className="text-ink-3 mt-1 text-xs">
            Leave empty to use the default Codestral endpoint. Use{' '}
            <code className="text-ink-2">https://api.mistral.ai</code> if using
            a standard Mistral API key instead.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={isSaving}
          loading={isSaving}
          variant="primary"
        >
          Save
        </Button>
        {hasChanges && (
          <span className="text-ink-3 text-xs">Unsaved changes</span>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-4 max-w-md rounded-lg border px-4 py-3 ${
            testResult.type === 'success'
              ? 'text-status-done border-status-done bg-status-done/30'
              : 'text-status-fail border-status-fail bg-status-fail/30'
          }`}
        >
          <span className="text-sm">{testResult.text}</span>
        </div>
      )}
    </div>
  );
}
