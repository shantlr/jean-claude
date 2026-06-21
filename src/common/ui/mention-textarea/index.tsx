import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import clsx from 'clsx';
import type { TextareaHTMLAttributes } from 'react';



export type MentionOption = {
  id: string;
  displayName: string;
  uniqueName?: string;
};

export function encodeMentionDisplayNames(
  value: string,
  mentionOptions: MentionOption[],
) {
  return mentionOptions.reduce((current, option) => {
    const escapedName = escapeRegExp(
      getMentionInsertLabel(option, mentionOptions),
    );
    return current.replace(
      new RegExp(`(^|\\s)@${escapedName}(?=\\s|$)`, 'g'),
      (match, prefix: string) => `${prefix}@<${option.id}>`,
    );
  }, value);
}

export function decodeMentionDisplayNames(
  value: string,
  mentionOptions: MentionOption[],
) {
  return mentionOptions.reduce(
    (current, option) =>
      current.replaceAll(
        `@<${option.id}>`,
        `@${getMentionInsertLabel(option, mentionOptions)}`,
      ),
    value,
  );
}

function getMentionInsertLabel(
  option: MentionOption,
  mentionOptions: MentionOption[],
) {
  const duplicateDisplayName = mentionOptions.some(
    (candidate) =>
      candidate.id !== option.id &&
      candidate.displayName === option.displayName,
  );
  if (!duplicateDisplayName || !option.uniqueName) return option.displayName;
  return `${option.displayName} (${option.uniqueName})`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const EMPTY_MENTION_OPTIONS: MentionOption[] = [];

export const MENTION_TEXTAREA_CLASS =
  'bg-bg-2 text-ink-1 border-stroke-1 w-full resize-none rounded border px-2 py-1.5 text-xs focus:outline-none';

export const MENTION_TEXTAREA_MD_CLASS =
  'bg-bg-2 text-ink-1 border-stroke-1 w-full resize-none rounded-md border px-3 py-2 text-sm focus:outline-none';

export const MENTION_TEXTAREA_SM_CLASS =
  'bg-bg-2 text-ink-1 border-stroke-1 w-full resize-none rounded-md border px-2.5 py-1.5 text-xs focus:outline-none';

function normalizeSearchText(value: string) {
  return value.trim().toLowerCase();
}

function scoreMentionOption(option: MentionOption, query: string) {
  return Math.max(
    scoreFuzzyText(option.displayName, query) + 8,
    option.uniqueName ? scoreFuzzyText(option.uniqueName, query) : 0,
  );
}

function scoreFuzzyText(value: string, query: string) {
  const text = normalizeSearchText(value);
  if (!text || !query) return 0;
  if (text === query) return 1000;
  if (text.startsWith(query)) return 900 - text.length;

  const substringIndex = text.indexOf(query);
  if (substringIndex >= 0) return 750 - substringIndex * 4 - text.length;

  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;
  let gapPenalty = 0;

  for (let textIndex = 0; textIndex < text.length; textIndex += 1) {
    if (text[textIndex] !== query[queryIndex]) continue;
    if (firstMatch < 0) firstMatch = textIndex;
    if (lastMatch >= 0) gapPenalty += textIndex - lastMatch - 1;
    lastMatch = textIndex;
    queryIndex += 1;
    if (queryIndex === query.length) break;
  }

  if (queryIndex !== query.length) return 0;
  return 500 - firstMatch * 5 - gapPenalty * 3 - text.length;
}

export const MentionTextarea = forwardRef<
  HTMLTextAreaElement,
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> & {
    value: string;
    onChange: (value: string) => void;
    mentionOptions?: MentionOption[];
    onSearchMentions?: (query: string) => Promise<MentionOption[]>;
    minHeight?: number;
    maxHeight?: number;
  }
>(function MentionTextarea(
  {
    value,
    onChange,
    mentionOptions = EMPTY_MENTION_OPTIONS,
    onSearchMentions,
    minHeight = 60,
    maxHeight = 220,
    className,
    onKeyDown,
    onBlur,
    ...props
  },
  forwardedRef,
) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [query, setQuery] = useState<{ start: number; value: string } | null>(
    null,
  );
  const [searchedOptions, setSearchedOptions] = useState<MentionOption[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const hasFetchedMentionsRef = useRef(false);

  const setRef = (node: HTMLTextAreaElement | null) => {
    textareaRef.current = node;
    if (typeof forwardedRef === 'function') forwardedRef(node);
    else if (forwardedRef) forwardedRef.current = node;
  };

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight))}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [value, minHeight, maxHeight]);

  useEffect(() => {
    if (!query || !onSearchMentions || hasFetchedMentionsRef.current) {
      setIsSearching(false);
      return;
    }

    let cancelled = false;
    hasFetchedMentionsRef.current = true;
    setIsSearching(true);
    const timeout = window.setTimeout(() => {
      onSearchMentions('')
        .then((options) => {
          if (!cancelled) setSearchedOptions(options);
        })
        .catch(() => {
          if (!cancelled) setSearchedOptions([]);
        })
        .finally(() => {
          if (!cancelled) setIsSearching(false);
        });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [onSearchMentions, query]);

  const combinedOptions = useMemo(() => {
    const byId = new Map<string, MentionOption>();
    for (const option of mentionOptions)
      byId.set(option.id.toLowerCase(), option);
    for (const option of searchedOptions)
      byId.set(option.id.toLowerCase(), option);
    return [...byId.values()];
  }, [mentionOptions, searchedOptions]);

  const suggestions = useMemo(() => {
    if (!query || combinedOptions.length === 0) return [];
    const needle = normalizeSearchText(query.value);
    if (!needle) {
      return [...combinedOptions].sort((a, b) =>
        a.displayName.localeCompare(b.displayName),
      );
    }

    return combinedOptions
      .map((option) => ({ option, score: scoreMentionOption(option, needle) }))
      .filter((match) => match.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.option.displayName.localeCompare(b.option.displayName),
      )
      .map((match) => match.option);
  }, [combinedOptions, query]);

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const updateQuery = (textarea: HTMLTextAreaElement, nextValue: string) => {
    const cursor = textarea.selectionStart;
    const prefix = nextValue.slice(0, cursor);
    const match = /(^|\s)@([^@\s<>]*)$/.exec(prefix);
    setActiveIndex(0);
    setQuery(
      match
        ? { start: prefix.length - match[2].length - 1, value: match[2] }
        : null,
    );
  };

  const selectSuggestion = (option: MentionOption) => {
    if (!query) return;
    const textarea = textareaRef.current;
    const cursor = textarea?.selectionStart ?? value.length;
    const mention = `@${getMentionInsertLabel(option, combinedOptions)} `;
    const nextValue = `${value.slice(0, query.start)}${mention}${value.slice(cursor)}`;
    onChange(nextValue);
    setQuery(null);
    requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = query.start + mention.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  };

  return (
    <div className="relative flex-1">
      <textarea
        {...props}
        ref={setRef}
        value={value}
        className={clsx(className)}
        onChange={(event) => {
          onChange(event.target.value);
          updateQuery(event.target, event.target.value);
        }}
        onKeyDown={(event) => {
          if (suggestions.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % suggestions.length);
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              setActiveIndex(
                (index) =>
                  (index - 1 + suggestions.length) % suggestions.length,
              );
              return;
            }
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey) {
              event.preventDefault();
              selectSuggestion(suggestions[activeIndex]);
              return;
            }
          }
          onKeyDown?.(event);
        }}
        onBlur={(event) => {
          window.setTimeout(() => setQuery(null), 120);
          onBlur?.(event);
        }}
      />
      {query && (suggestions.length > 0 || isSearching) && (
        <div className="border-glass-border bg-bg-1 absolute bottom-full left-0 z-50 mb-1 max-h-48 min-w-56 overflow-auto rounded-lg border py-1 shadow-lg">
          {isSearching && (
            <div className="text-ink-3 flex items-center gap-2 px-3 py-2 text-xs">
              <span className="border-ink-4 border-t-ink-1 h-3 w-3 animate-spin rounded-full border" />
              Loading people...
            </div>
          )}
          {suggestions.map((option, index) => (
            <button
              key={option.id}
              ref={index === activeIndex ? activeOptionRef : undefined}
              type="button"
              className={clsx(
                'flex w-full flex-col px-3 py-1.5 text-left text-xs',
                index === activeIndex
                  ? 'bg-glass-medium text-ink-0'
                  : 'text-ink-2',
              )}
              onMouseDown={(event) => {
                event.preventDefault();
                selectSuggestion(option);
              }}
            >
              <span className="font-medium">{option.displayName}</span>
              {option.uniqueName && (
                <span className="text-ink-3 text-[11px]">
                  {option.uniqueName}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
