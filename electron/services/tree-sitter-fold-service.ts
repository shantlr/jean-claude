import * as path from 'path';

import { Language, type Node, Parser } from 'web-tree-sitter';

import type { FoldRange } from '@shared/fold-types';

/**
 * Map from Shiki language IDs (used in our language-utils) to tree-sitter grammar file names.
 */
const LANGUAGE_TO_GRAMMAR: Record<string, string> = {
  typescript: 'tree-sitter-typescript',
  tsx: 'tree-sitter-tsx',
  javascript: 'tree-sitter-javascript',
  python: 'tree-sitter-python',
  ruby: 'tree-sitter-ruby',
  go: 'tree-sitter-go',
  rust: 'tree-sitter-rust',
  java: 'tree-sitter-java',
  c: 'tree-sitter-c',
  cpp: 'tree-sitter-cpp',
  csharp: 'tree-sitter-c_sharp',
  css: 'tree-sitter-css',
  html: 'tree-sitter-html',
  bash: 'tree-sitter-bash',
  json: 'tree-sitter-json',
  yaml: 'tree-sitter-yaml',
  toml: 'tree-sitter-toml',
  kotlin: 'tree-sitter-kotlin',
  swift: 'tree-sitter-swift',
  sql: 'tree-sitter-sql',
  php: 'tree-sitter-php',
};

/**
 * Node types that represent foldable scopes in most languages.
 */
const FOLDABLE_NODE_TYPES = new Set([
  // Blocks/bodies
  'block',
  'statement_block',
  'function_body',
  'class_body',
  'enum_body',
  'interface_body',
  'object_type',
  'module',
  'namespace_body',

  // Declarations with bodies
  'function_declaration',
  'function_definition',
  'method_definition',
  'method_declaration',
  'class_declaration',
  'class_definition',
  'interface_declaration',
  'enum_declaration',
  'module_declaration',
  'namespace_declaration',
  'impl_item',
  'trait_item',
  'struct_item',

  // Statements with bodies
  'if_statement',
  'if_expression',
  'else_clause',
  'elif_clause',
  'for_statement',
  'for_expression',
  'while_statement',
  'while_expression',
  'do_statement',
  'switch_statement',
  'match_expression',
  'match_arm',
  'try_statement',
  'catch_clause',
  'finally_clause',
  'with_statement',

  // Object/array literals (multi-line)
  'object',
  'object_expression',
  'dictionary',
  'array',
  'array_expression',
  'list',
  'tuple',

  // Arrow functions / lambdas
  'arrow_function',
  'lambda',
  'lambda_expression',
  'closure_expression',

  // Import groups
  'import_statement',
  'named_imports',

  // Template literals
  'template_string',
  'template_literal_type',

  // JSX
  'jsx_element',
  'jsx_self_closing_element',

  // Comments
  'comment',
  'block_comment',

  // Type definitions
  'type_alias_declaration',
  'type_definition',
  'intersection_type',
  'union_type',

  // Go specific
  'func_literal',
  'composite_literal',
  'literal_value',

  // Rust specific
  'block_expression',

  // Python specific
  'decorated_definition',
  'with_clause',
]);

/**
 * Minimum number of lines a node must span to be foldable.
 */
const MIN_FOLD_LINES = 2;

let parserReady: Promise<void> | null = null;
const languageCache = new Map<string, Language>();

/**
 * Get the path to a tree-sitter grammar WASM file.
 */
function getGrammarPath(grammarName: string): string {
  return path.join(
    __dirname,
    '..',
    '..',
    'node_modules',
    'tree-sitter-wasms',
    'out',
    `${grammarName}.wasm`,
  );
}

/**
 * Initialize the tree-sitter parser (must be called once).
 */
async function ensureParserReady(): Promise<void> {
  if (!parserReady) {
    parserReady = Parser.init({
      locateFile: () =>
        path.join(
          __dirname,
          '..',
          '..',
          'node_modules',
          'web-tree-sitter',
          'web-tree-sitter.wasm',
        ),
    });
  }
  return parserReady;
}

/**
 * Load a tree-sitter language grammar (cached).
 */
async function loadLanguage(language: string): Promise<Language | null> {
  const grammarName = LANGUAGE_TO_GRAMMAR[language];
  if (!grammarName) return null;

  const cached = languageCache.get(language);
  if (cached) return cached;

  try {
    const grammarPath = getGrammarPath(grammarName);
    const lang = await Language.load(grammarPath);
    languageCache.set(language, lang);
    return lang;
  } catch {
    return null;
  }
}

/**
 * Extract fold ranges from a tree-sitter syntax tree.
 */
function extractFoldRanges(rootNode: Node): FoldRange[] {
  const ranges: FoldRange[] = [];
  const seen = new Set<string>();

  function walk(node: Node): void {
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;
    const lineSpan = endLine - startLine;

    if (lineSpan >= MIN_FOLD_LINES && FOLDABLE_NODE_TYPES.has(node.type)) {
      const key = `${startLine}:${endLine}`;
      if (!seen.has(key)) {
        seen.add(key);
        ranges.push({ startLine, endLine });
      }
    }

    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) walk(child);
    }
  }

  walk(rootNode);

  // Sort by start line asc, then end line desc (so outermost/longest range comes first)
  ranges.sort((a, b) => a.startLine - b.startLine || b.endLine - a.endLine);

  // Keep only the outermost (longest) range for each startLine
  const deduplicated: FoldRange[] = [];
  let lastStartLine = -1;
  for (const range of ranges) {
    if (range.startLine !== lastStartLine) {
      deduplicated.push(range);
      lastStartLine = range.startLine;
    }
  }

  return deduplicated;
}

/** Shared parser instance (reused to avoid WASM memory overhead). */
let sharedParser: Parser | null = null;

/**
 * Compute fold ranges for a given source code and language.
 * Returns an array of foldable line ranges based on the AST.
 * Uses a shared parser instance, serializing access.
 */
export async function computeFoldRanges(
  content: string,
  language: string,
): Promise<FoldRange[]> {
  await ensureParserReady();

  const lang = await loadLanguage(language);
  if (!lang) {
    return [];
  }

  if (!sharedParser) {
    sharedParser = new Parser();
  }
  sharedParser.setLanguage(lang);

  const tree = sharedParser.parse(content);
  if (!tree) {
    return [];
  }

  const ranges = extractFoldRanges(tree.rootNode);
  tree.delete();

  return ranges;
}
