import { forwardRef } from 'react';

import { Select, type SelectRef } from '@/common/ui/select';
import type { BindingKey } from '@/common/context/keyboard-bindings/types';
import type { ComponentSize } from '@/common/ui/styles';
import type { KeyboardLayer } from '@/common/context/keyboard-bindings';
import { THINKING_EFFORT_OPTIONS } from '@shared/thinking-settings';
import type { ThinkingEffort } from '@shared/types';
import type { ThinkingEffortOption } from '@shared/thinking-settings';



export const ThinkingSelector = forwardRef<
  SelectRef,
  {
    value: ThinkingEffort;
    onChange: (effort: ThinkingEffort) => void;
    options?: ThinkingEffortOption[];
    disabled?: boolean;
    shortcut?: BindingKey | BindingKey[];
    shortcutBehavior?: 'cycle' | 'open';
    side?: 'top' | 'bottom';
    className?: string;
    size?: ComponentSize;
    layer?: KeyboardLayer;
  }
>(function ThinkingSelector(
  {
    value,
    onChange,
    options = THINKING_EFFORT_OPTIONS,
    disabled,
    shortcut,
    shortcutBehavior,
    side,
    className,
    size,
    layer,
  },
  ref,
) {
  return (
    <Select
      ref={ref}
      value={value}
      options={options}
      onChange={onChange as (v: string) => void}
      disabled={disabled}
      label="Think"
      shortcut={shortcut}
      shortcutBehavior={shortcutBehavior}
      side={side}
      className={className}
      size={size}
      layer={layer}
    />
  );
});
