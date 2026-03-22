import { X } from 'lucide-react';
import { type ReactNode, type RefObject, useId } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';

const modalSizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
} as const;

export function Modal({
  isOpen,
  onClose,
  title,
  size = 'md',
  closeOnClickOutside = true,
  closeOnEscape = true,
  contentRef,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
  contentRef?: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const id = useId();

  useRegisterKeyboardBindings(
    `modal-${id}`,
    isOpen && closeOnEscape
      ? {
          escape: () => {
            onClose();
            return true;
          },
        }
      : {},
  );

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (closeOnClickOutside) {
      onClose();
    }
  };

  return createPortal(
    <FocusLock returnFocus>
      <RemoveScroll>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleBackdropClick}
        >
          <div
            ref={contentRef}
            className={`flex max-h-[85vh] w-full ${modalSizeClasses[size]} flex-col rounded-lg bg-neutral-800 shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
              {title ? (
                <h2 className="text-lg font-semibold text-neutral-100">
                  {title}
                </h2>
              ) : (
                <div />
              )}
              <button
                onClick={onClose}
                aria-label="Close dialog"
                className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto p-4">{children}</div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
