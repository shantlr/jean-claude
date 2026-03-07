import {
  AlertTriangle,
  Check,
  Download,
  ExternalLink,
  Loader2,
  Search,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import {
  useAllManagedSkills,
  useInstallRegistrySkill,
  useRegistrySearch,
  useRegistrySkillContent,
} from '@/hooks/use-managed-skills';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { RegistrySkill } from '@shared/skill-types';

const SKILLS_SH_BASE = 'https://skills.sh';

function skillUrl(skill: RegistrySkill): string {
  return `${SKILLS_SH_BASE}/${skill.id}`;
}

function formatInstalls(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function BackendCheckbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-xs text-neutral-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-blue-500"
      />
      {label}
    </label>
  );
}

function RegistrySkillCard({
  skill,
  isSelected,
  isInstalled,
  onSelect,
}: {
  skill: RegistrySkill;
  isSelected: boolean;
  isInstalled: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-neutral-700 bg-neutral-800 hover:border-neutral-600'
      }`}
    >
      <div className="flex w-full items-center gap-2">
        <span className="truncate text-sm font-medium text-neutral-200">
          {skill.name}
        </span>
        {isInstalled && (
          <span className="ml-auto shrink-0 rounded bg-green-900/30 px-1.5 py-0.5 text-[10px] font-medium text-green-400">
            Installed
          </span>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        <span className="rounded bg-neutral-700 px-1.5 py-0.5 text-[10px] text-neutral-400">
          {formatInstalls(skill.installs)} installs
        </span>
        <span className="rounded bg-neutral-700/50 px-1.5 py-0.5 text-[10px] text-neutral-500">
          {skill.source}
        </span>
        <a
          href={skillUrl(skill)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="ml-auto rounded p-0.5 text-neutral-600 hover:bg-neutral-700 hover:text-neutral-400"
          title="View on skills.sh"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </button>
  );
}

function RegistrySkillPreview({
  skill,
  installedNames,
}: {
  skill: RegistrySkill;
  installedNames: Set<string>;
}) {
  const { data: content, isLoading: contentLoading } = useRegistrySkillContent(
    skill.source,
    skill.skillId,
  );
  const installMutation = useInstallRegistrySkill();
  const addToast = useToastStore((s) => s.addToast);

  const [enabledBackends, setEnabledBackends] = useState<
    Record<AgentBackendType, boolean>
  >({
    'claude-code': true,
    opencode: true,
  });

  const isAlreadyInstalled = installedNames.has(skill.name);
  const [justInstalled, setJustInstalled] = useState(false);

  const selectedBackends = useMemo(
    () =>
      (Object.entries(enabledBackends) as [AgentBackendType, boolean][])
        .filter(([, v]) => v)
        .map(([k]) => k),
    [enabledBackends],
  );

  const handleInstall = useCallback(async () => {
    if (selectedBackends.length === 0) return;
    try {
      await installMutation.mutateAsync({
        source: skill.source,
        skillId: skill.skillId,
        enabledBackends: selectedBackends,
      });
      setJustInstalled(true);
      addToast({
        message: `Installed "${skill.name}" successfully`,
        type: 'success',
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to install skill from registry';
      addToast({ message, type: 'error' });
    }
  }, [installMutation, skill, selectedBackends, addToast]);

  const installed = isAlreadyInstalled || justInstalled;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-3 space-y-2">
        <div className="text-base font-medium text-neutral-100">
          {content?.name || skill.name}
        </div>
        {content?.description && (
          <p className="text-sm text-neutral-400">{content.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded bg-neutral-700 px-2 py-1 text-neutral-300">
            {formatInstalls(skill.installs)} installs
          </span>
          <a
            href={skillUrl(skill)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded bg-neutral-700/50 px-2 py-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-300"
            title="View on skills.sh"
          >
            {skill.source}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Content preview */}
      <div className="mb-3 min-h-0 flex-1 overflow-hidden">
        <div className="mb-1.5 text-xs font-medium tracking-wide text-neutral-400 uppercase">
          Skill Content
        </div>
        {contentLoading ? (
          <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800/30 p-3 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading content...
          </div>
        ) : content ? (
          <pre className="h-full overflow-auto rounded-lg border border-neutral-700 bg-neutral-900/60 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap text-neutral-200">
            {content.content || 'No content found.'}
          </pre>
        ) : (
          <div className="rounded-lg border border-neutral-700 bg-neutral-800/30 p-3 text-sm text-neutral-500">
            Could not load skill content.
          </div>
        )}
      </div>

      {/* Install controls */}
      <div className="border-t border-neutral-700 pt-3">
        <div className="mb-2 flex gap-4">
          <BackendCheckbox
            label="Claude Code"
            checked={enabledBackends['claude-code']}
            onChange={(checked) =>
              setEnabledBackends((prev) => ({
                ...prev,
                'claude-code': checked,
              }))
            }
          />
          <BackendCheckbox
            label="OpenCode"
            checked={enabledBackends.opencode}
            onChange={(checked) =>
              setEnabledBackends((prev) => ({ ...prev, opencode: checked }))
            }
          />
        </div>
        <button
          type="button"
          onClick={handleInstall}
          disabled={
            installed ||
            installMutation.isPending ||
            selectedBackends.length === 0
          }
          className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            installed
              ? 'bg-green-900/30 text-green-400'
              : installMutation.isPending
                ? 'bg-blue-900/30 text-blue-300'
                : 'bg-blue-600 text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50'
          }`}
        >
          {installed ? (
            <>
              <Check className="h-4 w-4" />
              Installed
            </>
          ) : installMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Installing...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Install
            </>
          )}
        </button>
      </div>
    </div>
  );
}

// A broad query that returns the most popular skills sorted by install count.
// The skills.sh API requires ≥2 chars, so we use a short generic term.
const POPULAR_QUERY = 'skill';

export function SkillRegistryBrowser({ onClose }: { onClose: () => void }) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedSkill, setSelectedSkill] = useState<RegistrySkill | null>(
    null,
  );

  // When the user hasn't typed anything, show popular skills via the default query
  const activeQuery = debouncedQuery || POPULAR_QUERY;
  const isShowingPopular = !debouncedQuery;

  const {
    data: searchResult,
    isLoading: searchLoading,
    isError: searchError,
  } = useRegistrySearch(activeQuery);
  const { data: localSkills } = useAllManagedSkills();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Escape closes only this overlay (registered after settings overlay → higher LIFO priority)
  useRegisterKeyboardBindings('skill-registry-browser', {
    escape: () => {
      onClose();
      return true;
    },
  });

  // Set of installed skill names for "Installed" badge detection
  const installedNames = useMemo(() => {
    const names = new Set<string>();
    for (const s of localSkills ?? []) {
      names.add(s.name);
    }
    return names;
  }, [localSkills]);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/55">
      <div className="flex h-[80svh] w-[85svw] max-w-[1200px] flex-col rounded-lg border border-neutral-700 bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 className="text-lg font-semibold text-neutral-200">
            Browse Skills
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-neutral-700 px-4 py-3">
          <div className="flex items-center gap-2 rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-neutral-500" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search skills on skills.sh..."
              className="w-full bg-transparent text-sm text-neutral-200 placeholder-neutral-500 outline-none"
              autoFocus
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setSelectedSkill(null);
                }}
                className="cursor-pointer text-neutral-500 hover:text-neutral-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Body: Results grid + Preview pane */}
        <div className="flex min-h-0 flex-1">
          {/* Left: Results */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {searchLoading && (
              <div className="flex h-full items-center justify-center gap-2 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isShowingPopular
                  ? 'Loading popular skills...'
                  : 'Searching...'}
              </div>
            )}

            {!searchLoading && searchError && (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-neutral-500">
                <AlertTriangle className="h-5 w-5 text-yellow-500" />
                <span>
                  {isShowingPopular
                    ? 'Failed to load popular skills. Check your network connection.'
                    : `Failed to search for "${debouncedQuery}". Please try again.`}
                </span>
              </div>
            )}

            {!searchLoading &&
              !searchError &&
              searchResult &&
              searchResult.skills.length === 0 && (
                <div className="flex h-full items-center justify-center text-sm text-neutral-500">
                  No skills found for &quot;{debouncedQuery}&quot;
                </div>
              )}

            {!searchLoading &&
              searchResult &&
              searchResult.skills.length > 0 && (
                <div>
                  <div className="mb-3 text-xs text-neutral-500">
                    {isShowingPopular
                      ? 'Popular skills'
                      : `${searchResult.count} result${searchResult.count !== 1 ? 's' : ''}`}
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
                    {searchResult.skills.map((skill) => (
                      <RegistrySkillCard
                        key={skill.id}
                        skill={skill}
                        isSelected={selectedSkill?.id === skill.id}
                        isInstalled={installedNames.has(skill.name)}
                        onSelect={() => setSelectedSkill(skill)}
                      />
                    ))}
                  </div>
                </div>
              )}
          </div>

          {/* Right: Preview pane */}
          {selectedSkill && (
            <div className="w-[380px] shrink-0 overflow-y-auto border-l border-neutral-700 p-4">
              <RegistrySkillPreview
                key={selectedSkill.id}
                skill={selectedSkill}
                installedNames={installedNames}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-neutral-700 px-4 py-2">
          <span className="text-xs text-neutral-500">
            Powered by <span className="text-neutral-400">skills.sh</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-lg border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
