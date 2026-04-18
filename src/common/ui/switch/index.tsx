import clsx from 'clsx';
import { useId } from 'react';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
  id: externalId,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}) {
  const generatedId = useId();
  const id = externalId ?? generatedId;

  return (
    <label
      htmlFor={id}
      className={clsx(
        'inline-flex items-center gap-3',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className,
      )}
    >
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          'focus-visible:ring-acc focus-visible:ring-offset-bg-0 relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          disabled ? 'cursor-not-allowed' : 'cursor-pointer',
          checked ? 'bg-acc' : 'bg-bg-3',
        )}
      >
        <span
          className={clsx(
            'inline-block h-4 w-4 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </button>
      {label && <span className="text-ink-1 text-sm font-medium">{label}</span>}
    </label>
  );
}
