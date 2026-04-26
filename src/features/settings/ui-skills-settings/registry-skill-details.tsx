import { Check, Download, ExternalLink, Loader2, Wand2 } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '@/common/ui/button';
import { Checkbox } from '@/common/ui/checkbox';
import { Chip } from '@/common/ui/chip';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import {
  useInstallRegistrySkill,
  useRegistrySkillContent,
} from '@/hooks/use-managed-skills';
import { formatCompactNumber } from '@/lib/numbers';
import { useToastStore } from '@/stores/toasts';
import type { AgentBackendType } from '@shared/agent-backend-types';
import type { RegistrySkill } from '@shared/skill-types';

const SKILLS_SH_BASE = 'https://skills.sh';

export function RegistrySkillDetails({
  skill,
  installedNames,
  onInstalled,
}: {
  skill: RegistrySkill;
  installedNames: Set<string>;
  onInstalled?: () => void;
}) {
  const { data: content, isLoading } = useRegistrySkillContent(
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
  const [justInstalled, setJustInstalled] = useState(false);

  const isAlreadyInstalled = installedNames.has(skill.name);
  const installed = isAlreadyInstalled || justInstalled;

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
      onInstalled?.();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to install skill from registry';
      addToast({ message, type: 'error' });
    }
  }, [installMutation, skill, selectedBackends, addToast, onInstalled]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-black/[0.18]">
      {/* ── Header ── */}
      <div className="border-line-soft flex shrink-0 items-center gap-3 border-b px-5 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <Wand2 size={16} className="text-acc-ink shrink-0" />
          <div className="text-ink-0 min-w-0 truncate text-sm font-semibold tracking-tight">
            {content?.name || skill.name}
          </div>
        </div>
        {installed && (
          <Chip size="xs" color="green">
            Installed
          </Chip>
        )}
      </div>

      {/* ── Metadata strip ── */}
      <div className="border-line-soft flex shrink-0 flex-wrap items-center gap-3 border-b bg-black/[0.12] px-5 py-2.5">
        <Chip size="xs" color="neutral">
          {formatCompactNumber(skill.installs)} installs
        </Chip>
        <a
          href={`${SKILLS_SH_BASE}/${skill.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-ink-3 hover:text-ink-1 inline-flex items-center gap-1 text-xs transition-colors"
        >
          {skill.source}
          <ExternalLink size={11} />
        </a>
        {content?.description && (
          <>
            <div className="flex-1" />
            <span className="text-ink-3 text-xs">{content.description}</span>
          </>
        )}
      </div>

      {/* ── Body ── */}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto p-5">
        {isLoading && (
          <div className="text-ink-3 flex flex-1 items-center justify-center gap-2 text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading content...
          </div>
        )}
        {!isLoading && content && (
          <div className="mx-auto w-full max-w-2xl text-xs leading-relaxed">
            <MarkdownContent content={content.content || 'No content found.'} />
          </div>
        )}
        {!isLoading && !content && (
          <p className="text-ink-3 py-8 text-center text-sm">
            Could not load skill content.
          </p>
        )}
      </div>

      {/* ── Install footer ── */}
      <div className="border-line-soft flex shrink-0 items-center gap-4 border-t bg-black/[0.12] px-5 py-3">
        <Checkbox
          checked={enabledBackends['claude-code']}
          onChange={(checked) =>
            setEnabledBackends((prev) => ({ ...prev, 'claude-code': checked }))
          }
          label="Claude Code"
          size="sm"
        />
        <Checkbox
          checked={enabledBackends.opencode}
          onChange={(checked) =>
            setEnabledBackends((prev) => ({ ...prev, opencode: checked }))
          }
          label="OpenCode"
          size="sm"
        />
        <div className="flex-1" />
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
          size="sm"
          icon={installed ? <Check size={13} /> : <Download size={13} />}
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
