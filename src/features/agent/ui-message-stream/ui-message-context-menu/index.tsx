import { Bug, Shield } from 'lucide-react';
import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useRegisterKeyboardBindings } from '@/common/context/keyboard-bindings';
import { useRegisterOverlay } from '@/common/context/overlay';

export interface ContextMenuItem {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

export function useMessageContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const overlayId = 'message-context-menu';

  const close = useCallback(() => setMenu(null), []);

  const openMenu = useCallback((e: MouseEvent, items: ContextMenuItem[]) => {
    if (items.length === 0) return;
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  }, []);

  useRegisterOverlay({
    id: overlayId,
    refs: [menuRef],
    onClose: close,
    enabled: !!menu,
  });

  useRegisterKeyboardBindings(
    overlayId,
    {
      escape: () => {
        close();
        return true;
      },
    },
    { enabled: !!menu },
  );

  // Adjust position so menu doesn't overflow viewport
  const [adjustedPos, setAdjustedPos] = useState<{
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    if (!menu) {
      setAdjustedPos(null);
      return;
    }
    const frame = requestAnimationFrame(() => {
      const el = menuRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      let { x, y } = menu;
      if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - 4;
      }
      if (y + rect.height > window.innerHeight) {
        y = window.innerHeight - rect.height - 4;
      }
      setAdjustedPos({ x, y });
    });
    return () => cancelAnimationFrame(frame);
  }, [menu]);

  const portal =
    menu &&
    createPortal(
      <div
        ref={menuRef}
        role="menu"
        className="bg-surface fixed z-50 min-w-48 overflow-y-auto rounded-xl py-1 shadow-lg"
        style={{
          left: adjustedPos?.x ?? menu.x,
          top: adjustedPos?.y ?? menu.y,
          visibility: adjustedPos ? 'visible' : 'hidden',
        }}
      >
        {menu.items.map((item) => (
          <button
            key={item.label}
            role="menuitem"
            tabIndex={-1}
            onClick={() => {
              item.onClick();
              close();
            }}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-300 transition-colors hover:bg-neutral-700 focus:bg-neutral-700 focus:outline-none"
          >
            <span className="h-3.5 w-3.5 shrink-0 [&>svg]:h-full [&>svg]:w-full">
              {item.icon}
            </span>
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
      </div>,
      document.body,
    );

  return { openMenu, portal };
}

// Pre-built item factories

export function showRawMessageItem(
  onShowRawMessage: (entryId: string) => void,
  entryId: string,
): ContextMenuItem {
  return {
    label: 'Show in Raw Messages',
    icon: <Bug />,
    onClick: () => onShowRawMessage(entryId),
  };
}

export function addBashToPermissionsItem(
  onAdd: (command: string) => void,
  command: string,
): ContextMenuItem {
  return {
    label: 'Add to permissions\u2026',
    icon: <Shield />,
    onClick: () => onAdd(command),
  };
}
