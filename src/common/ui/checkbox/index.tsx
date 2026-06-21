import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useId,
} from 'react';
import { Check } from 'lucide-react';
import clsx from 'clsx';



import {
  checkboxSizeClasses,
  type ComponentSize,
  sizeClasses,
} from '@/common/ui/styles';

export function CheckboxIndicator({
  size = 'md',
  checked,
  disabled,
  className,
}: {
  size?: ComponentSize;
  checked: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={clsx(
        checkboxSizeClasses[size],
        'peer-focus-visible:ring-acc flex shrink-0 items-center justify-center rounded-sm border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-offset-0',
        checked
          ? 'border-acc bg-acc text-white'
          : 'border-white/20 bg-white/[0.05] text-transparent',
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
        className,
      )}
    >
      {checked && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
    </span>
  );
}

export function Checkbox({
  size = 'md',
  checked,
  onChange,
  label,
  description,
  disabled,
  id: externalId,
  className,
  compact = false,
  ariaLabel,
  onClick,
  onKeyDown,
}: {
  size?: ComponentSize;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: ReactNode;
  description?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
  onClick?: (event: MouseEvent<HTMLLabelElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
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
      onClick={onClick}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.checked)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        className="peer sr-only"
      />
      <CheckboxIndicator
        size={size}
        checked={checked}
        disabled={disabled}
        className={label && !compact ? 'mt-0.5' : ''}
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
