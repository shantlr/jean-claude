import clsx from 'clsx';
import { Bug, BookOpen, CheckSquare, FileText, Check } from 'lucide-react';

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
      return <Bug className={clsx(s, 'shrink-0 text-red-400')} />;
    case 'User Story':
    case 'Feature':
      return <BookOpen className={clsx(s, 'shrink-0 text-blue-400')} />;
    case 'Task':
      return <CheckSquare className={clsx(s, 'shrink-0 text-green-400')} />;
    default:
      return <FileText className={clsx(s, 'shrink-0 text-neutral-400')} />;
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
          ? 'border-blue-500 bg-blue-500 text-white'
          : 'border-neutral-500 bg-transparent',
      )}
    >
      {checked ? <Check className={s.check} /> : null}
    </div>
  );
}
