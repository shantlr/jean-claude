# Modal System Design

## Overview

A unified modal system providing:
1. A reusable base `<Modal>` component for declarative usage
2. An imperative API via `useModal()` hook for quick info/confirm/error dialogs

## File Structure

```
src/common/ui/modal/
  index.tsx           # Base Modal component

src/common/context/modal/
  index.tsx           # ModalProvider context + useModal hook
  types.ts            # Modal types and interfaces
```

## Base Modal Component

**Location:** `src/common/ui/modal/index.tsx`

### Props

```tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: ReactNode;
  closeOnClickOutside?: boolean;  // default: true
  closeOnEscape?: boolean;        // default: true
  size?: 'sm' | 'md' | 'lg';      // default: 'md'
  children: ReactNode;
}
```

### Sizes

- `sm`: `max-w-sm` (~384px) - simple confirmations
- `md`: `max-w-md` (~448px) - standard dialogs
- `lg`: `max-w-lg` (~512px) - forms with more content

### Behavior

- **Click outside**: Closes modal by default (configurable via `closeOnClickOutside`)
- **Escape key**: Closes modal by default (configurable via `closeOnEscape`)
- **Portal**: Renders to `document.body`
- **Z-index**: `z-50` (consistent with existing modals)
- **Header**: Only renders if `title` is provided (includes X close button)
- **Body**: Renders `children` directly - consumer controls all layout

### Usage Example

```tsx
<Modal
  isOpen={showConfirm}
  onClose={() => setShowConfirm(false)}
  title="Delete Item"
>
  <p className="text-sm text-neutral-300 mb-4">
    Are you sure you want to delete this item?
  </p>
  <div className="flex justify-end gap-3">
    <button onClick={() => setShowConfirm(false)}>Cancel</button>
    <button onClick={handleDelete}>Delete</button>
  </div>
</Modal>
```

## Imperative Modal API

**Location:** `src/common/context/modal/index.tsx`

### Provider Setup

Add `ModalProvider` to `src/app.tsx`:

```tsx
<RootKeyboardBindings>
  <ModalProvider>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </ModalProvider>
</RootKeyboardBindings>
```

### Hook API

```tsx
const modal = useModal();
```

#### `modal.info(options)`

Shows an informational modal with a single OK button.

```tsx
await modal.info({
  title: 'Upload Complete',
  content: 'Your file has been uploaded successfully.',
});
```

**Options:**
- `title: ReactNode` - Modal title
- `content: ReactNode` - Modal body content

**Returns:** `Promise<void>` - Resolves when user clicks OK

#### `modal.confirm(options)`

Shows a confirmation modal with Cancel/Confirm buttons.

```tsx
const confirmed = await modal.confirm({
  title: 'Delete Item',
  content: 'Are you sure you want to delete this item?',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  variant: 'danger',
});

if (confirmed) {
  // proceed with deletion
}
```

**Options:**
- `title: ReactNode` - Modal title
- `content: ReactNode` - Modal body content
- `confirmLabel?: string` - Confirm button text (default: 'Confirm')
- `cancelLabel?: string` - Cancel button text (default: 'Cancel')
- `variant?: 'primary' | 'danger'` - Confirm button style (default: 'primary')

**Returns:** `Promise<boolean>` - Resolves `true` if confirmed, `false` if cancelled

#### `modal.error(options)`

Shows an error modal with styled error presentation and OK button.

```tsx
await modal.error({
  title: 'Operation Failed',
  content: 'Could not connect to server.',
});
```

**Options:**
- `title: ReactNode` - Modal title
- `content: ReactNode` - Error description

**Returns:** `Promise<void>` - Resolves when user clicks OK

### Implementation Details

- `ModalProvider` maintains a queue of imperative modals
- Each method creates a promise, adds modal config to queue, resolves when user responds
- Queue pattern matches existing `GlobalPromptFromBackModal` approach
- Uses the base `<Modal>` component internally for rendering
