import clsx from 'clsx';
import { forwardRef, type TextareaHTMLAttributes } from 'react';

import {
  inputBaseClasses,
  inputBorderClasses,
  sizeClasses,
  type ComponentSize,
} from '@/common/ui/styles';

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & {
    size?: ComponentSize;
    error?: boolean;
  }
>(function Textarea(
  { size = 'md', error, className, disabled, ...textareaProps },
  ref,
) {
  const s = sizeClasses[size];
  const borderClasses = error
    ? inputBorderClasses.error
    : inputBorderClasses.normal;

  return (
    <textarea
      ref={ref}
      disabled={disabled}
      className={clsx(
        'w-full resize-none',
        inputBaseClasses,
        borderClasses,
        s.text,
        s.px,
        s.py,
        s.radius,
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...textareaProps}
    />
  );
});
