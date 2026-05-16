import { forwardRef } from 'react';

import type { KeyboardLayer } from '@/common/context/keyboard-bindings';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { Select, type SelectRef } from '@/common/ui/select';
import type { AgentBackendType } from '@shared/agent-backend-types';
import {
  getInteractionModeOptions,
  normalizeInteractionModeForBackend,
  type InteractionMode,
} from '@shared/types';

export const ModeSelector = forwardRef<
  SelectRef,
  {
    value: InteractionMode;
    onChange: (mode: InteractionMode) => void;
    backend?: AgentBackendType;
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
    layer?: KeyboardLayer;
  }
>(function ModeSelector(
  {
    value,
    onChange,
    backend = 'claude-code',
    disabled,
    shortcut,
    shortcutBehavior,
    side,
    className,
    layer,
  },
  ref,
) {
  const options = [...getInteractionModeOptions({ backend })];
  const normalizedValue = normalizeInteractionModeForBackend({
    backend,
    mode: value,
  });

  return (
    <Select
      ref={ref}
      value={normalizedValue}
      options={options}
      onChange={onChange}
      disabled={disabled}
      label={backend === 'opencode' ? 'Agent' : 'Interaction mode'}
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
      layer={layer}
    />
  );
});
