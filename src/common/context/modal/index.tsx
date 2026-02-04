import clsx from 'clsx';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { Modal } from '@/common/ui/modal';

import type {
  ConfirmModalOptions,
  ErrorModalOptions,
  InfoModalOptions,
  ModalContextValue,
  QueuedModal,
} from './types';

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueuedModal[]>([]);

  const currentModal = queue[0] ?? null;

  const addToQueue = useCallback(
    (type: QueuedModal['type'], options: QueuedModal['options']) => {
      const id = crypto.randomUUID();
      setQueue((q) => [...q, { id, type, options }]);
    },
    [],
  );

  const removeFromQueue = useCallback(() => {
    setQueue((q) => q.slice(1));
  }, []);

  const info = useCallback(
    (options: InfoModalOptions): void => {
      addToQueue('info', options);
    },
    [addToQueue],
  );

  const confirm = useCallback(
    (options: ConfirmModalOptions): void => {
      addToQueue('confirm', options);
    },
    [addToQueue],
  );

  const error = useCallback(
    (options: ErrorModalOptions): void => {
      addToQueue('error', options);
    },
    [addToQueue],
  );

  const value = useMemo(
    () => ({ info, confirm, error }),
    [info, confirm, error],
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      {currentModal && (
        <ModalRenderer modal={currentModal} onClose={removeFromQueue} />
      )}
    </ModalContext.Provider>
  );
}

type LoadingAction = 'confirm' | 'cancel' | 'close' | null;

function ModalRenderer({
  modal,
  onClose,
}: {
  modal: QueuedModal;
  onClose: () => void;
}) {
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const { type, options } = modal;

  const handleAsync = useCallback(
    async (action: LoadingAction, callback?: () => void | Promise<void>) => {
      if (!callback) {
        onClose();
        return;
      }

      const result = callback();
      if (result instanceof Promise) {
        setLoadingAction(action);
        try {
          await result;
        } finally {
          setLoadingAction(null);
        }
      }
      onClose();
    },
    [onClose],
  );

  const isLoading = loadingAction !== null;

  if (type === 'info') {
    const {
      title,
      content,
      onClose: onCloseCallback,
    } = options as InfoModalOptions;

    const handleClose = () => handleAsync('close', onCloseCallback);

    return (
      <Modal
        isOpen
        onClose={handleClose}
        title={title}
        closeOnClickOutside={!isLoading}
        closeOnEscape={!isLoading}
      >
        <div className="text-sm text-neutral-300">{content}</div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {loadingAction === 'close' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            OK
          </button>
        </div>
      </Modal>
    );
  }

  if (type === 'confirm') {
    const {
      title,
      content,
      confirmLabel = 'Confirm',
      cancelLabel = 'Cancel',
      variant = 'primary',
      onConfirm,
      onCancel,
    } = options as ConfirmModalOptions;

    const handleConfirm = () => handleAsync('confirm', onConfirm);
    const handleCancel = () => handleAsync('cancel', onCancel);

    return (
      <Modal
        isOpen
        onClose={handleCancel}
        title={title}
        closeOnClickOutside={!isLoading}
        closeOnEscape={!isLoading}
      >
        <div className="text-sm text-neutral-300">{content}</div>
        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700 disabled:opacity-50"
          >
            {loadingAction === 'cancel' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {cancelLabel}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            className={clsx(
              'flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50',
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500',
            )}
          >
            {loadingAction === 'confirm' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </Modal>
    );
  }

  if (type === 'error') {
    const {
      title,
      content,
      onClose: onCloseCallback,
    } = options as ErrorModalOptions;

    const handleClose = () => handleAsync('close', onCloseCallback);

    return (
      <Modal
        isOpen
        onClose={handleClose}
        title={title}
        closeOnClickOutside={!isLoading}
        closeOnEscape={!isLoading}
      >
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/10">
            <AlertCircle className="h-5 w-5 text-red-400" aria-hidden />
          </div>
          <div className="text-sm text-neutral-300">{content}</div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-md bg-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
          >
            {loadingAction === 'close' && (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            OK
          </button>
        </div>
      </Modal>
    );
  }

  return null;
}

export function useModal(): ModalContextValue {
  const context = useContext(ModalContext);
  if (!context) {
    throw new Error('useModal must be used within ModalProvider');
  }
  return context;
}

export type {
  ConfirmModalOptions,
  ErrorModalOptions,
  InfoModalOptions,
} from './types';
