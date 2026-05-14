import Editor, { type OnMount } from '@monaco-editor/react';
import type { editor, IDisposable, languages } from 'monaco-editor';
import { useCallback, useEffect, useRef, useState } from 'react';

const VARIABLE_SUGGESTIONS: Array<{
  label: string;
  detail: string;
  insertText: string;
}> = [
  {
    label: 'task.worktreePath',
    detail: 'Worktree path',
    insertText: 'task.worktreePath',
  },
  { label: 'task.name', detail: 'Task name', insertText: 'task.name' },
  { label: 'task.note', detail: 'Task note', insertText: 'task.note' },
  {
    label: 'task.sourceBranch',
    detail: 'Source branch',
    insertText: 'task.sourceBranch',
  },
  {
    label: 'task.branchName',
    detail: 'Branch name',
    insertText: 'task.branchName',
  },
  { label: 'project.name', detail: 'Project name', insertText: 'project.name' },
  { label: 'project.path', detail: 'Project path', insertText: 'project.path' },
  {
    label: 'workItems',
    detail: 'Array of work items',
    insertText: 'workItems',
  },
  { label: 'this.id', detail: 'Work item ID', insertText: 'this.id' },
  { label: 'this.title', detail: 'Work item title', insertText: 'this.title' },
  {
    label: 'this.description',
    detail: 'Work item description',
    insertText: 'this.description',
  },
  {
    label: 'this.comments',
    detail: 'Work item comments',
    insertText: 'this.comments',
  },
  { label: 'this.author', detail: 'Comment author', insertText: 'this.author' },
  { label: 'this.date', detail: 'Comment date', insertText: 'this.date' },
  { label: 'this.body', detail: 'Comment body', insertText: 'this.body' },
  {
    label: 'this.testCases',
    detail: 'Test cases array',
    insertText: 'this.testCases',
  },
];

const SNIPPET_SUGGESTIONS: Array<{
  label: string;
  detail: string;
  insertText: string;
}> = [
  {
    label: '#each',
    detail: 'Loop over array',
    insertText: '#each ${1:workItems}}}\n  $0\n{{/each',
  },
  {
    label: '#if',
    detail: 'Conditional block',
    insertText: '#if ${1:condition}}}\n  $0\n{{/if',
  },
  {
    label: 'ifPresent',
    detail: 'Render if value exists',
    insertText: 'ifPresent ${1:value}}}\n  $0\n{{/ifPresent',
  },
];

export function HandlebarsEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = '120px',
  maxHeight = '300px',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
}) {
  const disposablesRef = useRef<IDisposable[]>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const isInternalChange = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  // Sync external value changes into the editor (controlled behavior)
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const currentValue = ed.getValue();
    if (currentValue !== value) {
      ed.setValue(value);
    }
  }, [value]);

  const handleMount: OnMount = useCallback(
    (monacoEditor, monaco) => {
      editorRef.current = monacoEditor;

      // Register completion provider for handlebars
      const completionDisposable =
        monaco.languages.registerCompletionItemProvider('handlebars', {
          triggerCharacters: ['{', '.', '#', '/'],
          provideCompletionItems: (
            model: editor.ITextModel,
            position: { lineNumber: number; column: number },
          ) => {
            const textUntilPosition = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: 1,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            });

            // Check if inside {{ }}
            const lastOpen = textUntilPosition.lastIndexOf('{{');
            const lastClose = textUntilPosition.lastIndexOf('}}');
            if (lastOpen <= lastClose && lastOpen !== -1) {
              return { suggestions: [] };
            }

            // If not inside braces at all, don't suggest
            if (lastOpen === -1) {
              return { suggestions: [] };
            }

            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };

            const afterBraces = textUntilPosition.slice(lastOpen + 2);
            const isHelper =
              afterBraces.trimStart().startsWith('#') ||
              afterBraces.trimStart().startsWith('/');

            const suggestions: languages.CompletionItem[] = [];

            if (isHelper) {
              for (const s of SNIPPET_SUGGESTIONS) {
                suggestions.push({
                  label: s.label,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: s.detail,
                  insertText: s.insertText,
                  insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet,
                  range,
                });
              }
            } else {
              for (const v of VARIABLE_SUGGESTIONS) {
                suggestions.push({
                  label: v.label,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: v.detail,
                  insertText: v.insertText,
                  range,
                });
              }
              for (const s of SNIPPET_SUGGESTIONS) {
                suggestions.push({
                  label: s.label,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  detail: s.detail,
                  insertText: s.insertText,
                  insertTextRules:
                    monaco.languages.CompletionItemInsertTextRule
                      .InsertAsSnippet,
                  range,
                });
              }
            }

            return { suggestions };
          },
        });

      disposablesRef.current.push(completionDisposable);

      // Auto-resize editor height based on content
      const updateHeight = () => {
        const contentHeight = Math.min(
          Math.max(
            monacoEditor.getContentHeight(),
            parseInt(minHeight, 10) || 120,
          ),
          parseInt(maxHeight, 10) || 300,
        );
        const container = monacoEditor.getDomNode();
        if (container) {
          container.style.height = `${contentHeight}px`;
        }
        monacoEditor.layout();
      };

      const contentDisposable =
        monacoEditor.onDidContentSizeChange(updateHeight);
      disposablesRef.current.push(contentDisposable);
      updateHeight();
    },
    [minHeight, maxHeight],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const d of disposablesRef.current) {
        d.dispose();
      }
      disposablesRef.current = [];
      editorRef.current = null;
    };
  }, []);

  return (
    <div
      className={className}
      style={{ minHeight, maxHeight, position: 'relative' }}
    >
      {isEmpty && placeholder && (
        <div
          className="text-ink-3 pointer-events-none absolute top-2 left-1 z-10 font-mono text-[13px]"
          style={{ paddingLeft: '4px' }}
        >
          {placeholder}
        </div>
      )}
      <Editor
        defaultValue={value}
        language="handlebars"
        theme="vs-dark"
        onChange={(val) => {
          isInternalChange.current = true;
          setIsEmpty(!val);
          onChange(val ?? '');
        }}
        onMount={handleMount}
        beforeMount={(monaco) => {
          // Define dark theme matching app
          monaco.editor.defineTheme('handlebars-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'delimiter.handlebars', foreground: 'c678dd' },
              { token: 'variable.handlebars', foreground: '61afef' },
              { token: 'keyword.handlebars', foreground: 'c678dd' },
              { token: 'tag', foreground: 'e06c75' },
              { token: 'attribute.name', foreground: 'd19a66' },
              { token: 'attribute.value', foreground: '98c379' },
              { token: 'string', foreground: '98c379' },
              { token: 'comment', foreground: '5c6370' },
            ],
            colors: {
              'editor.background': '#1e1e2e',
              'editor.foreground': '#abb2bf',
              'editorCursor.foreground': '#61afef',
              'editor.selectionBackground': '#3e4451',
              'editor.lineHighlightBackground': '#2c313c',
              'editorWidget.background': '#21252b',
              'editorSuggestWidget.background': '#21252b',
              'editorSuggestWidget.border': '#3e4451',
              'editorSuggestWidget.selectedBackground': '#2c313c',
            },
          });
        }}
        options={{
          theme: 'handlebars-dark',
          fixedOverflowWidgets: true,
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 4,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingIndent: 'same',
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace',
          padding: { top: 8, bottom: 8 },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          overviewRulerLanes: 0,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'hidden',
            verticalScrollbarSize: 8,
          },
          suggest: {
            showIcons: true,
            showStatusBar: false,
          },
          quickSuggestions: {
            other: true,
            strings: true,
            comments: false,
          },
          tabSize: 2,
          renderLineHighlight: 'none',
          contextmenu: false,
        }}
        wrapperProps={{
          onBlur: () => editorRef.current?.trigger('', 'hideSuggestWidget', {}),
        }}
        loading={null}
      />
    </div>
  );
}
