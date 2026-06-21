import type {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  KeyboardEvent,
  SyntheticEvent,
  TextareaHTMLAttributes,
  UIEvent,
} from 'react';
import {
  ChevronLeft,
  ChevronRight,
  File,
  FilePlus,
  ImageIcon,
  Loader2,
  Paperclip,
  Wand2,
  X,
} from 'lucide-react';
import {
  forwardRef,
  startTransition,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import clsx from 'clsx';
import { createPortal } from 'react-dom';
import Fuse from 'fuse.js';



import {
  type FlatProjectFeature,
  flattenProjectFeatures,
  getFeatureReferenceText,
  getReferencedFeatures,
} from '@/lib/prompt-feature-context';
import {
  getFilePathSuggestions,
  useProjectFilePaths,
} from '@/hooks/use-project-file-paths';
import {
  MAX_FILES,
  processAttachmentFile,
  processAttachmentPath,
} from '@/lib/file-attachment-utils';
import { MAX_IMAGES, processImageFile } from '@/lib/image-utils';
import type { ProjectFeatureMap, PromptSnippet } from '@shared/types';
import type {
  PromptFilePart,
  PromptImagePart,
} from '@shared/agent-backend-types';
import { FileEditorDialog } from '@/features/common/ui-file-editor-dialog';
import { formatBytes } from '@/lib/format-bytes';
import { formatPastedPromptContent } from '@/lib/format-pasted-prompt-content';
import { resolveMessageInputText } from '@/lib/resolve-message-input-text';
import { resolvePromptSnippet } from '@/lib/resolve-snippet-template';
import type { Skill } from '@shared/skill-types';
import type { SnippetVariableContext } from '@/lib/resolve-snippet-template';
import { useDropdownPosition } from '@/common/hooks/use-dropdown-position';
import { useInlineCompletion } from '@/hooks/use-inline-completion';
import { useToastStore } from '@/stores/toasts';



import { useLatestRef } from '@/hooks/use-latest-ref';
const COMMANDS = [
  { command: '/init', description: 'Initialize CLAUDE.md in project' },
  { command: '/compact', description: 'Compact conversation history' },
];

const FILE_SUGGESTION_LIMIT = 8;

function getActiveMentionToken({
  text,
  cursorPosition,
}: {
  text: string;
  cursorPosition: number;
}): MentionToken | null {
  if (cursorPosition < 0 || cursorPosition > text.length) return null;

  const beforeCursor = text.slice(0, cursorPosition);
  const mentionStart = beforeCursor.lastIndexOf('@');
  if (mentionStart < 0) return null;

  const characterBeforeMention =
    mentionStart > 0 ? text[mentionStart - 1] : undefined;
  if (characterBeforeMention && !/\s|[([{'"`]/.test(characterBeforeMention)) {
    return null;
  }

  let mentionEnd = text.length;
  for (let index = mentionStart + 1; index < text.length; index++) {
    if (/\s/.test(text[index])) {
      mentionEnd = index;
      break;
    }
  }

  if (cursorPosition < mentionStart + 1 || cursorPosition > mentionEnd) {
    return null;
  }

  const query = text.slice(mentionStart + 1, cursorPosition);
  if (/[@\s]/.test(query)) return null;

  return {
    start: mentionStart,
    end: mentionEnd,
    query,
  };
}

function getActiveFeatureToken({
  text,
  cursorPosition,
}: {
  text: string;
  cursorPosition: number;
}): MentionToken | null {
  if (cursorPosition < 0 || cursorPosition > text.length) return null;

  const beforeCursor = text.slice(0, cursorPosition);
  const featureStart = beforeCursor.lastIndexOf('#');
  if (featureStart < 0) return null;

  const characterBeforeFeature =
    featureStart > 0 ? text[featureStart - 1] : undefined;
  if (characterBeforeFeature && !/\s|[([{'"`]/.test(characterBeforeFeature)) {
    return null;
  }

  let featureEnd = text.length;
  for (let index = featureStart + 1; index < text.length; index++) {
    if (/\s/.test(text[index])) {
      featureEnd = index;
      break;
    }
  }

  if (cursorPosition < featureStart + 1 || cursorPosition > featureEnd) {
    return null;
  }

  const query = text.slice(featureStart + 1, cursorPosition);
  if (/[#\s]/.test(query)) return null;

  return {
    start: featureStart,
    end: featureEnd,
    query,
  };
}

type DropdownItem =
  | { type: 'command'; command: string; description: string }
  | { type: 'skill'; skill: Skill }
  | { type: 'file'; filePath: string }
  | { type: 'snippet'; snippet: PromptSnippet }
  | { type: 'feature'; feature: FlatProjectFeature };

type RankedDropdownItem = DropdownItem & {
  matchScore: number | null;
};

type MentionToken = {
  start: number;
  end: number;
  query: string;
};

function getPromptPasteInsertion({
  value,
  selectionStart,
  selectionEnd,
  pastedText,
}: {
  value: string;
  selectionStart: number;
  selectionEnd: number;
  pastedText: string;
}): string {
  const formatted = formatPastedPromptContent(pastedText);
  if (!formatted.startsWith('```') || formatted === pastedText)
    return formatted;

  const before = value.slice(0, selectionStart);
  const after = value.slice(selectionEnd);
  const prefix =
    before && !before.endsWith('\n\n')
      ? before.endsWith('\n')
        ? '\n'
        : '\n\n'
      : '';
  const suffix =
    after && !after.startsWith('\n\n')
      ? after.startsWith('\n')
        ? '\n'
        : '\n\n'
      : '';

  return `${prefix}${formatted}${suffix}`;
}

function getOrderedCharacterMatchScore(value: string, query: string) {
  const normalizedValue = value.toLowerCase();
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalizedQuery) return 0;

  const compactValue = normalizedValue.replace(/[^a-z0-9]/g, '');
  if (compactValue === normalizedQuery) return 0;
  if (compactValue.startsWith(normalizedQuery)) return 10;

  let valueIndex = 0;
  const matchedIndexes: number[] = [];

  for (const character of normalizedQuery) {
    const matchIndex = normalizedValue.indexOf(character, valueIndex);
    if (matchIndex === -1) return null;
    matchedIndexes.push(matchIndex);
    valueIndex = matchIndex + 1;
  }

  const span = matchedIndexes.at(-1)! - matchedIndexes[0];
  const gapCount = span - normalizedQuery.length + 1;
  const wordBoundaryMatches = matchedIndexes.filter(
    (index) => index === 0 || /[^a-z0-9]/.test(normalizedValue[index - 1]),
  ).length;

  return span * 4 + gapCount * 12 - wordBoundaryMatches * 20;
}

export interface PromptTextareaRef {
  focus: () => void;
  blur: () => void;
  resetHeight: () => void;
}

export interface PromptTextareaProps extends Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'onChange' | 'value'
> {
  value: string;
  onChange: (value: string) => void;
  skills?: Skill[];
  maxHeight?: number;
  /** Custom handler for Enter key (without shift). Return true to prevent default behavior. */
  onEnterKey?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  /** Whether to show commands in the dropdown (default: true) */
  showCommands?: boolean;
  /** Enable inline ghost text completion */
  enableCompletion?: boolean;
  /** Project ID for FIM completion context */
  projectId?: string;
  /** Returns recent context to prepend before the prompt when needed */
  getCompletionContextBeforePrompt?: () => string;
  /** Project root for @file path suggestions */
  projectRoot?: string | null;
  /** Enable @file path suggestions */
  enableFilePathAutocomplete?: boolean;
  /** Project feature map for #feature suggestions */
  featureMap?: ProjectFeatureMap | null;
  /** Attached images */
  images?: PromptImagePart[];
  /** Called when user attaches an image (paste, drop, or file picker) */
  onImageAttach?: (image: PromptImagePart) => void;
  /** Called when user removes an attached image */
  onImageRemove?: (index: number) => void;
  /** Attached files */
  files?: PromptFilePart[];
  /** Called when user attaches a file (drop or file picker) */
  onFileAttach?: (file: PromptFilePart) => void;
  /** Called when user removes an attached file */
  onFileRemove?: (index: number) => void;
  /** Prompt snippets from settings */
  promptSnippets?: PromptSnippet[];
  /** Context for resolving snippet variables */
  snippetVariableContext?: SnippetVariableContext;
  /** Classes for the droppable composer container */
  containerClassName?: string;
  /** Called when slash, file, or feature autocomplete opens/closes. */
  onAutocompleteOpenChange?: (isOpen: boolean) => void;
  /** Expand textarea height to fill the available cross-axis space. */
  fillAvailableHeight?: boolean;
}

export const PromptTextarea = forwardRef<
  PromptTextareaRef,
  PromptTextareaProps
>(function PromptTextarea(
  {
    value,
    onChange,
    skills = [],
    maxHeight = 200,
    onEnterKey,
    showCommands = true,
    enableCompletion = false,
    projectId,
    getCompletionContextBeforePrompt,
    projectRoot = null,
    enableFilePathAutocomplete = false,
    featureMap = null,
    images,
    onImageAttach,
    onImageRemove,
    files,
    onFileAttach,
    onFileRemove,
    promptSnippets = [],
    snippetVariableContext,
    containerClassName,
    onAutocompleteOpenChange,
    fillAvailableHeight = false,
    className,
    style,
    onKeyDown: externalOnKeyDown,
    onScroll: externalOnScroll,
    ...textareaProps
  },
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [completionTriggerId, setCompletionTriggerId] = useState(0);
  const [completionCursorPosition, setCompletionCursorPosition] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaWrapperRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const trailingControlsRef = useRef<HTMLDivElement>(null);
  const shouldScrollSelectionRef = useRef(false);
  const [trailingControlsWidth, setTrailingControlsWidth] = useState(0);
  const [textareaScrollTop, setTextareaScrollTop] = useState(0);

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    blur: () => textareaRef.current?.blur(),
    resetHeight: () => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    },
  }));

  const activeMentionToken = useMemo(
    () =>
      enableFilePathAutocomplete
        ? getActiveMentionToken({ text: value, cursorPosition })
        : null,
    [enableFilePathAutocomplete, value, cursorPosition],
  );
  const activeFeatureToken = useMemo(
    () =>
      featureMap
        ? getActiveFeatureToken({ text: value, cursorPosition })
        : null,
    [featureMap, value, cursorPosition],
  );

  const showMentionDropdown = !!activeMentionToken && !dropdownDismissed;
  const showFeatureDropdown =
    !!activeFeatureToken && !showMentionDropdown && !dropdownDismissed;
  const showSlashDropdown =
    value.startsWith('/') &&
    !showMentionDropdown &&
    !showFeatureDropdown &&
    !dropdownDismissed;
  const showDropdown =
    showMentionDropdown || showFeatureDropdown || showSlashDropdown;

  useEffect(() => {
    onAutocompleteOpenChange?.(showDropdown);
  }, [onAutocompleteOpenChange, showDropdown]);

  useEffect(() => {
    if (!showDropdown) return;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      event.stopImmediatePropagation();
      setDropdownDismissed(true);
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [showDropdown]);

  const dropdownPosition = useDropdownPosition({
    isOpen: showDropdown,
    triggerRef: containerRef,
    side: 'top',
    align: 'left',
    preferredMaxHeight: 440,
  });
  const searchText = value.slice(1).toLowerCase();
  const featureSearchText = activeFeatureToken?.query ?? '';

  const { filePaths, isLoading: isLoadingFilePaths } = useProjectFilePaths({
    projectRoot,
    enabled:
      enableFilePathAutocomplete && !!projectRoot && !!activeMentionToken,
  });

  const fileSuggestions = useMemo(() => {
    if (!showMentionDropdown || !activeMentionToken) return [];

    return getFilePathSuggestions({
      filePaths,
      query: activeMentionToken.query,
      limit: FILE_SUGGESTION_LIMIT,
    });
  }, [showMentionDropdown, activeMentionToken, filePaths]);

  const flatFeatures = useMemo(
    () => flattenProjectFeatures(featureMap?.features),
    [featureMap],
  );

  const referencedFeatures = useMemo(
    () => getReferencedFeatures({ text: value, featureMap }),
    [value, featureMap],
  );

  const featureSuggestions = useMemo(() => {
    if (!showFeatureDropdown) return [];

    if (!featureSearchText.trim()) {
      return flatFeatures.map((feature) => ({
        type: 'feature' as const,
        feature,
        matchScore: null,
      }));
    }

    return flatFeatures
      .map((feature) => {
        const referenceText = getFeatureReferenceText(feature, flatFeatures);
        const nameScore = getOrderedCharacterMatchScore(
          feature.name,
          featureSearchText,
        );
        const referenceScore = getOrderedCharacterMatchScore(
          referenceText,
          featureSearchText,
        );
        const scores = [nameScore, referenceScore].filter(
          (score): score is number => score !== null,
        );
        if (scores.length === 0) return null;

        return {
          type: 'feature' as const,
          feature,
          matchScore: Math.min(...scores),
        };
      })
      .filter(
        (
          item,
        ): item is {
          type: 'feature';
          feature: FlatProjectFeature;
          matchScore: number;
        } => item !== null,
      )
      .sort((a, b) => {
        if (a.matchScore !== b.matchScore) {
          return (a.matchScore ?? 0) - (b.matchScore ?? 0);
        }
        return a.feature.name.localeCompare(b.feature.name);
      })
      .slice(0, 40);
  }, [flatFeatures, featureSearchText, showFeatureDropdown]);

  // Inline completion hook — paused when slash dropdown is open
  const {
    completion,
    completionPosition,
    isLoading: isCompletionLoading,
    accept,
    dismiss,
  } = useInlineCompletion({
    text: value,
    cursorPosition: completionCursorPosition,
    triggerId: completionTriggerId,
    enabled: enableCompletion && !showDropdown,
    projectId,
    getContextBeforePrompt: getCompletionContextBeforePrompt,
  });

  useLayoutEffect(() => {
    const controls = trailingControlsRef.current;
    if (!controls) {
      setTrailingControlsWidth(0);
      return;
    }

    const updateWidth = () => {
      setTrailingControlsWidth(controls.getBoundingClientRect().width);
    };

    updateWidth();

    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(controls);

    return () => resizeObserver.disconnect();
  }, [
    onImageAttach,
    onFileAttach,
    projectRoot,
    isCompletionLoading,
    completion,
  ]);

  // Filter slash commands/skills or @file path suggestions
  const filteredItems = useMemo((): RankedDropdownItem[] => {
    if (showMentionDropdown) {
      return fileSuggestions.map((filePath) => ({
        type: 'file',
        filePath,
        matchScore: null,
      }));
    }

    if (showFeatureDropdown) {
      return featureSuggestions;
    }

    if (!showSlashDropdown) return [];

    const items: RankedDropdownItem[] = [];

    // Fuzzy filter built-in commands
    if (showCommands) {
      const matchedCommands = searchText
        ? new Fuse(COMMANDS, {
            keys: ['command'],
            threshold: 0.4,
            ignoreLocation: true,
            includeScore: true,
          }).search(searchText)
        : COMMANDS.map((item) => ({ item, score: null }));
      for (const cmd of matchedCommands) {
        items.push({
          type: 'command',
          command: cmd.item.command,
          description: cmd.item.description,
          matchScore: cmd.score ?? null,
        });
      }
    }

    // Fuzzy filter prompt snippets (only enabled ones with autocomplete on)
    const enabledSnippets = promptSnippets.filter(
      (s) =>
        s.enabled &&
        s.autocomplete.enabled &&
        s.autocomplete.slugs.some((slug) => slug.trim()),
    );
    if (enabledSnippets.length > 0) {
      const matchedSnippets = searchText
        ? new Fuse(enabledSnippets, {
            keys: ['autocomplete.slugs', 'name'],
            threshold: 0.4,
            ignoreLocation: true,
            includeScore: true,
          }).search(searchText)
        : enabledSnippets.map((item) => ({ item, score: null }));
      for (const snippet of matchedSnippets) {
        items.push({
          type: 'snippet',
          snippet: snippet.item,
          matchScore: snippet.score ?? null,
        });
      }
    }

    // Fuzzy filter skills
    const matchedSkills = searchText
      ? new Fuse(skills, {
          keys: ['name'],
          threshold: 0.4,
          ignoreLocation: true,
          includeScore: true,
        }).search(searchText)
      : skills.map((item) => ({ item, score: null }));
    for (const skill of matchedSkills) {
      items.push({
        type: 'skill',
        skill: skill.item,
        matchScore: skill.score ?? null,
      });
    }

    return items;
  }, [
    showMentionDropdown,
    showFeatureDropdown,
    showSlashDropdown,
    fileSuggestions,
    featureSuggestions,
    searchText,
    skills,
    showCommands,
    promptSnippets,
  ]);

  const defaultSelectedIndex = useMemo(() => {
    if (filteredItems.length === 0) return 0;
    if (showMentionDropdown || showFeatureDropdown || !searchText) return 0;

    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    filteredItems.forEach((item, index) => {
      if (item.matchScore === null) return;
      if (item.matchScore < bestScore) {
        bestScore = item.matchScore;
        bestIndex = index;
      }
    });

    return bestIndex;
  }, [filteredItems, searchText, showMentionDropdown, showFeatureDropdown]);

  // Reset selected index when filtered items change
  useEffect(() => {
    shouldScrollSelectionRef.current = false;
    startTransition(() => setSelectedIndex(defaultSelectedIndex));
  }, [defaultSelectedIndex, filteredItems]);

  // Auto-scroll only for keyboard navigation, not mouse hover.
  useEffect(() => {
    if (!shouldScrollSelectionRef.current) return;
    shouldScrollSelectionRef.current = false;
    if (!dropdownRef.current) return;
    const selectedElement = dropdownRef.current.querySelector(
      `[data-index="${selectedIndex}"]`,
    );
    if (selectedElement) {
      selectedElement.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Track previous value to detect backspace
  const prevValueRef = useRef(value);
  useEffect(() => {
    const hasDropdownTrigger =
      !!activeMentionToken || !!activeFeatureToken || value.startsWith('/');

    if (dropdownDismissed && hasDropdownTrigger) {
      // Re-show dropdown when user deletes characters (backspace)
      if (value.length < prevValueRef.current.length) {
        setDropdownDismissed(false);
      }
      // Keep dismissed while adding characters after selection
    } else {
      startTransition(() => setDropdownDismissed(false));
    }
    prevValueRef.current = value;
  }, [value, dropdownDismissed, activeMentionToken, activeFeatureToken]);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedInsideContainer = !!containerRef.current?.contains(target);
      const clickedInsideDropdown = !!dropdownRef.current?.contains(target);
      if (!clickedInsideContainer && !clickedInsideDropdown) {
        setDropdownDismissed(true);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const selectItem = useCallback(
    (item: DropdownItem) => {
      if (item.type === 'file') {
        if (!activeMentionToken) return;

        const mentionValue = `@${item.filePath}`;
        const before = value.slice(0, activeMentionToken.start);
        const after = value.slice(activeMentionToken.end);
        const needsSpace = after.length === 0 || !/^\s/.test(after);
        const insertion = needsSpace ? `${mentionValue} ` : mentionValue;
        const nextValue = `${before}${insertion}${after}`;
        onChange(nextValue);

        const nextCursorPosition = before.length + insertion.length;
        setCursorPosition(nextCursorPosition);
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.selectionStart = nextCursorPosition;
          textareaRef.current.selectionEnd = nextCursorPosition;
        });
      } else if (item.type === 'feature') {
        if (!activeFeatureToken) return;

        const mentionValue = `#${getFeatureReferenceText(
          item.feature,
          flatFeatures,
        )}`;
        const before = value.slice(0, activeFeatureToken.start);
        const after = value.slice(activeFeatureToken.end);
        const needsSpace = after.length === 0 || !/^\s/.test(after);
        const insertion = needsSpace ? `${mentionValue} ` : mentionValue;
        const nextValue = `${before}${insertion}${after}`;
        onChange(nextValue);

        const nextCursorPosition = before.length + insertion.length;
        setCursorPosition(nextCursorPosition);
        requestAnimationFrame(() => {
          if (!textareaRef.current) return;
          textareaRef.current.selectionStart = nextCursorPosition;
          textareaRef.current.selectionEnd = nextCursorPosition;
        });
      } else if (item.type === 'snippet') {
        const { output } = resolvePromptSnippet(item.snippet, {
          ...(snippetVariableContext ?? {}),
        });
        const resolvedOutput = resolveMessageInputText(
          output,
          snippetVariableContext,
        );
        onChange(resolvedOutput);
      } else {
        const command =
          item.type === 'command' ? item.command : `/${item.skill.name}`;
        onChange(command);
      }

      setDropdownDismissed(true);
      textareaRef.current?.focus();
    },
    [
      activeMentionToken,
      activeFeatureToken,
      flatFeatures,
      onChange,
      value,
      snippetVariableContext,
    ],
  );

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle completion keyboard shortcuts
    if (completion) {
      if (e.key === 'Tab') {
        e.preventDefault();
        const completionText = accept();
        if (completionText && completionPosition !== null) {
          const insertAt = Math.min(completionPosition, value.length);
          const newValue =
            value.slice(0, insertAt) + completionText + value.slice(insertAt);
          onChange(newValue);
          const newCursorPos = insertAt + completionText.length;
          setCursorPosition(newCursorPos);
          setCompletionCursorPosition(newCursorPos);
          // Set cursor position in textarea after React re-renders
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = newCursorPos;
              textareaRef.current.selectionEnd = newCursorPos;
            }
          });
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
        return;
      }
      // Any other key: dismiss current completion (debounce will re-trigger)
      dismiss();
    }

    // Handle dropdown navigation
    if (showDropdown && filteredItems.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        shouldScrollSelectionRef.current = true;
        setSelectedIndex((prev) =>
          prev < filteredItems.length - 1 ? prev + 1 : prev,
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        shouldScrollSelectionRef.current = true;
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const selectedItem = filteredItems[selectedIndex];
        if (!selectedItem) return;
        selectItem(selectedItem);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownDismissed(true);
        return;
      }
    }

    // Option+Enter inserts a newline (same as Shift+Enter)
    if (e.key === 'Enter' && e.altKey) {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const newValue = value.slice(0, start) + '\n' + value.slice(end);
        onChange(newValue);
        const newCursorPos = start + 1;
        setCursorPosition(newCursorPos);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = newCursorPos;
            textareaRef.current.selectionEnd = newCursorPos;
          }
          adjustHeight();
          syncScrollTop();
        });
      }
      return;
    }

    // Handle Enter key for submit
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      const handled = onEnterKey?.(e);
      if (handled) {
        e.preventDefault();
        return;
      }
    }

    // Call external keydown handler
    externalOnKeyDown?.(e);
  };

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    // Use the greater of textarea content height and ghost overlay height
    // so multiline completions expand the textarea
    const ghostHeight = ghostRef.current?.scrollHeight ?? 0;
    const neededHeight = Math.max(textarea.scrollHeight, ghostHeight);
    const fillHeight = fillAvailableHeight
      ? (textareaWrapperRef.current?.clientHeight ?? 0)
      : 0;
    textarea.style.height = `${Math.min(Math.max(neededHeight, fillHeight), maxHeight)}px`;
  }, [fillAvailableHeight, maxHeight]);

  const syncScrollTop = useCallback(() => {
    setTextareaScrollTop(textareaRef.current?.scrollTop ?? 0);
  }, []);

  // Re-adjust height when value/completion changes; newlines can change scrollTop
  // during layout without dispatching a scroll event.
  // useLayoutEffect avoids a visual flash where the textarea is too short before expanding
  useLayoutEffect(() => {
    adjustHeight();
    syncScrollTop();
  }, [value, completion, adjustHeight, syncScrollTop]);

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    const nextCursorPosition = e.target.selectionStart;
    setCursorPosition(nextCursorPosition);
    setCompletionCursorPosition(nextCursorPosition);
    setCompletionTriggerId((id) => id + 1);
    adjustHeight();
  };

  const handleSelect = (e: SyntheticEvent<HTMLTextAreaElement>) => {
    const nextCursorPosition = e.currentTarget.selectionStart;
    setCursorPosition(nextCursorPosition);
    if (
      nextCursorPosition !== completionCursorPosition &&
      (completion || isCompletionLoading)
    ) {
      dismiss();
    }
  };

  const handleScroll = useCallback(
    (e: UIEvent<HTMLTextAreaElement>) => {
      if (completion) {
        setTextareaScrollTop(e.currentTarget.scrollTop);
      }
      externalOnScroll?.(e);
    },
    [completion, externalOnScroll],
  );

  // --- Image attachment handlers ---
  const [isDragOver, setIsDragOver] = useState(false);
  const [showFileEditor, setShowFileEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addToast = useToastStore((s) => s.addToast);
  const showImageError = useCallback(
    (message: string) => addToast({ message, type: 'error' }),
    [addToast],
  );

  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const items = Array.from(e.clipboardData.items);
      const imageItems = items.filter((item) => item.type.startsWith('image/'));

      if (imageItems.length > 0 && onImageAttach) {
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
        return;
      }

      const pastedText = e.clipboardData.getData('text/plain');
      if (!pastedText) return;

      const target = e.currentTarget;
      const selectionStart = target.selectionStart;
      const selectionEnd = target.selectionEnd;
      const insertion = getPromptPasteInsertion({
        value,
        selectionStart,
        selectionEnd,
        pastedText,
      });

      e.preventDefault();
      const nextValue = `${value.slice(0, selectionStart)}${insertion}${value.slice(selectionEnd)}`;
      const nextCursorPosition = selectionStart + insertion.length;
      onChange(nextValue);
      setCursorPosition(nextCursorPosition);
      setCompletionCursorPosition(nextCursorPosition);
      setCompletionTriggerId((id) => id + 1);
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(
          nextCursorPosition,
          nextCursorPosition,
        );
        adjustHeight();
      });
    },
    [onImageAttach, images, showImageError, value, onChange, adjustHeight],
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
    // Only clear drag state when actually leaving the container,
    // not when entering a child element (e.g. the textarea).
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

      // Handle image files (existing behavior)
      if (onImageAttach) {
        const currentImageCount = images?.length ?? 0;
        const allowedImages = MAX_IMAGES - currentImageCount;
        const imageFiles = droppedFiles.filter((f) =>
          f.type.startsWith('image/'),
        );
        for (const file of imageFiles.slice(0, allowedImages)) {
          void processImageFile(file, onImageAttach, showImageError).catch(
            (err) => {
              showImageError('Failed to process image');
              console.error('Failed to process dropped image:', err);
            },
          );
        }
      }

      // Handle non-image files
      if (onFileAttach && projectRoot) {
        const currentFileCount = files?.length ?? 0;
        const allowedFiles = MAX_FILES - currentFileCount;
        const nonImageFiles = droppedFiles.filter(
          (f) => !f.type.startsWith('image/'),
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
      if (allowed <= 0) return;

      const files = Array.from(e.target.files);
      for (const file of files.slice(0, allowed)) {
        void processImageFile(file, onImageAttach, showImageError).catch(
          (err) => {
            showImageError('Failed to process image');
            console.error('Failed to process selected image:', err);
          },
        );
      }
      // Reset input so the same file can be selected again
      e.target.value = '';
    },
    [onImageAttach, images, showImageError],
  );

  const handleOpenFilePicker = useCallback(async () => {
    if (!onFileAttach || !projectRoot) return;

    const currentFileCount = files?.length ?? 0;
    const allowedFiles = MAX_FILES - currentFileCount;
    if (allowedFiles <= 0) return;

    const selectedPaths = await window.api.dialog.openFiles();
    if (!selectedPaths) return;

    for (const sourcePath of selectedPaths.slice(0, allowedFiles)) {
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
        onFileAttach({
          type: 'file',
          filePath,
          filename,
        });
        setShowFileEditor(false);
      } catch (err) {
        addToast({
          message: `Failed to create file: ${filename}`,
          type: 'error',
        });
        console.error('Failed to create attachment file:', err);
      }
    },
    [onFileAttach, projectRoot, addToast],
  );

  // Prevent the textarea's native file-drop behavior (inserting filename as text).
  // The actual drop handling is on the parent container.
  const handleTextareaDragOver = useCallback(
    (e: DragEvent<HTMLTextAreaElement>) => {
      if (!onImageAttach && !onFileAttach) return;
      const hasFiles = Array.from(e.dataTransfer.types).includes('Files');
      if (hasFiles) {
        e.preventDefault();
      }
    },
    [onImageAttach, onFileAttach],
  );

  const handleItemMouseEnter = (index: number) => {
    shouldScrollSelectionRef.current = false;
    setSelectedIndex(index);
  };

  // Separate item types for grouped display
  const fileItems = filteredItems.filter((item) => item.type === 'file');
  const featureItems = filteredItems.filter((item) => item.type === 'feature');
  const commandItems = filteredItems.filter((item) => item.type === 'command');
  const snippetItems = filteredItems.filter((item) => item.type === 'snippet');
  const skillItems = filteredItems.filter((item) => item.type === 'skill');
  const trailingPaddingRight =
    trailingControlsWidth > 0 ? `${trailingControlsWidth + 16}px` : undefined;

  useEffect(() => {
    if (!value.includes('{{')) return;
    const resolved = resolveMessageInputText(value, snippetVariableContext);
    if (resolved === value) return;
    onChange(resolved);
  }, [value, snippetVariableContext, onChange]);

  // Get the flat index for an item (used for selection highlighting)
  const getItemIndex = (
    type: 'file' | 'feature' | 'command' | 'snippet' | 'skill',
    localIndex: number,
  ) => {
    if (type === 'file') return localIndex;
    if (type === 'feature') return fileItems.length + localIndex;
    if (type === 'command')
      return fileItems.length + featureItems.length + localIndex;
    if (type === 'snippet')
      return (
        fileItems.length +
        featureItems.length +
        commandItems.length +
        localIndex
      );
    return (
      fileItems.length +
      featureItems.length +
      commandItems.length +
      snippetItems.length +
      localIndex
    );
  };

  return (
    <div
      ref={containerRef}
      className={clsx('relative flex flex-1 flex-col', containerClassName)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Autocompletion dropdown */}
      {showDropdown &&
        dropdownPosition &&
        ((showMentionDropdown &&
          (filteredItems.length > 0 || isLoadingFilePaths)) ||
          (showFeatureDropdown && filteredItems.length > 0) ||
          (!showMentionDropdown && filteredItems.length > 0)) &&
        createPortal(
          <div
            ref={dropdownRef}
            className={clsx(
              'border-glass-border bg-bg-1 fixed z-50 overflow-x-hidden overflow-y-auto rounded-md border py-0.5 shadow-lg',
            )}
            style={{
              top:
                dropdownPosition.actualSide === 'bottom'
                  ? dropdownPosition.top
                  : undefined,
              bottom:
                dropdownPosition.actualSide === 'top'
                  ? window.innerHeight - dropdownPosition.top
                  : undefined,
              left:
                dropdownPosition.actualAlign === 'left'
                  ? dropdownPosition.left
                  : undefined,
              right:
                dropdownPosition.actualAlign === 'right'
                  ? window.innerWidth - dropdownPosition.left
                  : undefined,
              maxHeight: dropdownPosition.maxHeight,
              maxWidth: dropdownPosition.maxWidth,
            }}
          >
            {/* File paths */}
            {fileItems.map((item, localIndex) => {
              if (item.type !== 'file') return null;
              const index = getItemIndex('file', localIndex);

              return (
                <button
                  key={item.filePath}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => handleItemMouseEnter(index)}
                  className={clsx(
                    'flex w-full items-center gap-2 px-3 py-1 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <File className="text-ink-2 h-3.5 w-3.5 shrink-0" />
                  <span className="text-ink-1 truncate text-xs">
                    {item.filePath}
                  </span>
                </button>
              );
            })}

            {showMentionDropdown &&
              isLoadingFilePaths &&
              fileItems.length === 0 && (
                <div className="text-ink-2 flex items-center gap-2 px-3 py-2 text-xs">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading files...
                </div>
              )}

            {/* Features */}
            {featureItems.length > 0 && (
              <div className="text-ink-3 flex items-center justify-between px-3 py-1 text-[11px] font-medium">
                <span>Features</span>
                <span className="font-mono text-[10px]">
                  {featureSearchText.trim()
                    ? `${featureItems.length} match${featureItems.length === 1 ? '' : 'es'}`
                    : `${flatFeatures.length} total`}
                </span>
              </div>
            )}
            {featureItems.map((item, localIndex) => {
              if (item.type !== 'feature') return null;
              const index = getItemIndex('feature', localIndex);
              const { feature } = item;
              const isReferenced = referencedFeatures.some(
                (referenced) => referenced.id === feature.id,
              );
              return (
                <button
                  key={feature.id}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => handleItemMouseEnter(index)}
                  className={clsx(
                    'w-full px-3 py-1 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="bg-acc/70 shrink-0 rounded-full"
                      style={{
                        width: feature.depth === 0 ? 6 : 4,
                        height: feature.depth === 0 ? 6 : 4,
                        marginLeft: featureSearchText.trim()
                          ? 0
                          : Math.min(feature.depth, 4) * 12,
                      }}
                    />
                    <span className="text-ink-1 truncate text-[11.5px] font-medium">
                      #{feature.name}
                    </span>
                    {isReferenced && (
                      <span className="bg-acc-soft text-acc shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px]">
                        in prompt
                      </span>
                    )}
                  </div>
                  <div className="text-ink-3 flex min-w-0 items-center gap-1.5 pl-4 text-[10px]">
                    <span className="truncate">{feature.path.join(' › ')}</span>
                    {feature.key_files.length > 0 && (
                      <span className="shrink-0 font-mono">
                        {feature.key_files.length} files
                      </span>
                    )}
                  </div>
                  {feature.summary && (
                    <div className="text-ink-2 line-clamp-1 pl-4 text-[10.5px]">
                      {feature.summary}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Commands section */}
            {commandItems.map((item, localIndex) => {
              if (item.type !== 'command') return null;
              const index = getItemIndex('command', localIndex);
              return (
                <button
                  key={item.command}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => handleItemMouseEnter(index)}
                  className={clsx(
                    'w-full px-3 py-1 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="text-ink-1 text-[11.5px] font-medium">
                    {item.command}
                  </div>
                  <div className="text-ink-2 text-[10.5px]">
                    {item.description}
                  </div>
                </button>
              );
            })}

            {/* Divider between commands and snippets */}
            {commandItems.length > 0 && snippetItems.length > 0 && (
              <div className="border-glass-border my-1 border-t" />
            )}

            {/* Snippets section header */}
            {snippetItems.length > 0 && (
              <div className="text-ink-3 flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium">
                Snippets
              </div>
            )}

            {/* Snippets */}
            {snippetItems.map((item, localIndex) => {
              if (item.type !== 'snippet') return null;
              const index = getItemIndex('snippet', localIndex);
              const { snippet } = item;
              return (
                <button
                  key={snippet.id}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => handleItemMouseEnter(index)}
                  className={clsx(
                    'w-full px-3 py-1 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ink-1 text-[11.5px] font-medium">
                      /
                      {snippet.autocomplete.slugs.find((s) => s.trim()) ??
                        snippet.name}
                    </span>
                    {snippet.name && (
                      <span className="text-ink-3 text-[10.5px]">
                        {snippet.name}
                      </span>
                    )}
                  </div>
                  {snippet.description && (
                    <div className="text-ink-3 text-[10.5px]">
                      {snippet.description}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Divider before skills */}
            {(commandItems.length > 0 || snippetItems.length > 0) &&
              skillItems.length > 0 && (
                <div className="border-glass-border my-1 border-t" />
              )}

            {/* Skills section header */}
            {skillItems.length > 0 && (
              <div className="text-ink-3 flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium">
                <Wand2 className="h-3 w-3" aria-hidden />
                Skills
              </div>
            )}

            {/* Skills */}
            {skillItems.map((item, localIndex) => {
              if (item.type !== 'skill') return null;
              const index = getItemIndex('skill', localIndex);
              const { skill } = item;
              return (
                <button
                  key={skill.name}
                  type="button"
                  data-index={index}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => handleItemMouseEnter(index)}
                  className={clsx(
                    'w-full px-3 py-1 text-left',
                    index === selectedIndex
                      ? 'bg-glass-medium'
                      : 'hover:bg-glass-medium',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-ink-1 text-[11.5px] font-medium">
                      /{skill.name}
                    </span>
                    {skill.source !== 'user' && (
                      <span className="bg-glass-medium text-ink-2 rounded px-1 py-0.5 text-[10px]">
                        {skill.pluginName ?? skill.source}
                      </span>
                    )}
                  </div>
                  {skill.description && (
                    <div className="text-ink-2 line-clamp-2 text-[10.5px]">
                      {skill.description}
                    </div>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      {/* Textarea wrapper — relative for ghost overlay + absolute elements */}
      <div ref={textareaWrapperRef} className="relative flex flex-1 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onPaste={handlePaste}
          onScroll={handleScroll}
          onDragOver={handleTextareaDragOver}
          rows={1}
          autoComplete="off"
          className={clsx(
            // Structural classes (always applied)
            'text-ink-1 placeholder-ink-3 min-h-[1lh] w-full resize-none text-sm leading-[20px] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            // Chrome classes (border, bg, padding, rounding) — replaced when className is provided
            className ??
              'border-glass-border bg-glass-light focus:border-glass-border-strong focus:ring-acc/10 rounded-lg border px-3 py-2 focus:ring-1',
            isDragOver && 'border-acc bg-acc-soft',
            completion && 'caret-ink-1 text-transparent',
          )}
          style={{ ...style, paddingRight: trailingPaddingRight }}
          {...textareaProps}
        />
        {/* Ghost text overlay — matches textarea border+padding so text aligns */}
        {completion && (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              ref={ghostRef}
              className={clsx(
                'text-sm leading-[20px] break-words whitespace-pre-wrap',
                className ? className : 'border border-transparent px-3 py-2',
              )}
              style={{
                maxHeight: `${maxHeight}px`,
                paddingRight: trailingPaddingRight,
                transform: `translateY(-${textareaScrollTop}px)`,
              }}
            >
              <span className="text-ink-1">
                {value.slice(0, completionPosition ?? value.length)}
              </span>
              <span className="text-ink-3">{completion}</span>
              <span className="text-ink-1">
                {value.slice(completionPosition ?? value.length)}
              </span>
            </div>
          </div>
        )}
        {/* Completion loader + file picker buttons */}
        {(onImageAttach ||
          onFileAttach ||
          (isCompletionLoading && !completion)) && (
          <div
            ref={trailingControlsRef}
            className={clsx(
              'absolute flex items-center gap-1',
              className ? 'right-0 bottom-0' : 'right-2 bottom-2',
            )}
          >
            {isCompletionLoading && !completion && (
              <div className="pointer-events-none">
                <Loader2 className="text-ink-3 h-3.5 w-3.5 animate-spin" />
              </div>
            )}
            {onImageAttach && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Attach image"
                >
                  <ImageIcon className="h-4 w-4" />
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
                  <Paperclip className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowFileEditor(true)}
                  className="text-ink-3 hover:bg-glass-medium hover:text-ink-1 rounded p-1"
                  title="Create new file"
                >
                  <FilePlus className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Image previews — below the textarea in normal flow */}
      {images && images.length > 0 && (
        <ImageThumbnails images={images} onImageRemove={onImageRemove} />
      )}

      {/* File previews — below images in normal flow */}
      {files && files.length > 0 && (
        <FileThumbnails files={files} onFileRemove={onFileRemove} />
      )}

      {/* Drag overlay covers the full composer container, including padding. */}
      {isDragOver && (
        <div className="border-acc bg-acc-soft pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed">
          <span className="text-acc-ink text-sm">
            {onFileAttach ? 'Drop files here' : 'Drop image here'}
          </span>
        </div>
      )}

      {showFileEditor && onFileAttach && projectRoot && (
        <FileEditorDialog
          onSave={handleFileCreate}
          onClose={() => setShowFileEditor(false)}
        />
      )}
    </div>
  );
});

function ImageThumbnails({
  images,
  onImageRemove,
}: {
  images: PromptImagePart[];
  onImageRemove?: (index: number) => void;
}) {
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((img, index) => (
          <div
            key={`${img.filename ?? 'img'}-${index}`}
            className="group relative"
          >
            <button
              type="button"
              onClick={() => setPreviewIndex(index)}
              className="border-glass-border hover:border-glass-border-strong relative block cursor-pointer overflow-hidden rounded border"
              title={img.sizeBytes ? formatBytes(img.sizeBytes) : undefined}
            >
              <img
                src={`data:${img.storageMimeType ?? img.mimeType};base64,${img.storageData ?? img.data}`}
                alt={img.filename || 'Attached image'}
                className="h-16 w-16 object-cover"
              />
              {img.sizeBytes && (
                <span className="absolute right-0 bottom-0 left-0 bg-black/70 px-0.5 py-px text-center font-mono text-[9px] leading-3 text-white">
                  {formatBytes(img.sizeBytes)}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => onImageRemove?.(index)}
              className="bg-glass-medium text-ink-1 hover:bg-status-fail absolute -top-1.5 -right-1.5 hidden h-4 w-4 items-center justify-center rounded-full text-xs group-hover:flex"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {previewIndex !== null && (
        <ImagePreviewDialog
          images={images}
          initialIndex={previewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
}

function FileThumbnails({
  files,
  onFileRemove,
}: {
  files: PromptFilePart[];
  onFileRemove?: (index: number) => void;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file, index) => (
        <div
          key={`${file.filename}-${index}`}
          className="group border-glass-border bg-glass-light relative flex items-center gap-1.5 rounded border px-2 py-1"
        >
          <Paperclip className="text-ink-3 h-3 w-3 shrink-0" />
          <span className="text-ink-2 max-w-[120px] truncate text-xs">
            {file.filename}
          </span>
          {onFileRemove && (
            <button
              type="button"
              onClick={() => onFileRemove(index)}
              className="text-ink-3 hover:text-ink-1 ml-0.5 hidden group-hover:block"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
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
