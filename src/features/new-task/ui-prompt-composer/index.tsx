import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Eye,
  FilePlus,
  ImageIcon,
  MessageSquare,
  Paperclip,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';


import type { AzureDevOpsWorkItem, WorkItemComment } from '@/lib/api';
import {
  buildAttachedFilesXml,
  MAX_FILES,
  processAttachmentFile,
  processAttachmentPath,
} from '@/lib/file-attachment-utils';
import {
  isVideoFile,
  VideoGifConverter,
} from '@/features/common/ui-video-gif-converter';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import type { ProjectFeatureMap, PromptSnippet } from '@shared/types';
import type {
  PromptFilePart,
  PromptImagePart,
} from '@shared/agent-backend-types';
import {
  resolveSnippetTemplate,
  type SnippetVariableContext,
} from '@/lib/resolve-snippet-template';
import { Checkbox } from '@/common/ui/checkbox';
import { expandFeatureReferencesInPrompt } from '@/lib/prompt-feature-context';
import { FileEditorDialog } from '@/features/common/ui-file-editor-dialog';
import { formatBytes } from '@/lib/format-bytes';
import { HandlebarsEditor } from '@/common/ui/handlebars-editor';
import { Kbd } from '@/common/ui/kbd';
import { useToastStore } from '@/stores/toasts';



import { useLatestRef } from '@/hooks/use-latest-ref';
export function getWorkItemCommentSelectionId(
  comment: WorkItemComment,
): string {
  return `${comment.workItemId}:${comment.id}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/**
 * Azure DevOps attachment URL pattern (global, for matchAll extraction).
 */
const AZURE_IMAGE_URL_PATTERN =
  /https:\/\/(?:dev\.azure\.com|[^\s"'<>]+\.visualstudio\.com)\/[^"'\s<>]*\/_apis\/wit\/attachments\/[^"'\s<>]*/gi;

/** File extensions recognized as images in Azure DevOps attachment URLs. */
const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg|tiff?)$/i;

/** Check whether an attachment URL points to an image (by fileName param or path). */
function isImageAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const fileName = parsed.searchParams.get('fileName');
    if (fileName) return IMAGE_EXTENSIONS.test(fileName);
    // Fall back to checking the pathname
    return IMAGE_EXTENSIONS.test(parsed.pathname);
  } catch {
    return false;
  }
}

/**
 * Extracts unique Azure DevOps image URLs from work item HTML fields.
 * Looks at both description and reproSteps. Filters out non-image attachments.
 */
export function extractWorkItemImageUrls(
  workItems: AzureDevOpsWorkItem[],
): string[] {
  const urls = new Set<string>();

  for (const workItem of workItems) {
    const { description, reproSteps } = workItem.fields;

    for (const html of [description, reproSteps]) {
      if (!html) continue;
      const matches = html.matchAll(AZURE_IMAGE_URL_PATTERN);
      for (const match of matches) {
        if (isImageAttachmentUrl(match[0])) {
          urls.add(match[0]);
        }
      }
    }
  }

  return [...urls];
}

// Generate initial prompt template from selected work items
export function generateInitialTemplate(workItemIds: string[]): string {
  const header =
    workItemIds.length === 1
      ? 'Implement the following work item:'
      : 'Implement the following work items:';

  const placeholders = workItemIds.map((id) => `{#${id}}`).join('\n\n');

  return `${header}\n\n${placeholders}`;
}

/**
 * Tags we keep from work item HTML. Everything else is stripped (content kept).
 * - Headings: h1-h6
 * - Inline formatting: b, strong, i, em, u, s, code
 * - Block formatting: p, pre, blockquote
 * - Line breaks: br converted to newline
 * - Lists: ul/ol/li converted to markdown lists
 * - Links: a (href preserved)
 * - Color: span (style preserved for color)
 */
const ALLOWED_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'code',
  'p',
  'pre',
  'blockquote',
  'a',
  'span',
]);

/** Attributes to keep per tag. Tags not listed here get all attributes stripped. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href']),
  span: new Set(['style']),
};

/**
 * CSS properties with semantic/visual meaning worth preserving.
 * Layout/box-model properties (box-sizing, padding, margin, display, float,
 * position, width, height, etc.) are stripped — they're presentation artifacts
 * from the source editor, not meaningful content styling.
 */
const SEMANTIC_STYLE_PROPS = new Set([
  'color',
  'background-color',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-decoration-line',
  'text-align',
]);

/**
 * Filter an inline style string to only semantic CSS properties.
 * Returns the filtered style string, or empty string if nothing survives.
 */
function filterSemanticStyles(style: string): string {
  const kept: string[] = [];
  // Split on semicolons and check each declaration
  for (const decl of style.split(';')) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    if (SEMANTIC_STYLE_PROPS.has(prop)) {
      kept.push(decl.trim());
    }
  }
  return kept.join('; ');
}

/**
 * Convert HTML lists (ul/ol) to markdown-style lists.
 * Handles nested lists by processing innermost first.
 */
function convertListsToMarkdown(html: string, indent = ''): string {
  // Process innermost lists first (no nested ul/ol inside)
  const listRegex = /<(ul|ol)\b[^>]*>((?:(?!<\/?(?:ul|ol)\b)[\s\S])*?)<\/\1>/gi;

  let result = html;
  let prev;
  do {
    prev = result;
    let olCounter = 0;
    result = result.replace(
      listRegex,
      (_match, listType: string, content: string) => {
        const isOrdered = listType.toLowerCase() === 'ol';
        olCounter = 0;

        // Extract <li> contents
        const items: string[] = [];
        const liRegex = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
        let liMatch;
        while ((liMatch = liRegex.exec(content)) !== null) {
          const itemContent = liMatch[1].trim();
          if (isOrdered) {
            olCounter++;
            items.push(`${indent}${olCounter}. ${itemContent}`);
          } else {
            items.push(`${indent}- ${itemContent}`);
          }
        }

        return '\n' + items.join('\n') + '\n';
      },
    );
  } while (result !== prev);

  return result;
}

/**
 * Simplify work item HTML: keep only semantic tags, strip everything else.
 * Azure attachment `<img>` tags are also removed (images extracted separately).
 */
function simplifyHtml(html: string): string {
  // Convert lists to markdown before stripping tags
  let result = convertListsToMarkdown(html);

  // Remove <style> and <script> blocks entirely (tag + content)
  result = result.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '');

  result = result.replace(
    /<\/?([a-z][a-z0-9]*)\b([^>]*)?\/?>/gi,
    (match, tag: string, attrsStr: string | undefined) => {
      const lowerTag = tag.toLowerCase();

      // Always strip img tags — images extracted separately
      if (lowerTag === 'img') return '';

      // Convert <br> to newline
      if (lowerTag === 'br') return '\n';

      if (!ALLOWED_TAGS.has(lowerTag)) return '';

      // Closing tag — no attrs needed
      if (match.startsWith('</')) return `</${lowerTag}>`;

      // Filter attributes to only allowed ones
      const allowedAttrSet = ALLOWED_ATTRS[lowerTag];
      if (!allowedAttrSet || !attrsStr?.trim()) {
        const selfClose = match.endsWith('/>') ? ' /' : '';
        return `<${lowerTag}${selfClose}>`;
      }

      // Parse and filter attributes
      const keptAttrs: string[] = [];
      const attrRegex = /([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
        const attrName = attrMatch[1].toLowerCase();
        const attrValue = attrMatch[2] ?? attrMatch[3];
        if (allowedAttrSet.has(attrName)) {
          if (attrName === 'style') {
            const filtered = filterSemanticStyles(attrValue);
            if (filtered) {
              keptAttrs.push(`style="${filtered}"`);
            }
          } else {
            keptAttrs.push(`${attrName}="${attrValue}"`);
          }
        }
      }

      const attrStr = keptAttrs.length > 0 ? ` ${keptAttrs.join(' ')}` : '';
      const selfClose = match.endsWith('/>') ? ' /' : '';
      return `<${lowerTag}${attrStr}${selfClose}>`;
    },
  );

  // Remove bare <span>/<span> tags (no attributes = no semantic value).
  // Walk the string tracking which spans are bare vs styled so we can
  // correctly strip bare closing tags even when they wrap styled spans.
  result = stripBareSpans(result);

  // Decode HTML entities to plain characters
  result = decodeHtmlEntities(result);

  return result.trim();
}

/**
 * Remove bare `<span>` / `</span>` tags while keeping styled ones.
 * Uses a stack to track which opening spans are bare vs styled,
 * so closing tags are correctly paired.
 */
function stripBareSpans(html: string): string {
  // Stack tracks whether each open span is bare (true) or styled (false)
  const stack: boolean[] = [];
  return html.replace(/<\/?span\b[^>]*>/gi, (match) => {
    if (match.startsWith('</')) {
      // Closing tag — strip if the matching opener was bare
      const isBare = stack.pop();
      return isBare ? '' : match;
    }
    // Opening tag — bare if it's exactly `<span>`
    const isBare = /^<span\s*>$/i.test(match);
    stack.push(isBare);
    return isBare ? '' : match;
  });
}

/** Common HTML entities and their replacements. */
const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&ndash;': '\u2013',
  '&mdash;': '\u2014',
  '&lsquo;': '\u2018',
  '&rsquo;': '\u2019',
  '&ldquo;': '\u201C',
  '&rdquo;': '\u201D',
  '&bull;': '\u2022',
  '&hellip;': '\u2026',
  '&copy;': '\u00A9',
  '&reg;': '\u00AE',
  '&trade;': '\u2122',
};

function decodeHtmlEntities(text: string): string {
  // Named entities
  let result = text.replace(/&[a-z]+;/gi, (entity) => {
    return HTML_ENTITIES[entity.toLowerCase()] ?? entity;
  });
  // Numeric entities: &#123; or &#x1F4A9;
  result = result.replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) =>
    String.fromCodePoint(parseInt(hex, 16)),
  );
  result = result.replace(/&#(\d+);/g, (_m, dec: string) =>
    String.fromCodePoint(parseInt(dec, 10)),
  );
  return result;
}

// Expand a single work item placeholder to full content
function expandWorkItem(
  workItem: AzureDevOpsWorkItem,
  comments?: WorkItemComment[],
): string {
  const { id, fields } = workItem;
  const { title, description, reproSteps } = fields;

  const cleanDescription = description ? simplifyHtml(description) : null;
  const cleanReproSteps = reproSteps ? simplifyHtml(reproSteps) : null;

  const bodySections: string[] = [`  <title>${escapeXml(title)}</title>`];

  if (cleanDescription) {
    bodySections.push('  <description>');
    bodySections.push(cleanDescription);
    bodySections.push('  </description>');
  }

  if (cleanReproSteps) {
    bodySections.push('  <repro_steps>');
    bodySections.push(cleanReproSteps);
    bodySections.push('  </repro_steps>');
  }

  const workItemComments = comments?.filter(
    (c) => c.workItemId === workItem.id,
  );
  if (workItemComments && workItemComments.length > 0) {
    bodySections.push('  <comments>');
    for (const comment of workItemComments) {
      const cleanComment = simplifyHtml(comment.text);
      const dateStr = comment.createdDate
        ? new Date(comment.createdDate).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })
        : '';
      bodySections.push(
        `    <comment by="${escapeXml(comment.createdBy)}" date="${dateStr}">`,
      );
      // Indent each line of the comment body
      const indentedComment = cleanComment
        .split('\n')
        .map((line) => (line.trim() ? `      ${line}` : ''))
        .filter(Boolean)
        .join('\n');
      bodySections.push(indentedComment);
      bodySections.push('    </comment>');
    }
    bodySections.push('  </comments>');
  }

  return [`<work_item id="${id}">`, ...bodySections, '</work_item>'].join('\n');
}

// Expand all placeholders in template to full content
export function expandTemplate(
  template: string,
  workItems: AzureDevOpsWorkItem[],
  comments?: WorkItemComment[],
): string {
  const workItemMap = new Map(workItems.map((wi) => [wi.id.toString(), wi]));

  // Replace each {#id} placeholder with expanded content
  return template.replace(/\{#(\d+)\}/g, (match, id) => {
    const workItem = workItemMap.get(id);
    if (!workItem) {
      return match; // Keep placeholder if work item not found
    }
    return expandWorkItem(workItem, comments);
  });
}

export function buildWorkItemSnippetContext({
  workItems,
  comments = [],
  testCasesByWorkItem,
}: {
  workItems: AzureDevOpsWorkItem[];
  comments?: WorkItemComment[];
  testCasesByWorkItem?: Record<
    number,
    Array<{
      id: number;
      title: string;
      steps?: Array<{ action: string; expectedResult: string }>;
    }>
  >;
}) {
  return workItems.map((wi) => ({
    id: wi.id.toString(),
    title: wi.fields.title,
    description: wi.fields.description
      ? simplifyHtml(wi.fields.description)
      : '',
    comments: comments
      .filter((comment) => comment.workItemId === wi.id)
      .map((comment) => ({
        author: comment.createdBy,
        date: comment.createdDate,
        body: simplifyHtml(comment.text),
      })),
    testCases: testCasesByWorkItem?.[wi.id] ?? [],
  }));
}

export function PromptComposer({
  template,
  workItems,
  onTemplateChange,
  onBack,
  images,
  isFetchingImages,
  onImageAttach,
  onImageRemove,
  files,
  onFileAttach,
  onFileRemove,
  projectRoot,
  comments,
  selectedCommentIds,
  onCommentToggle,
  onSelectAllComments,
  onDeselectAllComments,
  isLoadingComments,
  snippets,
  snippetVariableContext,
  testCasesByWorkItem,
  featureMap,
}: {
  template: string;
  workItems: AzureDevOpsWorkItem[];
  onTemplateChange: (template: string) => void;
  onBack: () => void;
  images?: PromptImagePart[];
  isFetchingImages?: boolean;
  onImageAttach?: (image: PromptImagePart) => void;
  onImageRemove?: (index: number) => void;
  files?: PromptFilePart[];
  onFileAttach?: (file: PromptFilePart) => void;
  onFileRemove?: (index: number) => void;
  projectRoot?: string | null;
  comments?: WorkItemComment[];
  selectedCommentIds?: string[];
  onCommentToggle?: (commentSelectionId: string) => void;
  onSelectAllComments?: () => void;
  onDeselectAllComments?: () => void;
  isLoadingComments?: boolean;
  snippets?: PromptSnippet[];
  snippetVariableContext?: SnippetVariableContext;
  featureMap?: ProjectFeatureMap | null;
  testCasesByWorkItem?: Record<
    number,
    Array<{
      id: number;
      title: string;
      steps?: Array<{ action: string; expectedResult: string }>;
    }>
  >;
}) {
  const [showComments, setShowComments] = useState(false);
  const [selectedSnippetId, setSelectedSnippetId] = useState<string | null>(
    null,
  );
  const [showSnippetDropdown, setShowSnippetDropdown] = useState(false);

  // Filter snippets to only enabled ones with newTask context
  const availableSnippets = useMemo(
    () => (snippets ?? []).filter((s) => s.enabled && s.contexts.newTask),
    [snippets],
  );

  const handleSnippetSelect = useCallback(
    (snippetId: string | null) => {
      setSelectedSnippetId(snippetId);
      setShowSnippetDropdown(false);
      if (snippetId) {
        const snippet = availableSnippets.find((s) => s.id === snippetId);
        if (snippet) {
          onTemplateChange(snippet.template);
        }
      } else {
        // Reset to default template
        const ids = workItems.map((wi) => wi.id.toString());
        onTemplateChange(generateInitialTemplate(ids));
      }
    },
    [availableSnippets, onTemplateChange, workItems],
  );

  // Filter to selected comments for preview
  const selectedComments = useMemo(
    () =>
      comments?.filter((c) =>
        selectedCommentIds?.includes(getWorkItemCommentSelectionId(c)),
      ) ?? [],
    [comments, selectedCommentIds],
  );

  // Expand template to preview — use Handlebars if template contains `{{`, else old {#id} regex
  const preview = useMemo(() => {
    let expanded: string;
    if (template.includes('{{')) {
      const workItemsContext = buildWorkItemSnippetContext({
        workItems,
        comments: selectedComments,
        testCasesByWorkItem,
      });
      expanded = resolveSnippetTemplate(template, {
        ...snippetVariableContext,
        workItems: workItemsContext,
      }).output;
    } else {
      expanded = expandTemplate(template, workItems, selectedComments);
    }

    return `${expandFeatureReferencesInPrompt({
      text: expanded,
      featureMap,
    })}${buildAttachedFilesXml(files ?? [])}`;
  }, [
    template,
    workItems,
    selectedComments,
    testCasesByWorkItem,
    snippetVariableContext,
    featureMap,
    files,
  ]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const addToast = useToastStore((s) => s.addToast);
  const showImageError = useCallback(
    (message: string) => addToast({ message, type: 'error' }),
    [addToast],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLElement>) => {
      if (!onImageAttach) return;

      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));
      const nextVideoFile = Array.from(e.clipboardData.files).find(isVideoFile);

      if (imageItems.length === 0 && !nextVideoFile) return;

      const currentCount = images?.length ?? 0;
      const allowed = MAX_IMAGES - currentCount;
      if (allowed <= 0) return;

      e.preventDefault();
      for (const item of imageItems.slice(0, allowed)) {
        const file = item.getAsFile();
        if (file) {
          void processImageFile(file, onImageAttach, showImageError).catch(
            (err) => {
              showImageError('Failed to process image');
              console.error('Failed to process pasted image:', err);
            },
          );
        }
      }
      if (nextVideoFile && allowed > imageItems.length) {
        setVideoFile(nextVideoFile);
      }
    },
    [onImageAttach, images, showImageError],
  );

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (!onImageAttach && !onFileAttach) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    [onImageAttach, onFileAttach],
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const related = e.relatedTarget as Node | null;
    if (related && e.currentTarget.contains(related)) return;
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const droppedFiles = Array.from(e.dataTransfer.files);

      if (onImageAttach) {
        const currentCount = images?.length ?? 0;
        const allowed = MAX_IMAGES - currentCount;
        if (allowed > 0) {
          const imageFiles = droppedFiles.filter((f) =>
            f.type.startsWith('image/'),
          );
          const nextVideoFile = droppedFiles.find(isVideoFile);
          for (const file of imageFiles.slice(0, allowed)) {
            void processImageFile(file, onImageAttach, showImageError).catch(
              (err) => {
                showImageError('Failed to process image');
                console.error('Failed to process dropped image:', err);
              },
            );
          }
          if (nextVideoFile && allowed > imageFiles.length) {
            setVideoFile(nextVideoFile);
          }
        }
      }

      // Handle non-image files
      if (onFileAttach && projectRoot) {
        const currentFileCount = files?.length ?? 0;
        const allowedFiles = MAX_FILES - currentFileCount;
        const nonImageFiles = droppedFiles.filter(
          (f) => !f.type.startsWith('image/') && !isVideoFile(f),
        );
        for (const file of nonImageFiles.slice(0, allowedFiles)) {
          void processAttachmentFile(
            file,
            projectRoot,
            onFileAttach,
            showImageError,
          );
        }
      }
    },
    [onImageAttach, onFileAttach, images, files, projectRoot, showImageError],
  );

  const handleFileSelect = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (!onImageAttach || !e.target.files) return;

      const currentCount = images?.length ?? 0;
      const allowed = MAX_IMAGES - currentCount;
      if (allowed <= 0) {
        e.target.value = '';
        return;
      }

      const files = Array.from(e.target.files);
      const imageFiles = files.filter((file) => file.type.startsWith('image/'));
      const nextVideoFile = files.find(isVideoFile);
      for (const file of imageFiles.slice(0, allowed)) {
        void processImageFile(file, onImageAttach, showImageError).catch(
          (err) => {
            showImageError('Failed to process image');
            console.error('Failed to process selected image:', err);
          },
        );
      }
      if (nextVideoFile && allowed > imageFiles.length) {
        setVideoFile(nextVideoFile);
      }
      e.target.value = '';
    },
    [onImageAttach, images, showImageError],
  );

  const handleOpenFilePicker = useCallback(async () => {
    if (!onFileAttach || !projectRoot) return;
    const currentFileCount = files?.length ?? 0;
    const allowed = MAX_FILES - currentFileCount;
    if (allowed <= 0) return;

    const selectedPaths = await window.api.dialog.openFiles();
    if (!selectedPaths) return;

    for (const sourcePath of selectedPaths.slice(0, allowed)) {
      void processAttachmentPath(
        sourcePath,
        projectRoot,
        onFileAttach,
        showImageError,
      );
    }
  }, [onFileAttach, files, projectRoot, showImageError]);

  const handleFileCreate = useCallback(
    async (filename: string, content: string) => {
      if (!onFileAttach || !projectRoot) return;
      try {
        const filePath = await window.api.fs.writeAttachmentFile(
          projectRoot,
          filename,
          content,
        );
        onFileAttach({ type: 'file', filePath, filename });
        setShowFileEditor(false);
      } catch (err) {
        showImageError(`Failed to create file: ${filename}`);
        console.error('Failed to create attachment file:', err);
      }
    },
    [onFileAttach, projectRoot, showImageError],
  );

  const handleTextareaDragOver = useCallback(
    (e: DragEvent<HTMLElement>) => {
      if (!onImageAttach && !onFileAttach) return;
      const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
      if (hasFiles) {
        e.preventDefault();
      }
    },
    [onImageAttach, onFileAttach],
  );

  const canAttachMore = (images?.length ?? 0) < MAX_IMAGES;
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      {/* Breadcrumb header */}
      <div
        className="flex shrink-0 items-center gap-2.5 px-[18px] py-3"
        style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
      >
        <button
          type="button"
          onClick={onBack}
          className="inline-flex cursor-pointer items-center gap-[5px] rounded-[5px] font-medium"
          style={{
            padding: '4px 9px',
            background: 'oklch(1 0 0 / 0.04)',
            border: '1px solid oklch(1 0 0 / 0.07)',
            color: 'oklch(0.78 0.01 280)',
            fontSize: '11.5px',
          }}
        >
          <ChevronLeft className="h-2.5 w-2.5" />
          Back to selection
          <Kbd shortcut="escape" />
        </button>
        <div className="flex-1" />
        <span className="text-ink-3 font-mono text-[10.5px] font-semibold tracking-wider uppercase">
          {workItems.length} work item{workItems.length !== 1 ? 's' : ''}
        </span>
        {workItems.slice(0, 4).map((wi) => (
          <span
            key={wi.id}
            className="inline-flex items-center gap-1 rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px]"
            style={{
              border: '1px solid oklch(1 0 0 / 0.07)',
              color: 'oklch(0.78 0.01 280)',
            }}
          >
            #{wi.id}
          </span>
        ))}
      </div>

      {/* Comment selection */}
      {comments && comments.length > 0 && (
        <div style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}>
          <button
            type="button"
            onClick={() => setShowComments(!showComments)}
            className="flex w-full items-center gap-2 px-[18px] py-2 text-left"
            style={{
              background: showComments ? 'oklch(1 0 0 / 0.02)' : 'transparent',
            }}
          >
            <MessageSquare className="text-ink-3 h-3.5 w-3.5" />
            <span className="text-ink-2 text-xs font-medium">Comments</span>
            <span className="text-ink-3 font-mono text-[10.5px]">
              {selectedCommentIds?.length ?? 0}/{comments.length} selected
            </span>
            <div className="flex-1" />
            <ChevronRight
              className="text-ink-3 h-3 w-3 transition-transform"
              style={{
                transform: showComments ? 'rotate(90deg)' : undefined,
              }}
            />
          </button>

          {showComments && (
            <div className="max-h-[200px] overflow-y-auto px-[18px] pb-3">
              {/* Select all / none buttons */}
              <div className="mb-2 flex gap-2">
                <button
                  type="button"
                  onClick={onSelectAllComments}
                  className="text-ink-3 hover:text-ink-1 text-[10.5px] font-medium"
                >
                  Select all
                </button>
                <span className="text-ink-3 text-[10.5px]">&middot;</span>
                <button
                  type="button"
                  onClick={onDeselectAllComments}
                  className="text-ink-3 hover:text-ink-1 text-[10.5px] font-medium"
                >
                  Select none
                </button>
              </div>

              {comments.map((comment) => {
                const commentSelectionId =
                  getWorkItemCommentSelectionId(comment);
                const isSelected =
                  selectedCommentIds?.includes(commentSelectionId) ?? false;
                const cleanText = simplifyHtml(comment.text)
                  .replace(/<[^>]*>/g, '')
                  .replace(/[ \t]+/g, ' ')
                  .replace(/\n{3,}/g, '\n\n')
                  .trim();
                return (
                  <div
                    key={commentSelectionId}
                    className="flex cursor-pointer items-start gap-2 rounded px-1 py-1.5 hover:bg-white/[0.03]"
                    onClick={() => onCommentToggle?.(commentSelectionId)}
                  >
                    <Checkbox
                      size="sm"
                      checked={isSelected}
                      onChange={() => onCommentToggle?.(commentSelectionId)}
                      onClick={(event) => event.stopPropagation()}
                      className="mt-0.5"
                      compact
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-ink-2 text-[11px] font-medium">
                          {comment.createdBy}
                        </span>
                        <span className="text-ink-3 text-[10px]">
                          {new Date(comment.createdDate).toLocaleDateString()}
                        </span>
                        <span className="text-ink-3 font-mono text-[10px]">
                          #{comment.workItemId}
                        </span>
                      </div>
                      <p className="text-ink-3 mt-0.5 text-[11px] leading-snug whitespace-pre-wrap">
                        {cleanText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {isLoadingComments && (
        <div
          className="flex items-center gap-2 px-[18px] py-2"
          style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
        >
          <span className="border-glass-border-strong border-t-ink-1 inline-block h-3 w-3 animate-spin rounded-full border-2" />
          <span className="text-ink-3 text-xs">Loading comments…</span>
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex min-h-0 flex-1">
        {/* Left: Template editor */}
        <div
          className="relative flex flex-1 flex-col overflow-hidden"
          style={{ borderRight: '1px solid oklch(1 0 0 / 0.04)' }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            className="flex items-center gap-1.5 px-4 py-2.5"
            style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
          >
            <span className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
              Prompt Template
            </span>
            {availableSnippets.length > 0 && (
              <div className="relative ml-2">
                <button
                  type="button"
                  onClick={() => setShowSnippetDropdown(!showSnippetDropdown)}
                  className="inline-flex items-center gap-1 rounded-[5px] px-2 py-1 text-[11px] font-medium"
                  style={{
                    background: selectedSnippetId
                      ? 'color-mix(in oklch, oklch(0.78 0.18 295) 14%, transparent)'
                      : 'oklch(1 0 0 / 0.04)',
                    border: selectedSnippetId
                      ? '1px solid color-mix(in oklch, oklch(0.78 0.18 295) 30%, transparent)'
                      : '1px solid oklch(1 0 0 / 0.07)',
                    color: selectedSnippetId
                      ? 'oklch(0.78 0.18 295)'
                      : 'oklch(0.78 0.01 280)',
                  }}
                >
                  {selectedSnippetId
                    ? (availableSnippets.find((s) => s.id === selectedSnippetId)
                        ?.name ?? 'Snippet')
                    : 'Use snippet'}
                  <ChevronDown className="h-2.5 w-2.5" />
                </button>
                {showSnippetDropdown && (
                  <div
                    className="absolute top-full left-0 z-20 mt-1 min-w-[180px] overflow-hidden rounded-lg border py-1"
                    style={{
                      background: 'oklch(0.16 0.015 280)',
                      borderColor: 'oklch(1 0 0 / 0.1)',
                      boxShadow: '0 8px 24px oklch(0 0 0 / 0.4)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => handleSnippetSelect(null)}
                      className="flex w-full items-center px-3 py-1.5 text-left text-[11.5px] hover:bg-white/[0.05]"
                      style={{
                        color:
                          selectedSnippetId === null
                            ? 'oklch(0.78 0.18 295)'
                            : 'oklch(0.78 0.01 280)',
                      }}
                    >
                      Default template
                    </button>
                    {availableSnippets.map((snippet) => (
                      <button
                        key={snippet.id}
                        type="button"
                        onClick={() => handleSnippetSelect(snippet.id)}
                        className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-white/[0.05]"
                      >
                        <span
                          className="text-[11.5px] font-medium"
                          style={{
                            color:
                              selectedSnippetId === snippet.id
                                ? 'oklch(0.78 0.18 295)'
                                : 'oklch(0.88 0.01 280)',
                          }}
                        >
                          {snippet.name}
                        </span>
                        {snippet.description && (
                          <span className="text-ink-3 text-[10px]">
                            {snippet.description}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div className="flex-1" />
            {onImageAttach && canAttachMore && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Attach image or video"
                >
                  <ImageIcon className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {onFileAttach && projectRoot && (
              <>
                <button
                  type="button"
                  onClick={() => void handleOpenFilePicker()}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Attach file"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFileEditor(true)}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Create new file"
                >
                  <FilePlus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
          <div
            className="flex-1"
            onPaste={handlePaste}
            onDragOver={handleTextareaDragOver}
          >
            <HandlebarsEditor
              value={template}
              onChange={onTemplateChange}
              placeholder="Enter your prompt template..."
              className="h-full"
              minHeight="200px"
              maxHeight="500px"
              featureMap={featureMap}
            />
          </div>
          <div
            className="px-4 py-2"
            style={{
              borderTop: '1px solid oklch(1 0 0 / 0.04)',
              background: 'oklch(0 0 0 / 0.22)',
            }}
          >
            <span className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
              {selectedSnippetId
                ? 'Handlebars template — use {{#each workItems}} to iterate'
                : "Use {'{#id}'} placeholders to include work item details"}
            </span>
          </div>
          {/* Drag overlay */}
          {isDragOver && (
            <div className="border-acc bg-acc-soft absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed">
              <span className="text-acc-ink text-sm">
                {onFileAttach ? 'Drop files here' : 'Drop image or video here'}
              </span>
            </div>
          )}
        </div>

        {/* Right: Preview */}
        <div
          className="flex flex-1 flex-col overflow-hidden"
          style={{ background: 'oklch(0 0 0 / 0.18)' }}
        >
          <div
            className="flex items-center gap-1.5 px-4 py-2.5"
            style={{ borderBottom: '1px solid oklch(1 0 0 / 0.04)' }}
          >
            <span className="text-ink-3 font-mono text-[10px] font-semibold tracking-wider uppercase">
              Preview
            </span>
            <div className="flex-1" />
            <span className="text-ink-3 font-mono text-[10px]">
              {preview.length.toLocaleString()} chars &middot; ~
              {Math.ceil(preview.length / 4).toLocaleString()} tokens
            </span>
          </div>
          <pre className="text-ink-2 flex-1 overflow-y-auto px-5 py-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
            {preview}
          </pre>
        </div>
      </div>

      {/* Image thumbnails */}
      {(isFetchingImages || (images && images.length > 0)) && (
        <div
          className="flex shrink-0 items-center gap-2 px-[18px] py-2"
          style={{ borderTop: '1px solid oklch(1 0 0 / 0.04)' }}
        >
          {isFetchingImages && (
            <div className="text-ink-2 flex items-center gap-2 text-xs">
              <span className="border-glass-border-strong border-t-ink-1 inline-block h-3 w-3 animate-spin rounded-full border-2" />
              Extracting images from work items…
            </div>
          )}
          {images &&
            images.length > 0 &&
            images.map((image, index) => {
              const thumbData = image.storageData ?? image.data;
              const thumbMime = image.storageMimeType ?? image.mimeType;
              return (
                <div
                  key={`${image.filename ?? 'img'}-${index}`}
                  className="group relative h-12 w-12 shrink-0 rounded border"
                  style={{ borderColor: 'oklch(1 0 0 / 0.08)' }}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="relative h-full w-full cursor-pointer overflow-hidden rounded focus-visible:outline-none"
                    aria-label={`Preview ${image.filename ?? `image ${index + 1}`}`}
                    title={
                      image.sizeBytes ? formatBytes(image.sizeBytes) : undefined
                    }
                  >
                    <img
                      src={`data:${thumbMime};base64,${thumbData}`}
                      alt={image.filename ?? 'Attached image'}
                      className="h-full w-full object-cover transition duration-150 group-focus-within:scale-105 group-focus-within:brightness-75 group-hover:scale-105 group-hover:brightness-75"
                    />
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-full border"
                        style={{
                          background: 'oklch(0.2 0.02 280 / 0.72)',
                          borderColor: 'oklch(1 0 0 / 0.14)',
                        }}
                      >
                        <Eye className="text-ink-0 h-3.5 w-3.5" />
                      </span>
                    </span>
                    {image.sizeBytes && (
                      <span className="absolute right-0 bottom-0 left-0 bg-black/70 px-0.5 py-px text-center font-mono text-[9px] leading-3 text-white">
                        {formatBytes(image.sizeBytes)}
                      </span>
                    )}
                  </button>
                  {onImageRemove && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onImageRemove(index);
                      }}
                      className="absolute top-0 right-0 flex h-4 w-4 translate-x-1/4 -translate-y-1/4 items-center justify-center rounded-full border transition-transform hover:scale-110"
                      style={{
                        background: 'oklch(0.2 0.02 280 / 0.92)',
                        borderColor: 'oklch(1 0 0 / 0.16)',
                      }}
                      aria-label={`Remove ${image.filename ?? `image ${index + 1}`}`}
                    >
                      <X className="text-ink-0 h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* File chips */}
      {files && files.length > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-2 px-[18px] py-2"
          style={{ borderTop: '1px solid oklch(1 0 0 / 0.04)' }}
        >
          {files.map((file, index) => (
            <div
              key={`${file.filename}-${index}`}
              className="group relative flex items-center gap-1.5 rounded border px-2 py-1"
              style={{ borderColor: 'oklch(1 0 0 / 0.08)' }}
            >
              <Paperclip className="text-ink-3 h-3 w-3 shrink-0" />
              <span className="text-ink-2 max-w-[120px] truncate text-xs">
                {file.filename}
              </span>
              {onFileRemove && (
                <button
                  type="button"
                  onClick={() => onFileRemove(index)}
                  className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: 'oklch(0 0 0 / 0.6)' }}
                >
                  <X className="text-ink-0 h-3 w-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Image preview lightbox */}
      {previewIndex !== null && images && images.length > 0 && (
        <ImagePreviewDialog
          images={images}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}

      {showFileEditor && onFileAttach && projectRoot && (
        <FileEditorDialog
          onSave={handleFileCreate}
          onClose={() => setShowFileEditor(false)}
        />
      )}

      <VideoGifConverter
        file={videoFile}
        onAttach={(image) => onImageAttach?.(image)}
        onClose={() => setVideoFile(null)}
      />
    </div>
  );
}

function ImagePreviewDialog({
  images,
  initialIndex,
  onClose,
}: {
  images: PromptImagePart[];
  initialIndex: number;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const img = images[currentIndex];

  const onCloseRef = useLatestRef(onClose);

  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'ArrowLeft') {
        setCurrentIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        setCurrentIndex((i) => Math.min(images.length - 1, i + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [images.length, onCloseRef]);

  if (!img) return null;

  return createPortal(
    <div
      className="bg-bg-0/80 fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute top-4 right-4 rounded-full p-2"
        aria-label="Close preview"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && currentIndex > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((i) => i - 1);
          }}
          className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute left-4 rounded-full p-2"
          aria-label="Previous image"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      <img
        src={`data:${img.mimeType};base64,${img.data}`}
        alt={img.filename || 'Image preview'}
        className="max-h-[85vh] max-w-[85vw] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && currentIndex < images.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setCurrentIndex((i) => i + 1);
          }}
          className="bg-bg-1/80 text-ink-1 hover:bg-glass-medium hover:text-ink-0 absolute right-4 rounded-full p-2"
          aria-label="Next image"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {images.length > 1 && (
        <div className="text-ink-2 absolute bottom-4 text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>,
    document.body,
  );
}
