import type { RawDependency } from './parserRegistry.js';

interface FallbackPattern {
  regex: RegExp;
  /** 1-based capture group holding the specifier. */
  group: number;
}

const PATTERNS: FallbackPattern[] = [
  { regex: /^\s*Import-Module\s+([^\s#;]+)/gim, group: 1 },
  { regex: /^\s*#include\s+["<]([^">]+)[">]/gim, group: 1 },
  { regex: /^\s*(?:source|\.)\s+([^\s#;]+)/gim, group: 1 },
  { regex: /^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gim, group: 1 },
  { regex: /^\s*(?:import|using|include)\s+([^\s;#]+)/gim, group: 1 },
];

const MAX_IMPORTS_PER_FILE = 50;

/**
 * Regex file-level import extraction for fallback-tier files (FR-011, T032).
 * These files are reported as reduced-analysis; the scan never aborts on them.
 */
export function extractFallbackImports(content: string, relPath: string): RawDependency[] {
  const out: RawDependency[] = [];
  const seen = new Set<string>();
  for (const { regex, group } of PATTERNS) {
    regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      const spec = match[group]?.trim();
      if (!spec || seen.has(spec)) continue;
      seen.add(spec);
      out.push({
        fromFile: relPath,
        rawSpecifier: match[0].trim(),
        specKind: spec.startsWith('.') || spec.includes('/') ? 'module-path' : 'external',
        spec,
      });
      if (out.length >= MAX_IMPORTS_PER_FILE) return out;
    }
  }
  return out;
}
