import { forwardRef } from 'react';

import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import { Select, type SelectRef } from '@/common/ui/select';
import type { InteractionMode } from '@shared/types';

const MODES = [
  {
    value: 'ask' as const,
    label: 'Ask',
    description: 'All tools require approval',
  },
  {
    value: 'auto' as const,
    label: 'Auto',
    description: 'All tools auto-approved',
  },
  {
    value: 'plan' as const,
    label: 'Plan',
    description: 'Planning only, no execution',
  },
];

export const ModeSelector = forwardRef<
  SelectRef,
  {
    value: InteractionMode;
    onChange: (mode: InteractionMode) => void;
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
  }
>(function ModeSelector(
  { value, onChange, disabled, shortcut, shortcutBehavior, side, className },
  ref,
) {
  return (
    <Select
      ref={ref}
      value={value}
      options={MODES}
      onChange={onChange}
      disabled={disabled}
      label="Interaction mode"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
    />
  );
});
