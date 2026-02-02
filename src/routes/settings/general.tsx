import { createFileRoute } from '@tanstack/react-router';
import { Check, FolderOpen, Search, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';

import {
  useScanNonExistentProjects,
  useCleanupClaudeProjects,
} from '@/hooks/use-claude-projects-cleanup';
import {
  useEditorSetting,
  useUpdateEditorSetting,
  useAvailableEditors,
} from '@/hooks/use-settings';
import { api, type NonExistentClaudeProject } from '@/lib/api';

import { PRESET_EDITORS, type EditorSetting } from '../../../shared/types';

export const Route = createFileRoute('/settings/general')({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  const { data: editorSetting, isLoading } = useEditorSetting();
  const { data: availableEditors } = useAvailableEditors();
  const updateEditor = useUpdateEditorSetting();
  const [customCommand, setCustomCommand] = useState('');

  const handleSelectPreset = (id: string) => {
    updateEditor.mutate({ type: 'preset', id });
    setCustomCommand('');
  };

  const handleSetCustomCommand = () => {
    if (customCommand.trim()) {
      updateEditor.mutate({ type: 'command', command: customCommand.trim() });
    }
  };

  const handleBrowseApp = async () => {
    const result = await api.dialog.openApplication();
    if (result) {
      updateEditor.mutate({
        type: 'app',
        path: result.path,
        name: result.name,
      });
      setCustomCommand('');
    }
  };

  const getEditorLabel = (setting: EditorSetting): string => {
    if (setting.type === 'preset') {
      const editor = PRESET_EDITORS.find((e) => e.id === setting.id);
      return editor?.label ?? setting.id;
    }
    if (setting.type === 'command') {
      return setting.command;
    }
    return setting.name;
  };

  const isPresetSelected = (id: string): boolean => {
    return editorSetting?.type === 'preset' && editorSetting.id === id;
  };

  const isEditorAvailable = (id: string): boolean => {
    return availableEditors?.find((e) => e.id === id)?.available ?? false;
  };

  if (isLoading) {
    return <p className="text-neutral-500">Loading...</p>;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">Editor</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Choose which editor to open projects in
      </p>

      {/* Preset editors */}
      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_EDITORS.map((editor) => {
          const available = isEditorAvailable(editor.id);
          const selected = isPresetSelected(editor.id);

          return (
            <button
              key={editor.id}
              onClick={() => handleSelectPreset(editor.id)}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                selected
                  ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                  : available
                    ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-600'
              }`}
            >
              {editor.label}
              {available && <Check className="h-3 w-3 text-green-500" />}
            </button>
          );
        })}
      </div>

      {/* Custom command */}
      <div className="mt-6">
        <label className="block text-sm font-medium text-neutral-400">
          Custom command
        </label>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={customCommand}
            onChange={(e) => setCustomCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSetCustomCommand()}
            placeholder="e.g., vim, emacs, nano"
            className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleSetCustomCommand}
            disabled={!customCommand.trim()}
            className="cursor-pointer rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-neutral-700"
          >
            Set
          </button>
        </div>
      </div>

      {/* Browse for app */}
      <div className="mt-4">
        <button
          onClick={handleBrowseApp}
          className="flex cursor-pointer items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:border-neutral-600 hover:bg-neutral-700"
        >
          <FolderOpen className="h-4 w-4" />
          Browse for application...
        </button>
      </div>

      {/* Current selection */}
      {editorSetting && (
        <div className="mt-6 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
          <span className="text-sm text-neutral-500">Current editor: </span>
          <span className="text-sm font-medium text-neutral-200">
            {getEditorLabel(editorSetting)}
          </span>
          {editorSetting.type === 'app' && (
            <span className="ml-2 text-xs text-neutral-500">
              ({editorSetting.path})
            </span>
          )}
        </div>
      )}

      {/* Divider */}
      <div className="my-8 border-t border-neutral-800" />

      {/* Claude Projects Cleanup */}
      <ClaudeProjectsCleanup />
    </div>
  );
}

function ClaudeProjectsCleanup() {
  const [scannedProjects, setScannedProjects] = useState<
    NonExistentClaudeProject[]
  >([]);
  const [contentHash, setContentHash] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [cleanupMessage, setCleanupMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const scanMutation = useScanNonExistentProjects();
  const cleanupMutation = useCleanupClaudeProjects();

  const handleScan = async () => {
    setCleanupMessage(null);
    const result = await scanMutation.mutateAsync();
    setScannedProjects(result.projects);
    setContentHash(result.contentHash);
    // Select all by default
    setSelectedPaths(new Set(result.projects.map((p) => p.path)));
  };

  const handleToggle = (path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedPaths(new Set(scannedProjects.map((p) => p.path)));
  };

  const handleSelectNone = () => {
    setSelectedPaths(new Set());
  };

  const handleCleanup = async () => {
    if (selectedPaths.size === 0) return;

    const result = await cleanupMutation.mutateAsync({
      paths: Array.from(selectedPaths),
      contentHash,
    });

    if (result.success) {
      setCleanupMessage({
        type: 'success',
        text: `Successfully removed ${result.removedCount} project${result.removedCount === 1 ? '' : 's'}`,
      });
      // Clear the list
      setScannedProjects([]);
      setSelectedPaths(new Set());
      setContentHash('');
    } else {
      setCleanupMessage({
        type: 'error',
        text: result.error ?? 'Failed to cleanup projects',
      });
    }
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">
        Claude Projects Cleanup
      </h2>
      <p className="mt-1 text-sm text-neutral-500">
        Remove Claude project entries for folders that no longer exist on disk.
        This cleans up both ~/.claude.json and ~/.claude/projects/.
      </p>

      {/* Scan button */}
      <div className="mt-4">
        <button
          onClick={handleScan}
          disabled={scanMutation.isPending}
          className="flex cursor-pointer items-center gap-2 rounded-lg bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          Scan for Non-Existent Projects
        </button>
      </div>

      {/* Results */}
      {scannedProjects.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-neutral-400">
              Found {scannedProjects.length} project
              {scannedProjects.length === 1 ? '' : 's'} with non-existent paths
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="cursor-pointer text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <span className="text-neutral-600">|</span>
              <button
                onClick={handleSelectNone}
                className="cursor-pointer text-xs text-blue-400 hover:text-blue-300"
              >
                Select none
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-lg border border-neutral-700 bg-neutral-800/50">
            {scannedProjects.map((project) => (
              <label
                key={project.path}
                className="flex cursor-pointer items-center gap-3 border-b border-neutral-700 px-4 py-2 last:border-b-0 hover:bg-neutral-700/50"
              >
                <input
                  type="checkbox"
                  checked={selectedPaths.has(project.path)}
                  onChange={() => handleToggle(project.path)}
                  className="h-4 w-4 rounded border-neutral-600 bg-neutral-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-neutral-800"
                />
                <span className="flex-1 truncate font-mono text-sm text-neutral-300">
                  {project.path}
                </span>
                <span className="text-xs text-neutral-500">
                  {project.source === 'both' ? 'json + folder' : project.source}
                </span>
              </label>
            ))}
          </div>

          {/* Cleanup button */}
          <div className="mt-4">
            <button
              onClick={handleCleanup}
              disabled={selectedPaths.size === 0 || cleanupMutation.isPending}
              className="flex cursor-pointer items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cleanupMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Remove Selected ({selectedPaths.size})
            </button>
          </div>
        </div>
      )}

      {/* No results message after scan */}
      {!scanMutation.isPending &&
        scanMutation.isSuccess &&
        scannedProjects.length === 0 && (
          <div className="mt-4 rounded-lg border border-neutral-700 bg-neutral-800/50 px-4 py-3">
            <span className="text-sm text-neutral-400">
              No projects with non-existent paths found. Everything is clean!
            </span>
          </div>
        )}

      {/* Success/Error message */}
      {cleanupMessage && (
        <div
          className={`mt-4 rounded-lg border px-4 py-3 ${
            cleanupMessage.type === 'success'
              ? 'border-green-700 bg-green-900/30 text-green-400'
              : 'border-red-700 bg-red-900/30 text-red-400'
          }`}
        >
          <span className="text-sm">{cleanupMessage.text}</span>
        </div>
      )}
    </div>
  );
}
