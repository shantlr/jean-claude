import clsx from 'clsx';

import type { BindingKey } from '../../context/keyboard-bindings/types';
import { formatKeyForDisplay } from '../../context/keyboard-bindings/utils';
import {
  getLayoutAwareDigit,
  useKeyboardLayout,
} from '../../context/keyboard-layout';

export function Kbd({
  shortcut,
  className,
}: {
  shortcut: BindingKey;
  className?: string;
}) {
  const layoutMap = useKeyboardLayout();

  // Format the key, replacing digits with layout-aware versions
  let display = formatKeyForDisplay(shortcut);

  // Replace digit display with layout-aware digits
  if (layoutMap) {
    display = display.replace(/[0-9]/g, (digit) =>
      getLayoutAwareDigit(layoutMap, digit).toUpperCase(),
    );
  }

  return (
    <kbd
      className={clsx(
        'rounded border border-neutral-600 bg-neutral-700/50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-400',
        className,
      )}
    >
      {display}
    </kbd>
  );
}
