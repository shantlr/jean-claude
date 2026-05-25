import { Sparkles, TextQuote } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ListDetailLayout,
  ListGroupHeader,
  ListItemButton,
  ListPane,
} from '@/common/ui/list-detail-layout';
import {
  SLOT_DEFINITIONS,
  SlotDetail,
} from '@/features/common/ui-ai-skill-slot';
import { SummaryModelSettings } from '@/features/settings/ui-general-settings';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';
import {
  useAiSkillSlotsSetting,
  useUpdateAiSkillSlotsSetting,
} from '@/hooks/use-settings';
import type { AiSkillSlotConfig, AiSkillSlotKey } from '@shared/types';

const SUMMARY_MODEL_ITEMS = [
  { key: 'summary-model:claude-code', label: 'Claude Code Summary' },
  { key: 'summary-model:opencode', label: 'OpenCode Summary' },
] as const;

type SummaryModelSelection = (typeof SUMMARY_MODEL_ITEMS)[number]['key'];
type AiGenerationSelection = AiSkillSlotKey | SummaryModelSelection;

export function AiGenerationSettings() {
  const { data: slots } = useAiSkillSlotsSetting();
  const updateSlots = useUpdateAiSkillSlotsSetting();
  const enabledBackends = useEnabledBackends();
  const [selectedItem, setSelectedItem] = useState<AiGenerationSelection>(
    SLOT_DEFINITIONS[0].key,
  );

  // Use a ref to always access the latest slots value, avoiding stale closure
  const slotsRef = useRef(slots);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  const handleUpdate = useCallback(
    (slotKey: AiSkillSlotKey, config: AiSkillSlotConfig | null) => {
      const current = slotsRef.current ?? {};
      if (config === null) {
        const { [slotKey]: _, ...rest } = current;
        updateSlots.mutate(rest);
      } else {
        updateSlots.mutate({ ...current, [slotKey]: config });
      }
    },
    [updateSlots],
  );

  const selectedSlot = SLOT_DEFINITIONS.find(
    (slot) => slot.key === selectedItem,
  );
  const selectedSummaryBackend = selectedItem.startsWith('summary-model:')
    ? selectedItem.replace('summary-model:', '')
    : null;

  return (
    <ListDetailLayout
      list={
        <AiGenerationRail
          slots={slots ?? {}}
          selectedItem={selectedItem}
          onSelect={setSelectedItem}
        />
      }
      detail={
        selectedSlot ? (
          <SlotDetail
            key={selectedSlot.key}
            label={selectedSlot.label}
            description={selectedSlot.description}
            config={slots?.[selectedSlot.key] ?? null}
            enabledBackends={enabledBackends}
            onUpdate={(config) => handleUpdate(selectedSlot.key, config)}
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl">
              <SummaryModelSettings
                backend={
                  selectedSummaryBackend === 'opencode'
                    ? 'opencode'
                    : 'claude-code'
                }
              />
            </div>
          </div>
        )
      }
    />
  );
}

function AiGenerationRail({
  slots,
  selectedItem,
  onSelect,
}: {
  slots: Partial<Record<AiSkillSlotKey, AiSkillSlotConfig>>;
  selectedItem: AiGenerationSelection;
  onSelect: (item: AiGenerationSelection) => void;
}) {
  const [width, setWidth] = useState(280);

  return (
    <ListPane
      width={width}
      minWidth={220}
      maxWidth={420}
      onWidthChange={setWidth}
      title="AI Generation"
      count={SLOT_DEFINITIONS.length + SUMMARY_MODEL_ITEMS.length}
      headerSupplement={
        <p className="text-[12px] leading-relaxed text-white/45">
          Configure AI-powered content generation by feature.
        </p>
      }
    >
      <ListGroupHeader label={`Slots (${SLOT_DEFINITIONS.length})`} />
      {SLOT_DEFINITIONS.map((slot) => (
        <ListItemButton
          key={slot.key}
          label={slot.label}
          isActive={selectedItem === slot.key}
          isDimmed={!slots[slot.key]}
          size="compact"
          onClick={() => onSelect(slot.key)}
          renderIcon={({ isActive, isDimmed }) => (
            <Sparkles
              size={14}
              className="shrink-0"
              style={{
                color: isDimmed
                  ? 'oklch(0.4 0.01 280)'
                  : isActive
                    ? 'oklch(0.78 0.18 295)'
                    : 'oklch(0.78 0.16 295)',
                opacity: isDimmed ? 0.6 : 1,
              }}
            />
          )}
        />
      ))}

      <ListGroupHeader label="Shared" />
      {SUMMARY_MODEL_ITEMS.map((item) => (
        <ListItemButton
          key={item.key}
          label={item.label}
          isActive={selectedItem === item.key}
          size="compact"
          onClick={() => onSelect(item.key)}
          renderIcon={({ isActive }) => (
            <TextQuote
              size={14}
              className="shrink-0"
              style={{
                color: isActive
                  ? 'oklch(0.78 0.18 295)'
                  : 'oklch(0.78 0.16 295)',
              }}
            />
          )}
        />
      ))}
    </ListPane>
  );
}
