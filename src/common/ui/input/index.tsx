import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

import {
  inputBaseClasses,
  inputBorderClasses,
  sizeClasses,
  type ComponentSize,
} from '@/common/ui/styles';

export const Input = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
    size?: ComponentSize;
    icon?: ReactNode;
    error?: boolean;
  }
>(function Input(
  { size = 'md', icon, error, className, disabled, ...inputProps },
  ref,
) {
  const s = sizeClasses[size];
  const borderClasses = error
    ? inputBorderClasses.error
    : inputBorderClasses.normal;

  const heightOrPy = s.height || s.py;

  if (icon) {
    const iconPl = size === 'xs' || size === 'sm' ? 'pl-2' : 'pl-3';
    const inputPl = size === 'xs' || size === 'sm' ? 'pl-7' : 'pl-9';
    const inputPr = size === 'xs' || size === 'sm' ? 'pr-2' : 'pr-3';

    return (
      <div className={clsx('relative', className)}>
        <span
          className={clsx(
            'pointer-events-none absolute inset-y-0 left-0 flex items-center',
            iconPl,
          )}
        >
          <span
            className={clsx(
              s.icon,
              'shrink-0 text-neutral-500 [&>svg]:h-full [&>svg]:w-full',
            )}
            aria-hidden
          >
            {icon}
          </span>
        </span>
        <input
          ref={ref}
          disabled={disabled}
          className={clsx(
            'w-full',
            inputBaseClasses,
            borderClasses,
            heightOrPy,
            s.text,
            s.radius,
            inputPl,
            inputPr,
            'disabled:cursor-not-allowed disabled:opacity-50',
          )}
          {...inputProps}
        />
      </div>
    );
  }

  return (
    <input
      ref={ref}
      disabled={disabled}
      className={clsx(
        'w-full',
        inputBaseClasses,
        borderClasses,
        heightOrPy,
        s.text,
        s.px,
        s.radius,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...inputProps}
    />
  );
});
