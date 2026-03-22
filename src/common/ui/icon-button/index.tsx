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
import { Tooltip } from '@/common/ui/tooltip';
import { isPromiseLike } from '@/common/ui/utils';

type IconButtonClickHandler = (
  event: MouseEvent<HTMLButtonElement>,
) => void | Promise<unknown>;

export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClick?: IconButtonClickHandler;
    variant?: ButtonVariant;
    size?: ComponentSize;
    icon: ReactNode;
    tooltip?: string;
    loading?: boolean;
  }
>(function IconButton(
  {
    onClick,
    disabled,
    variant = 'ghost',
    size = 'md',
    icon,
    tooltip,
    loading,
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

  const button = (
    <button
      ref={ref}
      aria-label={tooltip}
      {...buttonProps}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        s.square,
        s.radius,
        v.base,
        !disabled && !isLoading && v.hover,
        !disabled && !isLoading && v.active,
        className,
      )}
    >
      {isLoading ? (
        <Loader2 className={clsx(s.icon, 'animate-spin')} aria-hidden />
      ) : (
        <span
          className={clsx(s.icon, 'shrink-0 [&>svg]:h-full [&>svg]:w-full')}
          aria-hidden
        >
          {icon}
        </span>
      )}
    </button>
  );

  if (tooltip) {
    return <Tooltip content={tooltip}>{button}</Tooltip>;
  }

  return button;
});
