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
});
