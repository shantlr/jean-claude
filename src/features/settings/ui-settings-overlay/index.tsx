import clsx from 'clsx';
import { ArrowLeft } from 'lucide-react';
import React, { useCallback, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { ProjectSettings } from '@/features/project/ui-project-settings';
import { AutocompleteSettings } from '@/features/settings/ui-autocomplete-settings';
import { AzureDevOpsTab } from '@/features/settings/ui-azure-devops-tab';
import { DebugDatabase } from '@/features/settings/ui-debug-database';
import { GeneralSettings } from '@/features/settings/ui-general-settings';
import { McpServersSettings } from '@/features/settings/ui-mcp-servers-settings';
import { TokensTab } from '@/features/settings/ui-tokens-tab';

import { useCurrentSettingsProject } from './use-current-settings-project';

type GlobalMenuItem =
  | 'general'
  | 'mcp-servers'
  | 'tokens'
  | 'azure-devops'
  | 'autocomplete'
  | 'debug';

type ProjectMenuItem =
  | 'details'
  | 'integrations'
  | 'run-commands'
  | 'mcp-overrides'
  | 'danger-zone';

const GLOBAL_MENU_ITEMS: { id: GlobalMenuItem; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'mcp-servers', label: 'MCP Servers' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'azure-devops', label: 'Azure DevOps' },
  { id: 'autocomplete', label: 'Autocomplete' },
  { id: 'debug', label: 'Debug' },
];

const PROJECT_MENU_ITEMS: { id: ProjectMenuItem; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'run-commands', label: 'Run Commands' },
  { id: 'mcp-overrides', label: 'MCP Overrides' },
  { id: 'danger-zone', label: 'Danger Zone' },
];

function GlobalContent({ menuItem }: { menuItem: GlobalMenuItem }) {
  switch (menuItem) {
    case 'general':
      return <GeneralSettings />;
    case 'mcp-servers':
      return <McpServersSettings />;
    case 'tokens':
      return <TokensTab />;
    case 'azure-devops':
      return <AzureDevOpsTab />;
    case 'autocomplete':
      return <AutocompleteSettings />;
    case 'debug':
      return <DebugDatabase />;
  }
}

export function SettingsOverlay({ onClose }: { onClose: () => void }) {
  const { currentProject } = useCurrentSettingsProject();

  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');
  const [globalMenuItem, setGlobalMenuItem] =
    useState<GlobalMenuItem>('general');
  const [projectMenuItem, setProjectMenuItem] =
    useState<ProjectMenuItem>('details');

  const contentRef = useRef<HTMLDivElement>(null);

  const hasProjectTab = currentProject !== null;

  // Register Escape to close
  useRegisterKeyboardBindings('settings-overlay', {
    escape: () => {
      onClose();
      return true;
    },
  });

  const handleBackdropClick = useCallback(() => {
    onClose();
  }, [onClose]);

  const handlePanelClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const handleProjectMenuClick = useCallback((item: ProjectMenuItem) => {
    setProjectMenuItem(item);
    // Scroll to the section in the project settings content
    // Use a short delay to allow React to render the content area
    setTimeout(() => {
      const el = document.getElementById(`project-${item}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }, 50);
  }, []);

  const handleProjectDeleted = useCallback(() => {
    onClose();
  }, [onClose]);

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleBackdropClick}
          tabIndex={-1}
          role="dialog"
        >
          <div
            className="flex h-[80svh] w-[90svw] max-w-[1280px] flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-900"
            onClick={handlePanelClick}
          >
            {/* Top bar with back arrow and tabs */}
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-700 px-4 py-3">
              <button
                onClick={onClose}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                aria-label="Close settings"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('global')}
                  className={clsx(
                    'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                    activeTab === 'global'
                      ? 'bg-neutral-700 text-neutral-100'
                      : 'text-neutral-400 hover:bg-neutral-800',
                  )}
                >
                  Global
                </button>

                {hasProjectTab && (
                  <button
                    onClick={() => setActiveTab('project')}
                    className={clsx(
                      'rounded px-3 py-1.5 text-sm font-medium transition-colors',
                      activeTab === 'project'
                        ? 'bg-neutral-700 text-neutral-100'
                        : 'text-neutral-400 hover:bg-neutral-800',
                    )}
                  >
                    Project: {currentProject.name}
                  </button>
                )}
              </div>
            </div>

            {/* Main body: sidebar + content */}
            <div className="flex min-h-0 flex-1">
              {/* Left sidebar menu */}
              <div className="w-48 shrink-0 p-3">
                {activeTab === 'global' && (
                  <nav className="flex flex-col gap-1">
                    {GLOBAL_MENU_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setGlobalMenuItem(item.id)}
                        className={clsx(
                          'rounded px-3 py-1.5 text-left text-sm transition-colors',
                          globalMenuItem === item.id
                            ? 'bg-neutral-700 font-medium text-neutral-100'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                )}

                {activeTab === 'project' && hasProjectTab && (
                  <nav className="flex flex-col gap-1">
                    {PROJECT_MENU_ITEMS.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => handleProjectMenuClick(item.id)}
                        className={clsx(
                          'rounded px-3 py-1.5 text-left text-sm transition-colors',
                          projectMenuItem === item.id
                            ? 'bg-neutral-700 font-medium text-neutral-100'
                            : 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </nav>
                )}
              </div>

              {/* Right content area */}
              <div ref={contentRef} className="flex-1 overflow-y-auto p-6">
                {activeTab === 'global' && (
                  <GlobalContent menuItem={globalMenuItem} />
                )}

                {activeTab === 'project' && hasProjectTab && (
                  <ProjectSettings
                    projectId={currentProject.id}
                    onProjectDeleted={handleProjectDeleted}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
