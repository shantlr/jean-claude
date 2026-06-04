import clsx from 'clsx';
import { Bug, BookOpen, CheckSquare, FileText, Check } from 'lucide-react';
import type { ReactNode } from 'react';

const ICON_SIZE = {
  sm: 'h-3 w-3',
  md: 'h-3.5 w-3.5',
} as const;

const CHECKBOX_SIZE = {
  sm: { box: 'h-3.5 w-3.5', check: 'h-2.5 w-2.5' },
  md: { box: 'h-4 w-4', check: 'h-3 w-3' },
} as const;

export function WorkItemTypeIcon({
  type,
  size = 'md',
}: {
  type: string;
  size?: 'sm' | 'md';
}) {
  const s = ICON_SIZE[size];
  switch (type) {
    case 'Bug':
      return <Bug className={clsx(s, 'text-status-fail shrink-0')} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={clsx(s, 'text-acc-ink shrink-0')} />;
    case 'Task':
      return <CheckSquare className={clsx(s, 'text-status-done shrink-0')} />;
    default:
      return <FileText className={clsx(s, 'text-ink-2 shrink-0')} />;
  }
}

export function SelectionCheckbox({
  checked,
  size = 'md',
}: {
  checked: boolean;
  size?: 'sm' | 'md';
}) {
  const s = CHECKBOX_SIZE[size];
  return (
    <div
      className={clsx(
        'flex shrink-0 items-center justify-center rounded border',
        s.box,
        checked
          ? 'border-acc bg-acc text-ink-0'
          : 'border-glass-border-strong bg-transparent',
      )}
    >
      {checked ? <Check className={s.check} /> : null}
    </div>
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getSearchTerms(search: string): string[] {
  const terms = new Set<string>();

  for (const rawTerm of search.trim().split(/\s+/)) {
    const term = rawTerm.trim();
    if (!term) continue;

    terms.add(term);

    if (term.startsWith('#') && term.length > 1) {
      terms.add(term.slice(1));
    } else if (/^\d+$/.test(term)) {
      terms.add(`#${term}`);
    }
  }

  return [...terms].sort((a, b) => b.length - a.length);
}

export function HighlightedSearchText({
  text,
  search,
}: {
  text: string;
  search: string;
}) {
  const terms = getSearchTerms(search);
  if (terms.length === 0) return text;

  const regex = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');
  const nodes: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }
    nodes.push(
      <mark
        key={`${index}-${match[0]}`}
        className="bg-acc/75 text-ink-0 ring-acc rounded-sm px-0.5 font-medium ring-1"
      >
        {match[0]}
      </mark>,
    );
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : text;
}
