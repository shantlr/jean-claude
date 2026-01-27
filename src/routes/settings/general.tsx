import { createFileRoute } from '@tanstack/react-router';
import { Check, FolderOpen } from 'lucide-react';
import { useState } from 'react';

import {
  useEditorSetting,
  useUpdateEditorSetting,
  useAvailableEditors,
} from '@/hooks/use-settings';
import { api } from '@/lib/api';

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
    </div>
  );
}
