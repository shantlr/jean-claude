import { ImagePlus, Pencil, X } from 'lucide-react';
import type React from 'react';
import type { ReactNode } from 'react';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import {
  EMPTY_MENTION_OPTIONS,
  MENTION_TEXTAREA_CLASS,
  MentionTextarea,
  type MentionOption,
} from '@/common/ui/mention-textarea';
import { MarkdownContent } from '@/features/agent/ui-markdown-content';
import {
  isVideoFile,
  VideoGifConverter,
} from '@/features/pull-request/ui-video-gif-converter';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import { formatLineRangeLabel } from '@/stores/utils-comment-store';
import type { PromptImagePart } from '@shared/agent-backend-types';

// ---------------------------------------------------------------------------
// Shared styling constants for inline comment UI
// ---------------------------------------------------------------------------

export const COMMENT_ACCENT = {
  bg: 'color-mix(in oklch, oklch(0.78 0.18 295) 8%, transparent)',
  bgLight: 'color-mix(in oklch, oklch(0.78 0.18 295) 6%, transparent)',
  border: 'oklch(0.78 0.18 295 / 0.15)',
  borderStrong: 'oklch(0.78 0.18 295 / 0.2)',
  bar: 'oklch(0.78 0.18 295)',
  barSoft: 'oklch(0.78 0.18 295 / 0.5)',
  text: 'oklch(0.65 0.15 295)',
  chipBg: 'color-mix(in oklch, oklch(0.78 0.18 295) 18%, transparent)',
  chipText: 'oklch(0.78 0.18 295)',
};

type InlineComposerImage = PromptImagePart & {
  placeholderMarkdown?: string;
};

function imageDataUrl(image: PromptImagePart) {
  return `data:${image.storageMimeType ?? image.mimeType};base64,${image.storageData ?? image.data}`;
}

function placeholderPattern(placeholderMarkdown: string) {
  const token = placeholderMarkdown.match(/jc-image:\/\/([^)]+)/)?.[1];
  return token
    ? new RegExp(`!\\[[^\\]]*\\]\\(jc-image:\\/\\/${token}\\)`, 'g')
    : null;
}

function markdownWithLocalImages(body: string, images: InlineComposerImage[]) {
  return images.reduce((current, image) => {
    if (!image.placeholderMarkdown) return current;
    const pattern = placeholderPattern(image.placeholderMarkdown);
    if (!pattern) return current;
    return current.replace(
      pattern,
      image.placeholderMarkdown.replace(
        /\]\([^)]*\)$/,
        `](${imageDataUrl(image)})`,
      ),
    );
  }, body);
}

// ---------------------------------------------------------------------------
// InlineCommentComposer — shared comment input form
// ---------------------------------------------------------------------------

export function InlineCommentComposer({
  lineStart,
  lineEnd,
  onSubmit,
  onCancel,
  renderBeforeTextarea,
  renderAfterActions,
  placeholder = 'Add a comment...',
  submitLabel = 'Add comment',
  canSubmitEmpty = false,
  initialBody = '',
  initialImages = [],
  allowImages = true,
  insertImagesInBody = false,
  isSubmitting = false,
  showCancel = true,
  mentionOptions = EMPTY_MENTION_OPTIONS,
  onSearchMentions,
  onBodyChange,
}: {
  lineStart: number;
  lineEnd?: number;
  onSubmit: (body: string, images: PromptImagePart[]) => void;
  onCancel: () => void;
  /** Rendered between the line label and the textarea (e.g. preset chips). */
  renderBeforeTextarea?: ReactNode;
  /** Rendered after the action buttons (e.g. hint text). */
  renderAfterActions?: ReactNode;
  placeholder?: string;
  submitLabel?: string;
  /**
   * When true the submit button is enabled even if the body is empty.
   * Useful when the parent tracks additional state (e.g. selected presets)
   * that makes an empty body valid.
   */
  canSubmitEmpty?: boolean;
  /** Initial body text (for editing existing comments). */
  initialBody?: string;
  /** Initial image attachments (for editing existing comments). */
  initialImages?: PromptImagePart[];
  /** Whether users can attach images to the comment. */
  allowImages?: boolean;
  /** Insert image markdown at the cursor instead of appending attachments. */
  insertImagesInBody?: boolean;
  /** Whether submit is in progress. */
  isSubmitting?: boolean;
  /** Whether to show cancel action. */
  showCancel?: boolean;
  /** People available for @ mention insertion. */
  mentionOptions?: MentionOption[];
  onSearchMentions?: (query: string) => Promise<MentionOption[]>;
  /** Called when the draft body text changes (for external persistence). */
  onBodyChange?: (body: string) => void;
}) {
  const [body, setBodyRaw] = useState(initialBody);

  const setBody = useCallback(
    (value: string | ((prev: string) => string)) => {
      setBodyRaw((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        onBodyChange?.(next);
        return next;
      });
    },
    [onBodyChange],
  );
  const [images, setImages] = useState<InlineComposerImage[]>(initialImages);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagesRef = useRef<InlineComposerImage[]>(initialImages);
  const imageTokenCounterRef = useRef(0);
  const bindingId = useId();

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const lineLabel = formatLineRangeLabel(lineStart, lineEnd);

  const insertTextAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        setBody((current) => `${current}${current ? '\n\n' : ''}${text}`);
        return;
      }

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      setBody(
        (current) => `${current.slice(0, start)}${text}${current.slice(end)}`,
      );
      requestAnimationFrame(() => {
        textarea.focus();
        const cursor = start + text.length;
        textarea.setSelectionRange(cursor, cursor);
      });
    },
    [setBody],
  );

  const handleImageAttach = useCallback(
    (image: PromptImagePart) => {
      if (!allowImages) return;
      if (imagesRef.current.length >= MAX_IMAGES) return;

      let nextImage: InlineComposerImage = image;

      if (insertImagesInBody) {
        imageTokenCounterRef.current += 1;
        const token = imageTokenCounterRef.current;
        const extension = image.mimeType.split('/')[1] || 'png';
        const fileName = image.filename || `image-${token}.${extension}`;
        const safeAltText = fileName.replace(/[[\]()\\]/g, '_');
        const placeholderMarkdown = `![${safeAltText}](jc-image://${token})`;

        insertTextAtCursor(placeholderMarkdown);
        nextImage = { ...image, placeholderMarkdown };
      }

      const nextImages = [...imagesRef.current, nextImage];
      imagesRef.current = nextImages;
      setImages(nextImages);
    },
    [allowImages, insertImagesInBody, insertTextAtCursor],
  );

  const handleImageRemove = useCallback(
    (index: number) => {
      const image = imagesRef.current[index];
      if (image?.placeholderMarkdown) {
        setBody((current) =>
          current.replace(image.placeholderMarkdown ?? '', ''),
        );
      }

      const nextImages = imagesRef.current.filter((_, i) => i !== index);
      imagesRef.current = nextImages;
      setImages(nextImages);
    },
    [setBody],
  );

  const handleSubmit = useCallback(() => {
    if (isSubmitting) return;
    const trimmed = body.trim();
    if (!trimmed && images.length === 0 && !canSubmitEmpty) return;
    onSubmit(trimmed, images);
  }, [body, images, canSubmitEmpty, isSubmitting, onSubmit]);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!allowImages) return;
      const files = Array.from(e.clipboardData.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      if (imageFiles.length === 0 && !nextVideoFile) return;
      e.preventDefault();
      const allowed = MAX_IMAGES - images.length;
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, handleImageAttach);
      }
      if (nextVideoFile && allowed > imageFiles.length)
        setVideoFile(nextVideoFile);
    },
    [allowImages, images.length, handleImageAttach],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!allowImages) return;
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      const allowed = MAX_IMAGES - images.length;
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, handleImageAttach);
      }
      if (nextVideoFile && allowed > imageFiles.length)
        setVideoFile(nextVideoFile);
    },
    [allowImages, images.length, handleImageAttach],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!allowImages) return;
      e.preventDefault();
    },
    [allowImages],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!allowImages) return;
      const files = Array.from(e.target.files ?? []);
      const nextVideoFile = files.find(isVideoFile);
      const allowed = MAX_IMAGES - images.length;
      for (const file of files
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, allowed)) {
        void processImageFile(file, handleImageAttach);
      }
      if (nextVideoFile && allowed > 0) setVideoFile(nextVideoFile);
      e.target.value = '';
    },
    [allowImages, images.length, handleImageAttach],
  );

  // Register cmd+enter and escape at the top of the keyboard binding stack.
  // Because the LIFO stack checks most-recently-registered first, these
  // bindings take priority over the overlay's cmd+enter while this component
  // is mounted. Each handler only fires when the composer textarea is focused.
  useRegisterKeyboardBindings(`inline-comment-composer-${bindingId}`, {
    'cmd+enter': () => {
      if (document.activeElement !== textareaRef.current) return false;
      handleSubmit();
      return true;
    },
    escape: () => {
      if (isSubmitting) return true;
      onCancel();
      return true;
    },
  });

  const isDisabled =
    isSubmitting || (!body.trim() && images.length === 0 && !canSubmitEmpty);
  const debouncedPreviewBody = useDebouncedValue(body, 300);
  const previewMarkdown = useMemo(
    () => markdownWithLocalImages(debouncedPreviewBody, images),
    [debouncedPreviewBody, images],
  );

  return (
    <div className="flex flex-col gap-2">
      {lineStart > 0 && (
        <span
          className="font-mono text-[10px]"
          style={{ color: COMMENT_ACCENT.text }}
        >
          {lineLabel}
        </span>
      )}

      {renderBeforeTextarea}

      <MentionTextarea
        ref={textareaRef}
        className={MENTION_TEXTAREA_CLASS}
        value={body}
        onChange={setBody}
        mentionOptions={mentionOptions}
        onSearchMentions={onSearchMentions}
        placeholder={placeholder}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        disabled={isSubmitting}
        minHeight={60}
      />

      {previewMarkdown.trim() && (
        <div className="border-glass-border/60 bg-bg-1/60 rounded border px-2.5 py-2">
          <div className="text-ink-4 mb-1 text-[10px] font-medium tracking-wide uppercase">
            Preview
          </div>
          <MarkdownContent
            content={previewMarkdown}
            imageClassName="max-h-64 object-contain"
            enableImageModal
          />
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((img, index) => (
            <div
              key={`${img.filename ?? 'img'}-${index}`}
              className="group relative"
            >
              <img
                src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                alt={img.filename || 'Attached image'}
                className="h-8 w-8 rounded border border-white/10 object-cover"
              />
              <button
                type="button"
                onClick={() => handleImageRemove(index)}
                className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60 text-white group-hover:flex"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="bg-acc text-acc-ink inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
          onClick={handleSubmit}
          disabled={isDisabled}
        >
          {submitLabel}
          <kbd className="rounded bg-white/20 px-1 py-px font-mono text-[9px]">
            {'\u2318\u21B5'}
          </kbd>
        </button>
        {allowImages && (
          <>
            <button
              type="button"
              className="text-ink-3 hover:text-ink-1 p-1"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES || isSubmitting}
              title="Attach image"
            >
              <ImagePlus className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </>
        )}
        {showCancel && (
          <button
            type="button"
            className="text-ink-3 hover:text-ink-1 rounded px-2 py-1 text-xs"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </button>
        )}
        {renderAfterActions}
      </div>
      <VideoGifConverter
        file={videoFile}
        onAttach={handleImageAttach}
        onClose={() => setVideoFile(null)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// InlineCommentBubble — shared comment display
// ---------------------------------------------------------------------------

const EMPTY_IMAGES: PromptImagePart[] = [];

export function InlineCommentBubble({
  lineStart,
  lineEnd,
  body,
  images,
  selectedText,
  onRemove,
  onEdit,
  renderHeaderExtras,
  renderExtraActions,
  renderFooter,
}: {
  lineStart: number;
  lineEnd?: number;
  body: string;
  images?: PromptImagePart[];
  /** Quoted text from the original content this comment was anchored to */
  selectedText?: string;
  onRemove?: () => void;
  /** Called with the new body text and images when the user saves an edit. */
  onEdit?: (newBody: string, newImages: PromptImagePart[]) => void;
  /** Extra elements in the header row (e.g. status pill, preset tags). */
  renderHeaderExtras?: ReactNode;
  /** Extra action buttons rendered alongside the default edit/remove buttons. */
  renderExtraActions?: ReactNode;
  /** Rendered below the body (e.g. agent response note). */
  renderFooter?: ReactNode;
}) {
  const currentImages = images ?? EMPTY_IMAGES;
  const lineLabel = formatLineRangeLabel(lineStart, lineEnd);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(body);
  const [editImages, setEditImages] =
    useState<PromptImagePart[]>(currentImages);
  const [editVideoFile, setEditVideoFile] = useState<File | null>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const bindingId = useId();

  const startEditing = useCallback(() => {
    setEditBody(body);
    setEditImages(currentImages);
    setIsEditing(true);
  }, [body, currentImages]);

  const cancelEditing = useCallback(() => {
    setIsEditing(false);
    setEditBody(body);
    setEditImages(currentImages);
  }, [body, currentImages]);

  const handleEditImageAttach = useCallback((image: PromptImagePart) => {
    setEditImages((prev) =>
      prev.length < MAX_IMAGES ? [...prev, image] : prev,
    );
  }, []);

  const handleEditPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const files = Array.from(e.clipboardData.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      if (imageFiles.length === 0 && !nextVideoFile) return;
      e.preventDefault();
      const allowed = MAX_IMAGES - editImages.length;
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, handleEditImageAttach);
      }
      if (nextVideoFile && allowed > imageFiles.length)
        setEditVideoFile(nextVideoFile);
    },
    [editImages.length, handleEditImageAttach],
  );

  const handleEditDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      const imageFiles = files.filter((f) => f.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      const allowed = MAX_IMAGES - editImages.length;
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, handleEditImageAttach);
      }
      if (nextVideoFile && allowed > imageFiles.length)
        setEditVideoFile(nextVideoFile);
    },
    [editImages.length, handleEditImageAttach],
  );

  const handleEditDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleEditFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      const nextVideoFile = files.find(isVideoFile);
      const allowed = MAX_IMAGES - editImages.length;
      for (const file of files
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, allowed)) {
        void processImageFile(file, handleEditImageAttach);
      }
      if (nextVideoFile && allowed > 0) setEditVideoFile(nextVideoFile);
      e.target.value = '';
    },
    [editImages.length, handleEditImageAttach],
  );

  const saveEdit = useCallback(() => {
    const trimmed = editBody.trim();
    const imagesChanged =
      editImages.length !== currentImages.length ||
      editImages.some((img, i) => img !== currentImages[i]);
    if (
      (!trimmed && editImages.length === 0) ||
      (!imagesChanged && trimmed === body)
    ) {
      cancelEditing();
      return;
    }
    onEdit?.(trimmed, editImages);
    setIsEditing(false);
  }, [editBody, editImages, body, currentImages, onEdit, cancelEditing]);

  const debouncedEditPreviewBody = useDebouncedValue(editBody, 300);
  const editPreviewMarkdown = useMemo(
    () => markdownWithLocalImages(debouncedEditPreviewBody, editImages),
    [debouncedEditPreviewBody, editImages],
  );

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing) {
      editTextareaRef.current?.focus();
    }
  }, [isEditing]);

  // Keyboard bindings for edit mode
  useRegisterKeyboardBindings(
    `inline-comment-edit-${bindingId}`,
    isEditing
      ? {
          'cmd+enter': () => {
            if (document.activeElement !== editTextareaRef.current)
              return false;
            saveEdit();
            return true;
          },
          escape: () => {
            cancelEditing();
            return true;
          },
        }
      : {},
  );

  return (
    <div className="group/bubble flex items-start gap-2 rounded px-3 py-1.5">
      {!selectedText && (
        <div
          className="mt-1 h-3 w-0.5 shrink-0 rounded-full"
          style={{ background: COMMENT_ACCENT.bar }}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {lineStart > 0 && (
            <span
              className="mr-2 font-mono text-[10px]"
              style={{ color: COMMENT_ACCENT.text }}
            >
              {lineLabel}
            </span>
          )}
          {renderHeaderExtras}
          <div className="flex-1" />
          {!isEditing && (onEdit || onRemove || renderExtraActions) && (
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/bubble:opacity-100">
              {onEdit && (
                <button
                  type="button"
                  aria-label="Edit comment"
                  className="text-ink-4 hover:text-ink-1 mt-0.5 shrink-0"
                  onClick={startEditing}
                >
                  <Pencil className="h-3 w-3" />
                </button>
              )}
              {onRemove && (
                <button
                  type="button"
                  aria-label="Remove comment"
                  className="text-ink-4 hover:text-ink-1 mt-0.5 shrink-0"
                  onClick={onRemove}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              {renderExtraActions}
            </div>
          )}
        </div>
        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              ref={editTextareaRef}
              className="bg-bg-2 text-ink-1 border-stroke-1 min-h-[48px] w-full resize-y rounded border px-2 py-1.5 text-xs focus:outline-none"
              value={editBody}
              onChange={(e) => setEditBody(e.target.value)}
              onPaste={handleEditPaste}
              onDrop={handleEditDrop}
              onDragOver={handleEditDragOver}
            />
            {editPreviewMarkdown.trim() && (
              <div className="border-glass-border/60 bg-bg-1/60 rounded border px-2.5 py-2">
                <div className="text-ink-4 mb-1 text-[10px] font-medium tracking-wide uppercase">
                  Preview
                </div>
                <MarkdownContent
                  content={editPreviewMarkdown}
                  imageClassName="max-h-64 object-contain"
                  enableImageModal
                />
              </div>
            )}
            {editImages.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {editImages.map((img, index) => (
                  <div
                    key={`${img.filename ?? 'img'}-${index}`}
                    className="group/thumb relative"
                  >
                    <img
                      src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                      alt={img.filename || 'Attached image'}
                      className="h-8 w-8 rounded border border-white/10 object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setEditImages((prev) =>
                          prev.filter((_, i) => i !== index),
                        )
                      }
                      className="absolute -top-1 -right-1 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-black/60 text-white group-hover/thumb:flex"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="bg-acc text-acc-ink inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium disabled:opacity-50"
                onClick={saveEdit}
                disabled={
                  (!editBody.trim() && editImages.length === 0) ||
                  (editBody.trim() === body &&
                    editImages.length === currentImages.length &&
                    editImages.every((img, i) => img === currentImages[i]))
                }
              >
                Save
                <kbd className="rounded bg-white/20 px-1 py-px font-mono text-[9px]">
                  {'\u2318\u21B5'}
                </kbd>
              </button>
              <button
                type="button"
                className="text-ink-3 hover:text-ink-1 p-1"
                onClick={() => editFileInputRef.current?.click()}
                disabled={editImages.length >= MAX_IMAGES}
                title="Attach image"
              >
                <ImagePlus className="h-3.5 w-3.5" />
              </button>
              <input
                ref={editFileInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                className="hidden"
                onChange={handleEditFileSelect}
              />
              <button
                type="button"
                className="text-ink-3 hover:text-ink-1 rounded px-2 py-1 text-xs"
                onClick={cancelEditing}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {selectedText && (
              <div
                className="text-ink-3 mb-1 border-l-2 pl-2 font-mono text-[10px] italic"
                style={{ borderColor: COMMENT_ACCENT.barSoft }}
              >
                <span className="line-clamp-2">{selectedText}</span>
              </div>
            )}
            <div className="text-ink-0 text-xs whitespace-pre-wrap">{body}</div>
            {currentImages.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {currentImages.map((img, index) => (
                  <img
                    key={`${img.filename ?? 'img'}-${index}`}
                    src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                    alt={img.filename || 'Attached image'}
                    className="h-8 w-8 rounded border border-white/10 object-cover"
                  />
                ))}
              </div>
            )}
          </>
        )}
        {renderFooter}
        <VideoGifConverter
          file={editVideoFile}
          onAttach={handleEditImageAttach}
          onClose={() => setEditVideoFile(null)}
        />
      </div>
    </div>
  );
}
