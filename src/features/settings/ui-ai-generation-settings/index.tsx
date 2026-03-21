import { useCallback, useEffect, useRef } from 'react';

import { SLOT_DEFINITIONS, SlotRow } from '@/features/common/ui-ai-skill-slot';
import { useEnabledBackends } from '@/hooks/use-enabled-backends';
import {
  useAiSkillSlotsSetting,
  useUpdateAiSkillSlotsSetting,
} from '@/hooks/use-settings';
import type { AiSkillSlotConfig, AiSkillSlotKey } from '@shared/types';

export function AiGenerationSettings() {
  const { data: slots } = useAiSkillSlotsSetting();
  const updateSlots = useUpdateAiSkillSlotsSetting();
  const enabledBackends = useEnabledBackends();

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

  return (
    <div>
      <h2 className="text-lg font-semibold text-neutral-200">AI Generation</h2>
      <p className="mt-1 text-sm text-neutral-500">
        Configure AI-powered generation features. Each slot uses a backend,
        model, and optional skill to generate content. Slots that are not
        configured are disabled.
      </p>

      <div className="mt-4 space-y-2">
        {SLOT_DEFINITIONS.map((slot) => (
          <SlotRow
            key={slot.key}
            label={slot.label}
            description={slot.description}
            config={slots?.[slot.key] ?? null}
            enabledBackends={enabledBackends}
            onUpdate={(config) => handleUpdate(slot.key, config)}
          />
        ))}
      </div>
    </div>
  );
}
