// src/features/common/ui-keyboard-help/index.tsx
import { useKeyboardBindings, Kbd } from '@/lib/keyboard-bindings';
import type { BindingKey } from '@/lib/keyboard-bindings';

interface ShortcutItem {
  key: BindingKey;
  description: string;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutItem[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'Global',
    shortcuts: [
      { key: 'cmd+p', description: 'Command palette' },
      { key: 'cmd+n', description: 'New task' },
      { key: 'cmd+l', description: 'Focus input bar' },
      { key: 'cmd+,', description: 'Settings' },
      { key: 'escape', description: 'Dismiss overlay' },
    ],
  },
  {
    title: 'Session Navigation',
    shortcuts: [
      { key: 'cmd+1', description: 'Jump to session 1' },
      { key: 'cmd+2', description: 'Jump to session 2' },
      { key: 'cmd+9', description: 'Jump to session 9' },
      { key: 'cmd+up', description: 'Previous session' },
      { key: 'cmd+down', description: 'Next session' },
      { key: 'cmd+tab', description: 'Next project filter' },
      { key: 'cmd+shift+tab', description: 'Previous project filter' },
    ],
  },
  {
    title: 'Main Workspace (Task Focused)',
    shortcuts: [
      { key: 'cmd+d', description: 'Toggle diff view' },
      { key: 'cmd+shift+s', description: 'Generate summary' },
      { key: 'cmd+o', description: 'Open in VS Code' },
      { key: 'cmd+enter', description: 'Send message' },
    ],
  },
];

function ShortcutRow({ shortcut }: { shortcut: ShortcutItem }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-neutral-200">{shortcut.description}</span>
      <Kbd shortcut={shortcut.key} />
    </div>
  );
}

function Section({ section }: { section: ShortcutSection }) {
  return (
    <div className="mb-4 last:mb-0">
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-neutral-500 uppercase">
        {section.title}
      </h3>
      <div className="space-y-0.5">
        {section.shortcuts.map((shortcut) => (
          <ShortcutRow key={shortcut.key} shortcut={shortcut} />
        ))}
      </div>
    </div>
  );
}

export function KeyboardHelpOverlay({ onClose }: { onClose: () => void }) {
  useKeyboardBindings('keyboard-help-overlay', {
    escape: () => {
      onClose();
      return true;
    },
    'cmd+/': () => {
      onClose();
      return true;
    },
    '?': () => {
      onClose();
      return true;
    },
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-help-title"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[60svh] w-[95svw] max-w-lg flex-col overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5),0_0_100px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-700 px-4 py-3">
          <h2 id="keyboard-help-title" className="font-medium text-white">
            Keyboard Shortcuts
          </h2>
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <Kbd shortcut="escape" /> to close
          </span>
        </div>

        {/* Content */}
        <div className="overflow-y-auto p-4">
          {SHORTCUT_SECTIONS.map((section) => (
            <Section key={section.title} section={section} />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center gap-1 border-t border-neutral-700 px-4 py-3 text-xs text-neutral-500">
          <Kbd shortcut="cmd+/" /> or <Kbd shortcut="?" /> anytime to show this
          help
        </div>
      </div>
    </div>
  );
}
