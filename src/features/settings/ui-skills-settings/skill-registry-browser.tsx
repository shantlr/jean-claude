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
import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Chip } from '@/common/ui/chip';
import { IconButton } from '@/common/ui/icon-button';
import { Input } from '@/common/ui/input';
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
    <Checkbox checked={checked} onChange={onChange} label={label} size="sm" />
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
    <Button
      type="button"
      onClick={onSelect}
      className={`flex cursor-pointer flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors ${
        isSelected
          ? 'border-acc bg-acc/10'
          : 'border-glass-border bg-bg-1 hover:border-glass-border-strong'
      }`}
    >
      <div className="flex w-full items-center gap-2">
        <span className="text-ink-1 truncate text-sm font-medium">
          {skill.name}
        </span>
        {isInstalled && (
          <Chip size="xs" color="green" className="ml-auto shrink-0">
            Installed
          </Chip>
        )}
      </div>

      <div className="flex w-full flex-wrap items-center gap-1.5">
        <Chip size="xs" color="neutral">
          {formatInstalls(skill.installs)} installs
        </Chip>
        <Chip
          size="xs"
          color="neutral"
          className="bg-glass-medium/50 text-ink-3"
        >
          {skill.source}
        </Chip>
        <a
          href={skillUrl(skill)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-ink-4 hover:bg-glass-medium hover:text-ink-2 ml-auto rounded p-0.5"
          title="View on skills.sh"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </Button>
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
        <div className="text-ink-0 text-base font-medium">
          {content?.name || skill.name}
        </div>
        {content?.description && (
          <p className="text-ink-2 text-sm">{content.description}</p>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Chip size="sm" color="neutral">
            {formatInstalls(skill.installs)} installs
          </Chip>
          <a
            href={skillUrl(skill)}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-glass-medium/50 text-ink-2 hover:bg-glass-medium hover:text-ink-1 inline-flex items-center gap-1 rounded px-2 py-1"
            title="View on skills.sh"
          >
            {skill.source}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      {/* Content preview */}
      <div className="mb-3 min-h-0 flex-1 overflow-hidden">
        <div className="text-ink-2 mb-1.5 text-xs font-medium tracking-wide uppercase">
          Skill Content
        </div>
        {contentLoading ? (
          <div className="border-glass-border bg-bg-1/30 text-ink-2 flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading content...
          </div>
        ) : content ? (
          <pre className="border-glass-border bg-bg-0/60 text-ink-1 h-full overflow-auto rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {content.content || 'No content found.'}
          </pre>
        ) : (
          <div className="border-glass-border bg-bg-1/30 text-ink-3 rounded-lg border p-3 text-sm">
            Could not load skill content.
          </div>
        )}
      </div>

      {/* Install controls */}
      <div className="border-glass-border border-t pt-3">
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
        <Button
          type="button"
          onClick={handleInstall}
          disabled={
            installed ||
            installMutation.isPending ||
            selectedBackends.length === 0
          }
          loading={installMutation.isPending}
          variant={installed ? 'secondary' : 'primary'}
          icon={installed ? <Check /> : <Download />}
          className={`w-full ${installed ? 'text-status-done bg-status-done/30' : ''}`}
        >
          {installed
            ? 'Installed'
            : installMutation.isPending
              ? 'Installing...'
              : 'Install'}
        </Button>
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
    <div className="bg-bg-0/55 fixed inset-0 z-60 flex items-center justify-center">
      <div className="border-glass-border bg-bg-0 flex h-[80svh] w-[85svw] max-w-[1200px] flex-col rounded-lg border">
        {/* Header */}
        <div className="border-glass-border flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-ink-1 text-lg font-semibold">Browse Skills</h2>
          <IconButton
            onClick={onClose}
            icon={<X />}
            tooltip="Close"
            size="sm"
          />
        </div>

        {/* Search */}
        <div className="border-glass-border border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search skills on skills.sh..."
              icon={<Search />}
              autoFocus
              className="flex-1"
            />
            {searchInput && (
              <IconButton
                onClick={() => {
                  setSearchInput('');
                  setSelectedSkill(null);
                }}
                icon={<X />}
                tooltip="Clear search"
                size="sm"
              />
            )}
          </div>
        </div>

        {/* Body: Results grid + Preview pane */}
        <div className="flex min-h-0 flex-1">
          {/* Left: Results */}
          <div className="min-w-0 flex-1 overflow-y-auto p-4">
            {searchLoading && (
              <div className="text-ink-2 flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />
                {isShowingPopular
                  ? 'Loading popular skills...'
                  : 'Searching...'}
              </div>
            )}

            {!searchLoading && searchError && (
              <div className="text-ink-3 flex h-full flex-col items-center justify-center gap-2 text-sm">
                <AlertTriangle className="text-status-run h-5 w-5" />
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
                <div className="text-ink-3 flex h-full items-center justify-center text-sm">
                  No skills found for &quot;{debouncedQuery}&quot;
                </div>
              )}

            {!searchLoading &&
              searchResult &&
              searchResult.skills.length > 0 && (
                <div>
                  <div className="text-ink-3 mb-3 text-xs">
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
            <div className="border-glass-border w-[380px] shrink-0 overflow-y-auto border-l p-4">
              <RegistrySkillPreview
                key={selectedSkill.id}
                skill={selectedSkill}
                installedNames={installedNames}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-glass-border flex items-center justify-between border-t px-4 py-2">
          <span className="text-ink-3 text-xs">
            Powered by <span className="text-ink-2">skills.sh</span>
          </span>
          <Button type="button" onClick={onClose} size="sm">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
