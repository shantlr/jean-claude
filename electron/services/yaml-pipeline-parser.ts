import type { YamlPipelineParameter } from '@shared/pipeline-types';

/** Maximum YAML content size to parse (1 MB). */
const MAX_YAML_CONTENT_LENGTH = 1_048_576;

const VALID_YAML_PARAM_TYPES = new Set([
  'string',
  'boolean',
  'number',
  'object',
  'step',
  'stepList',
  'job',
  'jobList',
]);

/**
 * Parse pipeline parameters from a YAML pipeline file.
 *
 * Uses line-by-line parsing to extract the top-level `parameters:` block
 * and each parameter's name, type, default, and values.
 *
 * Extracted to a standalone module for testability and to keep the
 * Azure DevOps service focused on API concerns.
 */
export function parseYamlParameters(
  yamlContent: string,
): YamlPipelineParameter[] {
  const params: YamlPipelineParameter[] = [];

  if (yamlContent.length > MAX_YAML_CONTENT_LENGTH) {
    console.warn(
      `[pipelines] YAML content too large (${yamlContent.length} bytes), skipping parameter parsing`,
    );
    return params;
  }

  // Normalise line endings and ensure trailing newline so the regex
  // captures the very last line even when the file has no trailing newline.
  const content = yamlContent.replace(/\r\n/g, '\n').replace(/\n?$/, '\n');

  // Find top-level `parameters:` — must appear at the very start of a line
  // with zero indentation.  The `m` flag makes `^` match any line start,
  // so we additionally verify the match is truly at column 0 by checking
  // that it is either at position 0 or preceded by a newline.
  //
  // The capture group uses a possessive-style alternation that avoids
  // overlapping alternatives to prevent ReDoS on pathological inputs.
  const paramBlockRegex =
    /^parameters\s*:\s*\n((?:[ \t]+\S[^\n]*\n|[ \t]*\n)*)/gm;
  let paramBlockMatch: RegExpExecArray | null = null;
  while ((paramBlockMatch = paramBlockRegex.exec(content)) !== null) {
    const idx = paramBlockMatch.index;
    // Ensure the match is truly at column 0 (start of file or preceded by \n)
    if (idx === 0 || content[idx - 1] === '\n') break;
  }
  if (!paramBlockMatch) return params;

  const block = paramBlockMatch[1];

  // Split on list items that contain `name:`
  // Each chunk starts with the name value, followed by the remaining props.
  const entries = block.split(/^[ \t]*-\s+name\s*:\s*/m).filter(Boolean);

  for (const entry of entries) {
    const lines = entry.split('\n');
    const name = unquote(lines[0].trim());
    if (!name) continue;

    const param: YamlPipelineParameter = { name, type: 'string' };

    const typeMatch = entry.match(/^[ \t]+type\s*:\s*(.+)/m);
    if (typeMatch) {
      const raw = unquote(typeMatch[1].trim());
      if (VALID_YAML_PARAM_TYPES.has(raw)) {
        param.type = raw as YamlPipelineParameter['type'];
      }
    }

    // Default — only capture single-line scalar defaults.
    // Multi-line / object defaults (where the value is on subsequent lines)
    // are intentionally skipped to avoid mis-parsing.
    const defaultMatch = entry.match(/^[ \t]+default\s*:\s*(\S.*)$/m);
    if (defaultMatch) param.default = unquote(defaultMatch[1].trim());

    // Parse `values:` block list
    const valuesMatch = entry.match(
      /^[ \t]+values\s*:\s*\n((?:[ \t]+-\s+.+\n?)*)/m,
    );
    if (valuesMatch) {
      param.values = valuesMatch[1]
        .split('\n')
        .map((line) => unquote(line.replace(/^[ \t]+-\s+/, '').trim()))
        .filter(Boolean);
    }

    // Inline values: [a, b, c]
    if (!param.values?.length) {
      const inlineMatch = entry.match(/^[ \t]+values\s*:\s*\[([^\]]+)\]/m);
      if (inlineMatch) {
        param.values = inlineMatch[1]
          .split(',')
          .map((v) => unquote(v.trim()))
          .filter(Boolean);
      }
    }

    params.push(param);
  }

  return params;
}

/** Strip surrounding single/double quotes from a YAML scalar. */
export function unquote(s: string): string {
  if (s.length < 2) return s;
  if (
    (s.startsWith("'") && s.endsWith("'")) ||
    (s.startsWith('"') && s.endsWith('"'))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

/**
 * Validate a YAML filename for safety.
 *
 * Only allows alphanumeric, hyphens, underscores, dots, and forward slashes.
 * Must end with `.yml` or `.yaml`.
 */
export function validateYamlFilename(filename: string): void {
  if (!filename || typeof filename !== 'string') {
    throw new Error('YAML filename is required');
  }
  // Allowlist: only permit safe path characters
  if (!/^[\w\-./]+$/i.test(filename)) {
    throw new Error('YAML filename contains invalid characters');
  }
  if (filename.includes('..')) {
    throw new Error('YAML filename must not contain path traversal sequences');
  }
  const lower = filename.toLowerCase();
  if (!lower.endsWith('.yml') && !lower.endsWith('.yaml')) {
    throw new Error('YAML filename must end with .yml or .yaml');
  }
}
