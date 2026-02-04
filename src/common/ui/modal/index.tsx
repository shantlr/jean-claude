import { X } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import { createPortal } from 'react-dom';
import FocusLock from 'react-focus-lock';
import { RemoveScroll } from 'react-remove-scroll';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';

export function Modal({
  isOpen,
  onClose,
  title,
  closeOnClickOutside = true,
  closeOnEscape = true,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  closeOnClickOutside?: boolean;
  closeOnEscape?: boolean;
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
            className="w-full max-w-md rounded-lg bg-neutral-800 shadow-xl"
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
            <div className="p-4">{children}</div>
          </div>
        </div>
      </RemoveScroll>
    </FocusLock>,
    document.body,
  );
}
