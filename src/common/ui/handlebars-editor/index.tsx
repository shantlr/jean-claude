import Editor, { loader, type OnMount } from '@monaco-editor/react';
import type { editor, IDisposable, IPosition, languages } from 'monaco-editor';
import * as monaco from 'monaco-editor/esm/vs/editor/edcore.main.js';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  flattenProjectFeatures,
  getFeatureReferenceText,
} from '@/lib/prompt-feature-context';
import type { ProjectFeatureMap } from '@shared/types';

const monacoGlobal = globalThis as typeof globalThis & {
  MonacoEnvironment?: {
    getWorker: () => Worker;
  };
};

monacoGlobal.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });

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
  featureMap = null,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
  maxHeight?: string;
  featureMap?: ProjectFeatureMap | null;
}) {
  const disposablesRef = useRef<IDisposable[]>([]);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const featureMapRef = useRef<ProjectFeatureMap | null>(featureMap);
  const isInternalChange = useRef(false);
  const [isEmpty, setIsEmpty] = useState(!value);

  useEffect(() => {
    featureMapRef.current = featureMap;
  }, [featureMap]);

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

      const isInsideOpenHandlebarsExpression = (
        model: editor.ITextModel,
        position: IPosition,
      ) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const lastOpen = textUntilPosition.lastIndexOf('{{');
        const lastClose = textUntilPosition.lastIndexOf('}}');
        return lastOpen !== -1 && lastOpen > lastClose;
      };

      const getActiveFeatureReference = (textUntilPosition: string) => {
        const start = textUntilPosition.lastIndexOf('#');
        if (start < 0) return null;

        const before = start > 0 ? textUntilPosition[start - 1] : undefined;
        if (before && !/\s|[([{'"`]/.test(before)) return null;

        const query = textUntilPosition.slice(start + 1);
        if (/[#\n]/.test(query)) return null;

        return { start, query };
      };

      const keyDownDisposable = monacoEditor.onKeyDown((event) => {
        if (event.ctrlKey && event.keyCode === monaco.KeyCode.Space) {
          event.preventDefault();
          event.stopPropagation();

          const model = monacoEditor.getModel();
          const position = monacoEditor.getPosition();
          if (
            model &&
            position &&
            isInsideOpenHandlebarsExpression(model, position)
          ) {
            monacoEditor.trigger('', 'editor.action.triggerSuggest', {});
          } else {
            monacoEditor.trigger('', 'hideSuggestWidget', {});
          }
        }
      });
      disposablesRef.current.push(keyDownDisposable);

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
            const activeFeatureReference =
              lastOpen <= lastClose
                ? getActiveFeatureReference(textUntilPosition)
                : null;

            if (activeFeatureReference) {
              const features = flattenProjectFeatures(
                featureMapRef.current?.features,
              );
              return {
                suggestions: features.map((feature) => {
                  const referenceText = getFeatureReferenceText(
                    feature,
                    features,
                  );
                  return {
                    label: `#${feature.name}`,
                    kind: monaco.languages.CompletionItemKind.Reference,
                    detail: feature.path.join(' › '),
                    documentation: feature.summary,
                    insertText: `#${referenceText}`,
                    filterText: [
                      feature.name,
                      referenceText,
                      feature.path.join(' '),
                      feature.summary,
                      feature.key_files.join(' '),
                    ].join(' '),
                    range: {
                      startLineNumber: position.lineNumber,
                      endLineNumber: position.lineNumber,
                      startColumn: activeFeatureReference.start + 1,
                      endColumn: position.column,
                    },
                  };
                }),
              };
            }

            if (lastOpen <= lastClose && lastOpen !== -1) {
              return { suggestions: [] };
            }

            // If not inside braces at all, don't suggest
            if (lastOpen === -1) {
              return { suggestions: [] };
            }

            const afterBraces = textUntilPosition.slice(lastOpen + 2);
            const expressionStartColumn =
              lastOpen + 3 + afterBraces.search(/\S|$/);
            const isHelper =
              afterBraces.trimStart().startsWith('#') ||
              afterBraces.trimStart().startsWith('/');
            const lineRemainder = model.getValueInRange({
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: model.getLineMaxColumn(position.lineNumber),
            });
            const endColumnAfterAutoClosedBraces = lineRemainder.startsWith(
              '}}',
            )
              ? position.column + 2
              : position.column;
            const variableRange = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: expressionStartColumn,
              endColumn: position.column,
            };
            const snippetRange = {
              ...variableRange,
              endColumn: endColumnAfterAutoClosedBraces,
            };

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
                  range: snippetRange,
                });
              }
            } else {
              for (const v of VARIABLE_SUGGESTIONS) {
                suggestions.push({
                  label: v.label,
                  kind: monaco.languages.CompletionItemKind.Variable,
                  detail: v.detail,
                  insertText: v.insertText,
                  range: variableRange,
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
                  range: snippetRange,
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
          if (
            !monaco.languages
              .getLanguages()
              .some((language: { id: string }) => language.id === 'handlebars')
          ) {
            monaco.languages.register({ id: 'handlebars' });
          }

          monaco.languages.setLanguageConfiguration('handlebars', {
            brackets: [['{', '}']],
            autoClosingPairs: [{ open: '{', close: '}' }],
            surroundingPairs: [{ open: '{', close: '}' }],
          });

          monaco.languages.setMonarchTokensProvider('handlebars', {
            tokenizer: {
              root: [
                [/\{\{!--/, 'comment.handlebars', '@comment'],
                [/\{\{[#/]?/, 'delimiter.handlebars', '@handlebars'],
              ],
              comment: [
                [/--\}\}/, 'comment.handlebars', '@pop'],
                [/./, 'comment.handlebars'],
              ],
              handlebars: [
                [/\}\}/, 'delimiter.handlebars', '@pop'],
                [/#[\w-]+|\/[\w-]+/, 'keyword.handlebars'],
                [/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/, 'string'],
                [/\b[\w.]+\b/, 'variable.handlebars'],
              ],
            },
          });

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
          fixedOverflowWidgets: false,
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 4,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingIndent: 'same',
          links: false,
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
          wordBasedSuggestions: 'off',
          quickSuggestions: {
            other: true,
            strings: true,
            comments: false,
          },
          tabSize: 2,
          autoClosingBrackets: 'always',
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
