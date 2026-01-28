import { BundledLanguage, SpecialLanguage } from 'shiki';

/**
 * Map file extensions to Shiki language identifiers.
 * Duplicated from electron/ipc/handlers.ts since this runs in renderer.
 */
const LANGUAGE_MAP: Record<string, BundledLanguage | SpecialLanguage> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  py: 'python',
  rb: 'ruby',
  go: 'go',
  rs: 'rust',
  java: 'java',
  kt: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  h: 'c',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  html: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  md: 'markdown',
  sql: 'sql',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  toml: 'toml',
  ini: 'ini',
  dockerfile: 'dockerfile',
};

/**
 * Get Shiki language identifier from a file path.
 * Returns 'text' if the extension is not recognized.
 */
export function getLanguageFromPath(
  filePath: string,
): BundledLanguage | SpecialLanguage {
  // Extract extension from path (handle paths like "Dockerfile" with no extension)
  const filename = filePath.split('/').pop() || filePath;
  const ext = filename.includes('.')
    ? filename.split('.').pop()?.toLowerCase()
    : filename.toLowerCase();

  if (!ext) return 'text';

  return LANGUAGE_MAP[ext] || 'text';
}
