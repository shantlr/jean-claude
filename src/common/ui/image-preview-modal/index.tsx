import { Modal } from '@/common/ui/modal';

export function ImagePreviewModal({
  isOpen,
  title,
  imageUrl,
  onClose,
}: {
  isOpen: boolean;
  title: string;
  imageUrl: string | null;
  onClose: () => void;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      contentClassName="p-4"
    >
      <div className="border-glass-border bg-bg-0/60 flex max-h-[70vh] items-center justify-center rounded-xl border p-4">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={title}
            className="max-h-[62vh] max-w-full rounded-lg object-contain shadow-2xl"
          />
        )}
      </div>
    </Modal>
  );
}
