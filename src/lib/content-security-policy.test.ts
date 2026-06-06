import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

describe('Content-Security-Policy', () => {
  it('allows Shiki to compile WebAssembly for syntax highlighting', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

    expect(html).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    );
  });

  it('allows local blob video previews', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');

    expect(html).toContain("media-src 'self' blob:");
  });

  it('uses bundled Monaco instead of the default CDN loader', () => {
    const editor = readFileSync(
      resolve(__dirname, '../common/ui/handlebars-editor/index.tsx'),
      'utf8',
    );

    expect(editor).toContain('edcore.main.js');
    expect(editor).toContain('editor.worker?worker');
    expect(editor).toContain('MonacoEnvironment');
    expect(editor).toContain('loader.config({ monaco })');
    expect(editor).not.toContain('cdn.jsdelivr.net');
  });
});
