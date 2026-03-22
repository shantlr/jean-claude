# UI Interactive Components Uniformization

## Problem

Interactive elements (buttons, inputs, selects, checkboxes) are styled inline across ~135 feature files with inconsistent heights, padding, text sizes, and border radii. Elements appearing side-by-side can have different heights, creating a visually unpolished feel.

## Design

### Sizing System

Three sizes that share consistent dimensions across all interactive components:

| Property | sm | md | lg |
|---|---|---|---|
| Height | h-7 (28px) | h-8 (32px) | h-10 (40px) |
| Text | text-xs | text-sm | text-sm |
| Padding-X | px-2 | px-3 | px-4 |
| Border radius | rounded | rounded-md | rounded-lg |
| Icon | h-3.5 w-3.5 | h-4 w-4 | h-4.5 w-4.5 |

### Components

#### 1. Button (`src/common/ui/button/`)

Variants: `primary`, `secondary`, `ghost`, `danger`.

```tsx
<Button variant="primary" size="md">Save</Button>
<Button variant="secondary" size="sm" icon={<Plus />}>Add</Button>
<Button variant="danger" size="md">Delete</Button>
```

| Variant | Background | Text | Hover |
|---|---|---|---|
| primary | bg-blue-600 | text-white | hover:bg-blue-500 |
| secondary | bg-neutral-800 border border-neutral-600 | text-neutral-300 | hover:bg-neutral-700 hover:border-neutral-500 |
| ghost | transparent | text-neutral-400 | hover:bg-neutral-700 hover:text-neutral-200 |
| danger | bg-red-600 | text-white | hover:bg-red-500 |

Props: `variant` (default: secondary), `size` (default: md), `icon`, `loading`, `disabled`, plus ButtonHTMLAttributes.

Keeps existing async-loading detection behavior.

#### 2. IconButton (`src/common/ui/icon-button/`)

Square icon-only buttons.

```tsx
<IconButton size="sm" icon={<X />} onClick={onClose} />
<IconButton size="md" icon={<Trash2 />} variant="danger" />
```

Same variants as Button. Dimensions are square (w = h from size table).

Props: `variant` (default: ghost), `size` (default: md), `icon`, `tooltip`, `loading`, `disabled`, plus ButtonHTMLAttributes.

#### 3. Input (`src/common/ui/input/`)

```tsx
<Input size="md" placeholder="Enter name..." />
<Input size="sm" icon={<Search />} />
```

Styling: `bg-neutral-800 border-neutral-600 text-neutral-200 placeholder-neutral-500 focus:border-blue-500`.
Error state: `border-red-500 focus:border-red-500`.

Props: `size` (default: md), `icon`, `error`, plus InputHTMLAttributes. Uses forwardRef.

#### 4. Textarea (`src/common/ui/textarea/`)

For simple multiline inputs (not the rich prompt textarea).

```tsx
<Textarea size="md" rows={4} placeholder="Description..." />
```

Height controlled by `rows`, not by size prop. Size affects text, padding, radius only.

Props: `size` (default: md), `error`, plus TextareaHTMLAttributes. Uses forwardRef.

#### 5. Checkbox (`src/common/ui/checkbox/`)

```tsx
<Checkbox size="md" checked={v} onChange={setV} label="Enable feature" />
<Checkbox size="md" checked={v} onChange={setV} label="Auto-install" description="Install automatically" />
```

Checkbox box sizes: sm=h-3.5, md=h-4, lg=h-5. Wrapped in `<label>` for full-area click.

Props: `size` (default: md), `checked`, `onChange`, `label`, `description`, `disabled`.

#### 6. Select (rework `src/common/ui/select/`)

Add `size` prop to existing Select. Trigger button and dropdown items scale with size.

### Migration

Full migration of all existing call sites to use the new components. Changes are mechanical: replace inline Tailwind classes with component props.
