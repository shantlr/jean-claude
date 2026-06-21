import {
  KeyboardLayerProvider,
  useKeyboardLayer,
} from '@/common/context/keyboard-bindings';
import { Button } from '@/common/ui/button';
import { Kbd } from '@/common/ui/kbd';
import { Modal } from '@/common/ui/modal';
import { useCommands } from '@/common/hooks/use-commands';



export function PushConfirmDialog({
  isOpen,
  onClose,
  onCommitAndPush,
  onPushOnly,
  showPushOnly,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCommitAndPush: () => void;
  onPushOnly?: () => void;
  showPushOnly: boolean;
  isPending: boolean;
}) {
  const layer = useKeyboardLayer('dialog', { exclusive: isOpen });

  const handleCommitAndPush = () => {
    if (isPending) return;
    onCommitAndPush();
  };

  const handlePushOnly = () => {
    if (isPending || !onPushOnly) return;
    onPushOnly();
  };

  useCommands(
    'push-confirm-dialog',
    [
      isOpen && {
        label: 'Commit And Push',
        shortcut: 'cmd+enter',
        hideInCommandPalette: true,
        handler: () => {
          handleCommitAndPush();
        },
      },
    ],
    { layer },
  );

  if (!isOpen) return null;

  return (
    <KeyboardLayerProvider layer={layer}>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title="Commit and Push Changes"
        closeOnClickOutside={!isPending}
        closeOnEscape={!isPending}
      >
        <p className="text-ink-1 mb-4 text-sm">
          You have uncommitted changes. Commit all current changes with an
          automatic message and then push this branch to update the pull
          request?
        </p>

        <div className="flex justify-end gap-3">
          <Button
            onClick={onClose}
            disabled={isPending}
            variant="ghost"
            size="md"
          >
            Cancel
          </Button>
          {showPushOnly && onPushOnly ? (
            <Button
              onClick={handlePushOnly}
              loading={isPending}
              disabled={isPending}
              variant="secondary"
              size="md"
            >
              Push Existing Commits
            </Button>
          ) : null}
          <Button
            onClick={handleCommitAndPush}
            loading={isPending}
            disabled={isPending}
            variant="primary"
            size="md"
          >
            Commit & Push
            <Kbd shortcut="cmd+enter" />
          </Button>
        </div>
      </Modal>
    </KeyboardLayerProvider>
  );
}
