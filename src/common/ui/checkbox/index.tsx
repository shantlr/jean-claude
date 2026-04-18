import clsx from 'clsx';
import { useId } from 'react';

import {
  checkboxSizeClasses,
  sizeClasses,
  type ComponentSize,
} from '@/common/ui/styles';

export function Checkbox({
  size = 'md',
  checked,
  onChange,
  label,
  description,
  disabled,
  id: externalId,
  className,
}: {
  size?: ComponentSize;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const generatedId = useId();
  const id = externalId ?? generatedId;
  const s = sizeClasses[size];

  return (
    <label
      htmlFor={id}
      className={clsx(
        'inline-flex items-start gap-2',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className={clsx(
          checkboxSizeClasses[size],
          'border-glass-border bg-glass-medium text-acc-ink focus:ring-acc shrink-0 rounded focus:ring-offset-0',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          // Vertically center with label text
          label ? 'mt-0.5' : '',
        )}
      />
      {(label || description) && (
        <div className="flex flex-col">
          {label && (
            <span className={clsx(s.text, 'text-ink-1 font-medium')}>
              {label}
            </span>
          )}
          {description && (
            <span className="text-ink-3 text-xs">{description}</span>
          )}
        </div>
      )}
    </label>
  );
}
