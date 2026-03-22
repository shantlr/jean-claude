/**
 * Shared sizing and variant definitions for all interactive UI components.
 *
 * Size table:
 * | Property      | xs              | sm              | md              | lg              |
 * |---------------|-----------------|-----------------|-----------------|-----------------|
 * | Height        | auto (~20px)    | h-7 (28px)      | h-8 (32px)      | h-10 (40px)     |
 * | Text          | text-xs         | text-xs         | text-sm         | text-sm         |
 * | Padding-X     | px-2            | px-2            | px-3            | px-4            |
 * | Padding-Y     | py-0.5          | py-1            | py-1.5          | py-2            |
 * | Border radius | rounded         | rounded         | rounded-md      | rounded-lg      |
 * | Icon          | h-3 w-3        | h-3.5 w-3.5     | h-4 w-4         | h-4.5 w-4.5    |
 *
 * Use `xs` for chip-height elements (inline badges, compact header inputs).
 */

export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg';

export const sizeClasses = {
  xs: {
    height: '',
    text: 'text-xs',
    px: 'px-2',
    py: 'py-0.5',
    radius: 'rounded',
    icon: 'h-3 w-3',
    gap: 'gap-1',
    square: 'h-5 w-5',
  },
  sm: {
    height: 'h-7',
    text: 'text-xs',
    px: 'px-2',
    py: 'py-1',
    radius: 'rounded',
    icon: 'h-3.5 w-3.5',
    gap: 'gap-1.5',
    square: 'h-7 w-7',
  },
  md: {
    height: 'h-8',
    text: 'text-sm',
    px: 'px-3',
    py: 'py-1.5',
    radius: 'rounded-md',
    icon: 'h-4 w-4',
    gap: 'gap-2',
    square: 'h-8 w-8',
  },
  lg: {
    height: 'h-10',
    text: 'text-sm',
    px: 'px-4',
    py: 'py-2',
    radius: 'rounded-lg',
    icon: 'h-[18px] w-[18px]',
    gap: 'gap-2',
    square: 'h-10 w-10',
  },
} as const;

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'tab'
  | 'unstyled';

export const buttonVariantClasses: Record<
  ButtonVariant,
  {
    base: string;
    hover: string;
    active: string;
    /** Extra classes applied when the `active` prop is true. */
    selected?: string;
    /** Base classes when NOT selected (only for variants that use `active`). */
    unselected?: string;
  }
> = {
  primary: {
    base: 'bg-blue-600 text-white border border-transparent',
    hover: 'hover:bg-blue-500',
    active: 'active:bg-blue-700',
  },
  secondary: {
    base: 'bg-neutral-800 text-neutral-300 border border-neutral-600',
    hover: 'hover:bg-neutral-700 hover:border-neutral-500',
    active: 'active:bg-neutral-600',
  },
  ghost: {
    base: 'bg-transparent text-neutral-400 border border-transparent',
    hover: 'hover:bg-neutral-700 hover:text-neutral-200',
    active: 'active:bg-neutral-600',
  },
  danger: {
    base: 'bg-red-600 text-white border border-transparent',
    hover: 'hover:bg-red-500',
    active: 'active:bg-red-700',
  },
  tab: {
    base: 'border border-transparent',
    hover: '',
    active: '',
    selected: 'bg-neutral-700 font-medium text-neutral-100',
    unselected: 'text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200',
  },
  unstyled: {
    base: '',
    hover: '',
    active: '',
  },
} as const;

export const inputBaseClasses =
  'bg-neutral-800 text-neutral-200 placeholder-neutral-500 border focus:outline-none transition-colors';

export const inputBorderClasses = {
  normal: 'border-neutral-600 focus:border-blue-500',
  error: 'border-red-500 focus:border-red-500',
} as const;

export const checkboxSizeClasses = {
  xs: 'h-3 w-3',
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;
