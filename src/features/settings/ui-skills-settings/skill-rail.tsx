import clsx from 'clsx';
import { Bot, Loader2, Plus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Chip } from '@/common/ui/chip';
import { useHorizontalResize } from '@/hooks/use-horizontal-resize';
import { useRegistrySearch } from '@/hooks/use-managed-skills';
import { formatCompactNumber } from '@/lib/numbers';
import { useSkillsRailWidth } from '@/stores/navigation';
import type { ManagedSkill, RegistrySkill } from '@shared/skill-types';

import { GroupHeader, SkillRow } from './skill-row';

export type RailMode = 'installed' | 'browse';

export function SkillRail({
  builtinSkills,
  mySkills,
  installedSkills,
  selectedPath,
  onSelect,
  onAdd,
  onCreateWithAgent,
  mode,
  onModeChange,
  selectedRegistrySkillId,
  onSelectRegistrySkill,
  installedNames,
}: {
  builtinSkills: ManagedSkill[];
  mySkills: ManagedSkill[];
  installedSkills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
  onAdd: () => void;
  onCreateWithAgent: () => void;
  mode: RailMode;
  onModeChange: (mode: RailMode) => void;
  selectedRegistrySkillId: string | null;
  onSelectRegistrySkill: (skill: RegistrySkill) => void;
  installedNames: Set<string>;
}) {
  const totalCount =
    builtinSkills.length + mySkills.length + installedSkills.length;

  const { width, setWidth, minWidth, maxWidth } = useSkillsRailWidth();
  const onWidthChange = useCallback((w: number) => setWidth(w), [setWidth]);
  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    onWidthChange,
  });

  return (
    <div
      className="bg-bg-0 relative flex min-h-0 shrink-0 flex-col"
      style={{ width }}
    >
      {/* Mode toggle header */}
      <div className="border-line flex shrink-0 items-center gap-1 overflow-hidden border-b px-2 py-1.5">
        <button
          type="button"
          onClick={() => onModeChange('installed')}
          className={clsx(
            'inline-flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            mode === 'installed'
              ? 'bg-acc-soft text-acc-ink'
              : 'text-ink-3 hover:text-ink-1 hover:bg-glass-light',
          )}
        >
          Installed
          <span className="bg-bg-2 text-ink-3 rounded px-1 py-0.5 font-mono text-[9px]">
            {totalCount}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onModeChange('browse')}
          className={clsx(
            'inline-flex shrink-0 items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors',
            mode === 'browse'
              ? 'bg-acc-soft text-acc-ink'
              : 'text-ink-3 hover:text-ink-1 hover:bg-glass-light',
          )}
        >
          <Search size={11} />
          Browse
        </button>
        <div className="min-w-0 flex-1" />
        {mode === 'installed' && (
          <div className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={onCreateWithAgent}
              className="text-ink-3 hover:bg-glass-light hover:text-ink-1 rounded p-1 transition-colors"
              title="Create with Agent"
            >
              <Bot size={13} />
            </button>
            <button
              type="button"
              onClick={onAdd}
              className="text-acc hover:bg-acc-soft rounded p-1 transition-colors"
              title="Add skill"
            >
              <Plus size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Content by mode */}
      {mode === 'installed' ? (
        <InstalledList
          builtinSkills={builtinSkills}
          mySkills={mySkills}
          installedSkills={installedSkills}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ) : (
        <BrowseList
          selectedRegistrySkillId={selectedRegistrySkillId}
          onSelectRegistrySkill={onSelectRegistrySkill}
          installedNames={installedNames}
        />
      )}

      {/* Resize handle */}
      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />
    </div>
  );
}

function InstalledList({
  builtinSkills,
  mySkills,
  installedSkills,
  selectedPath,
  onSelect,
}: {
  builtinSkills: ManagedSkill[];
  mySkills: ManagedSkill[];
  installedSkills: ManagedSkill[];
  selectedPath: string | null;
  onSelect: (skillPath: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto py-1">
      {builtinSkills.length > 0 && (
        <div>
          <GroupHeader label="Builtin" />
          {builtinSkills.map((skill) => (
            <SkillRow
              key={skill.skillPath}
              label={skill.name}
              isActive={selectedPath === skill.skillPath}
              isEnabled={Object.values(skill.enabledBackends).some(Boolean)}
              onClick={() => onSelect(skill.skillPath)}
            />
          ))}
        </div>
      )}

      {mySkills.length > 0 && (
        <div>
          <GroupHeader label="My Skills" accent />
          {mySkills.map((skill) => (
            <SkillRow
              key={skill.skillPath}
              label={skill.name}
              isActive={selectedPath === skill.skillPath}
              isEnabled={Object.values(skill.enabledBackends).some(Boolean)}
              onClick={() => onSelect(skill.skillPath)}
            />
          ))}
        </div>
      )}

      {installedSkills.length > 0 && (
        <div>
          <GroupHeader label="Installed" />
          {installedSkills.map((skill) => (
            <SkillRow
              key={skill.skillPath}
              label={skill.name}
              isActive={selectedPath === skill.skillPath}
              isEnabled={Object.values(skill.enabledBackends).some(Boolean)}
              onClick={() => onSelect(skill.skillPath)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const POPULAR_QUERY = 'skill';

function BrowseList({
  selectedRegistrySkillId,
  onSelectRegistrySkill,
  installedNames,
}: {
  selectedRegistrySkillId: string | null;
  onSelectRegistrySkill: (skill: RegistrySkill) => void;
  installedNames: Set<string>;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const activeQuery = debouncedQuery || POPULAR_QUERY;

  const { data: searchResult, isLoading } = useRegistrySearch(activeQuery);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Search input */}
      <div className="shrink-0 px-2 pt-2 pb-1">
        <div className="border-glass-border bg-bg-1 flex items-center gap-2 rounded px-2.5 py-1.5">
          <Search size={13} className="text-ink-4 shrink-0" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search skills.sh..."
            className="text-ink-1 placeholder-ink-4 w-full bg-transparent text-sm focus:outline-none"
            autoFocus
          />
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading && (
          <div className="text-ink-3 flex items-center justify-center gap-2 py-8 text-xs">
            <Loader2 size={14} className="animate-spin" />
            {debouncedQuery ? 'Searching...' : 'Loading popular...'}
          </div>
        )}

        {!isLoading && searchResult && searchResult.skills.length === 0 && (
          <p className="text-ink-3 py-8 text-center text-xs">
            No skills found.
          </p>
        )}

        {!isLoading && searchResult && searchResult.skills.length > 0 && (
          <div>
            <GroupHeader
              label={
                debouncedQuery ? `${searchResult.count} results` : 'Popular'
              }
            />
            {searchResult.skills.map((skill) => {
              const isInstalled = installedNames.has(skill.name);
              return (
                <SkillRow
                  key={skill.id}
                  label={skill.name}
                  isActive={selectedRegistrySkillId === skill.id}
                  suffix={
                    isInstalled ? (
                      <Chip size="xs" color="green" className="ml-auto">
                        ✓
                      </Chip>
                    ) : (
                      <span className="text-ink-4 ml-auto font-mono text-[10px]">
                        {formatCompactNumber(skill.installs)}
                      </span>
                    )
                  }
                  onClick={() => onSelectRegistrySkill(skill)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
