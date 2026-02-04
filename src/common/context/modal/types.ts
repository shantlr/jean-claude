import type { ReactNode } from 'react';

export interface InfoModalOptions {
  title: ReactNode;
  content: ReactNode;
  onClose?: () => void | Promise<void>;
}

export interface ConfirmModalOptions {
  title: ReactNode;
  content: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'primary' | 'danger';
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

export interface ErrorModalOptions {
  title: ReactNode;
  content: ReactNode;
  onClose?: () => void | Promise<void>;
}

export type ModalType = 'info' | 'confirm' | 'error';

export interface QueuedModal {
  id: string;
  type: ModalType;
  options: InfoModalOptions | ConfirmModalOptions | ErrorModalOptions;
}

export interface ModalContextValue {
  info: (options: InfoModalOptions) => void;
  confirm: (options: ConfirmModalOptions) => void;
  error: (options: ErrorModalOptions) => void;
}
