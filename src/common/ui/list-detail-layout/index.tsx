import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Search } from 'lucide-react';



import { useHorizontalResize } from '@/hooks/use-horizontal-resize';

const SHARED_BORDER_COLOR = 'oklch(1 0 0 / 0.05)';
const SHARED_PANEL_BACKGROUND = 'oklch(0 0 0 / 0.18)';

export function ListDetailLayout({
  list,
  detail,
  children,
}: {
  list: ReactNode;
  detail: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-0 flex-1 border-t"
      style={{ borderColor: SHARED_BORDER_COLOR }}
    >
      {list}
      {detail}
      {children}
    </div>
  );
}

export function ListPane({
  width,
  minWidth,
  maxWidth,
  onWidthChange,
  title,
  headerContent,
  count,
  headerActions,
  headerSupplement,
  top,
  children,
  contentClassName,
}: {
  width: number;
  minWidth: number;
  maxWidth: number;
  onWidthChange: (width: number) => void;
  title?: string;
  headerContent?: ReactNode;
  count?: ReactNode;
  headerActions?: ReactNode;
  headerSupplement?: ReactNode;
  top?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  const { isDragging, handleMouseDown } = useHorizontalResize({
    initialWidth: width,
    minWidth,
    maxWidth,
    onWidthChange,
  });

  return (
    <div
      className="relative flex min-h-0 shrink-0 flex-col"
      style={{
        width,
        borderRight: `1px solid ${SHARED_BORDER_COLOR}`,
        background: SHARED_PANEL_BACKGROUND,
      }}
    >
      <div className="flex flex-col gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            {headerContent ??
              (title ? (
                <div
                  className="text-lg font-semibold"
                  style={{
                    color: 'oklch(0.99 0 0)',
                    letterSpacing: '-0.015em',
                  }}
                >
                  {title}
                </div>
              ) : null)}
            {count !== undefined && count !== null ? (
              <span
                className="rounded-[5px] px-2 py-0.5 font-mono text-[11px]"
                style={{
                  color: 'oklch(0.7 0.01 280)',
                  background: 'oklch(1 0 0 / 0.06)',
                  border: '1px solid oklch(1 0 0 / 0.06)',
                }}
              >
                {count}
              </span>
            ) : null}
          </div>
          {headerActions}
        </div>
        {headerSupplement}
      </div>

      {top}

      <div className={clsx('flex-1 overflow-y-auto pb-3', contentClassName)}>
        {children}
      </div>

      <div
        onMouseDown={handleMouseDown}
        className={clsx(
          'hover:bg-acc/50 absolute top-0 right-0 z-10 h-full w-1 cursor-col-resize transition-colors',
          isDragging && 'bg-acc/50',
        )}
      />
    </div>
  );
}

export function ListSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 rounded-md px-2.5 py-1.5"
      style={{
        background: 'oklch(0 0 0 / 0.25)',
        border: '1px solid oklch(1 0 0 / 0.06)',
      }}
    >
      <Search size={12} style={{ color: 'oklch(0.5 0.01 280)' }} />
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        className="min-w-0 flex-1 overflow-hidden bg-transparent text-[12.5px] text-ellipsis focus:outline-none"
        style={{
          color: 'oklch(0.92 0.008 280)',
          letterSpacing: '-0.005em',
        }}
      />
    </div>
  );
}

export function ListGroupHeader({
  label,
  accent = false,
}: {
  label: string;
  accent?: boolean;
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 pt-3 pb-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase"
      style={{ color: accent ? 'oklch(0.78 0.18 295)' : 'oklch(0.5 0.01 280)' }}
    >
      {label}
    </div>
  );
}

export function ListItemButton({
  label,
  isActive,
  isDimmed = false,
  size = 'default',
  renderIcon,
  suffix,
  onClick,
}: {
  label: string;
  isActive: boolean;
  isDimmed?: boolean;
  size?: 'default' | 'compact';
  renderIcon?: (state: { isActive: boolean; isDimmed: boolean }) => ReactNode;
  suffix?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-2.5 text-left transition-colors',
        size === 'compact' ? 'px-4 py-2' : 'px-4 py-[9px]',
      )}
      style={{
        background: isActive
          ? 'color-mix(in oklch, oklch(0.78 0.18 295) 18%, transparent)'
          : 'transparent',
        borderLeft: isActive
          ? '2px solid oklch(0.78 0.18 295)'
          : '2px solid transparent',
      }}
    >
      {renderIcon ? renderIcon({ isActive, isDimmed }) : null}
      <span
        className="min-w-0 truncate"
        style={{
          fontSize: size === 'compact' ? '13px' : '14px',
          fontWeight: isActive ? 500 : 400,
          color: isActive
            ? 'oklch(0.99 0 0)'
            : isDimmed
              ? 'oklch(0.5 0.01 280)'
              : 'oklch(0.88 0.008 280)',
          letterSpacing: '-0.005em',
        }}
      >
        {label}
      </span>
      {suffix}
    </button>
  );
}

export function DetailPlaceholder({
  message,
  actions,
}: {
  message: string;
  actions?: ReactNode;
}) {
  return (
    <div
      className="flex min-w-0 flex-1 items-center justify-center"
      style={{ background: SHARED_PANEL_BACKGROUND }}
    >
      <div className="text-center">
        <p className="text-sm" style={{ color: 'oklch(0.55 0.01 280)' }}>
          {message}
        </p>
        {actions ? <div className="mt-4">{actions}</div> : null}
      </div>
    </div>
  );
}
