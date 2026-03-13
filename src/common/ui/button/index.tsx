import { Loader2 } from 'lucide-react';
import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type MouseEventHandler,
  useCallback,
  useRef,
  useState,
} from 'react';

type ButtonClickHandler = (
  event: MouseEvent<HTMLButtonElement>,
) => void | Promise<unknown>;

function isPromiseLike(
  value: unknown,
): value is PromiseLike<unknown> | Promise<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as PromiseLike<unknown>).then === 'function'
  );
}

export const Button = forwardRef<
  HTMLButtonElement,
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> & {
    onClick?: ButtonClickHandler;
    showLoader?: boolean;
    loading?: boolean;
  }
>(function Button(
  { onClick, disabled, showLoader = true, loading, children, ...buttonProps },
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

  return (
    <button
      ref={ref}
      {...buttonProps}
      disabled={disabled || isLoading}
      onClick={handleClick}
    >
      {showLoader && isLoading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
});
