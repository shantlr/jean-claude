import clsx from 'clsx';
import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  type ReactNode,
  useCallback,
  useRef,
  useState,
} from 'react';

import {
  buttonVariantClasses,
  sizeClasses,
  type ButtonVariant,
  type ComponentSize,
} from '@/common/ui/styles';
import { isPromiseLike } from '@/common/ui/utils';

type ButtonClickHandler = (
  event: MouseEvent<HTMLButtonElement>,
) => void | Promise<unknown>;

export const Button = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClick?: ButtonClickHandler;
    variant?: ButtonVariant;
    size?: ComponentSize;
    icon?: ReactNode;
    showLoader?: boolean;
    loading?: boolean;
    /** Whether the button is in an "active/selected" state. Used by the `tab` variant. */
    active?: boolean;
  }
>(function Button(
  {
    onClick,
    disabled,
    variant = 'secondary',
    size = 'md',
    icon,
    showLoader = true,
    loading,
    active: isSelected,
    children,
    className,
    ...buttonProps
  },
  ref,
) {
  const [internalLoading, setInternalLoading] = useState(false);
  const loadingRef = useRef(false);

  const handleClick = useCallback<MouseEventHandler<HTMLButtonElement>>(
    (event) => {
      if (!onClick || loadingRef.current) return;

      const result = onClick(event);
      if (!isPromiseLike(result)) return;

      loadingRef.current = true;
      setInternalLoading(true);

      void Promise.resolve(result).finally(() => {
        loadingRef.current = false;
        setInternalLoading(false);
      });
    },
    [onClick],
  );

  const isLoading = loading ?? internalLoading;
  const s = sizeClasses[size];
  const v = buttonVariantClasses[variant];
  const heightOrPy = s.height || s.py;
  const isUnstyled = variant === 'unstyled';

  return (
    <button
      ref={ref}
      {...buttonProps}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={clsx(
        'inline-flex items-center justify-center font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        !isUnstyled && heightOrPy,
        !isUnstyled && s.text,
        !isUnstyled && s.px,
        !isUnstyled && s.radius,
        !isUnstyled && s.gap,
        v.base,
        !disabled && !isLoading && v.hover,
        !disabled && !isLoading && v.active,
        isSelected && v.selected,
        !isSelected && v.unselected,
        className,
      )}
    >
      {showLoader && isLoading ? (
        <Loader2 className={clsx(s.icon, 'animate-spin')} aria-hidden />
      ) : icon ? (
        <span
          className={clsx(s.icon, 'shrink-0 [&>svg]:h-full [&>svg]:w-full')}
          aria-hidden
        >
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
});
