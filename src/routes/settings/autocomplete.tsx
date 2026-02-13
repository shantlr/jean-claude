import { useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useCompletionSetting } from '@/hooks/use-settings';
import { api } from '@/lib/api';

export const Route = createFileRoute('/settings/autocomplete')({
  component: AutocompleteSettingsPage,
});

function AutocompleteSettingsPage() {
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
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">Autocomplete</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Inline ghost text completions powered by Mistral Codestral FIM
        (Fill-in-the-Middle). Press{' '}
        <kbd className="rounded bg-neutral-700 px-1 py-0.5 text-xs text-neutral-300">
          Tab
        </kbd>{' '}
        to accept a suggestion.
      </p>

      {/* Setup guide */}
      <div className="mt-4 max-w-lg rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
        <p className="text-sm font-medium text-neutral-300">Getting started</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-sm text-neutral-400">
          <li>
            Create a Mistral account at{' '}
            <a
              href="https://console.mistral.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
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
              className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
            >
              the Codestral section
              <ExternalLink className="h-3 w-3" />
            </a>
          </li>
          <li>Paste the API key below and save</li>
        </ol>
        <p className="mt-2 text-xs text-neutral-500">
          Codestral API keys use the{' '}
          <code className="text-neutral-400">codestral.mistral.ai</code>{' '}
          endpoint and have separate (generous) rate limits.{' '}
          <a
            href="https://docs.mistral.ai/capabilities/code_generation"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"
          >
            Learn more
            <ExternalLink className="h-3 w-3" />
          </a>
        </p>
      </div>

      {/* Enable toggle */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => setEnabled(!enabled)}
          className={`relative inline-flex h-6 w-11 cursor-pointer items-center rounded-full transition-colors ${
            enabled ? 'bg-blue-600' : 'bg-neutral-600'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className="text-sm font-medium text-neutral-200">
          Enable autocomplete
        </span>
      </div>

      {/* Configuration fields */}
      <div
        className={`mt-6 space-y-4 ${!enabled ? 'pointer-events-none opacity-50' : ''}`}
      >
        {/* API Key */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            Codestral API Key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              hasApiKey ? '••••••••••••••••' : 'Enter your Codestral API key'
            }
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          {hasApiKey && (
            <p className="mt-1 text-xs text-neutral-500">
              Leave empty to keep existing key. Enter a new value to replace it.
            </p>
          )}
        </div>

        {/* Model */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="codestral-latest"
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Default: <code className="text-neutral-400">codestral-latest</code>
          </p>
        </div>

        {/* Server URL (advanced) */}
        <div>
          <label className="block text-sm font-medium text-neutral-400">
            Server URL
            <span className="ml-1.5 text-xs font-normal text-neutral-500">
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://api.mistral.ai"
            disabled={!enabled}
            className="mt-1 w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-1 text-xs text-neutral-500">
            Leave empty to use the default Codestral endpoint. Use{' '}
            <code className="text-neutral-400">https://api.mistral.ai</code> if
            using a standard Mistral API key instead.
          </p>
        </div>
      </div>

      {/* Save button */}
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </button>
        {hasChanges && (
          <span className="text-xs text-neutral-500">Unsaved changes</span>
        )}
      </div>

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-4 max-w-md rounded-lg border px-4 py-3 ${
            testResult.type === 'success'
              ? 'border-green-700 bg-green-900/30 text-green-400'
              : 'border-red-700 bg-red-900/30 text-red-400'
          }`}
        >
          <span className="text-sm">{testResult.text}</span>
        </div>
      )}
    </div>
  );
}
