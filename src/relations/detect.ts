import path from 'node:path';

export type AnalysisTier = 'deep' | 'fallback' | 'none';

export interface Detection {
  /** Language id (grammar key for deep tier, display label otherwise); null when unknown. */
  language: string | null;
  tier: AnalysisTier;
}

/** Deep-tier languages parsed with tree-sitter (research R3/R4). */
const DEEP_BY_EXT: Record<string, string> = {
  '.cs': 'csharp',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.pyw': 'python',
  '.java': 'java',
  '.go': 'go',
  '.rs': 'rust',
};

/** Fallback-tier: regex file-level import extraction only (FR-011). */
const FALLBACK_BY_EXT: Record<string, string> = {
  '.ps1': 'powershell',
  '.psm1': 'powershell',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.scala': 'scala',
  '.pl': 'perl',
  '.pm': 'perl',
  '.lua': 'lua',
  '.r': 'r',
  '.sql': 'sql',
  '.vue': 'vue',
  '.svelte': 'svelte',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cc': 'cpp',
  '.hh': 'cpp',
};

/** Well-known non-analyzable extensions, labeled for the coverage table. */
const NONE_BY_EXT: Record<string, string> = {
  '.md': 'markdown',
  '.markdown': 'markdown',
  '.txt': 'text',
  '.json': 'json',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
};

/**
 * Detect the language and analysis tier for a file: extension mapping first,
 * shebang sniffing for extensionless scripts (research R4).
 */
export function detectFile(relPath: string, firstLine?: string): Detection {
  const ext = path.extname(relPath).toLowerCase();
  if (ext in DEEP_BY_EXT) return { language: DEEP_BY_EXT[ext], tier: 'deep' };
  if (ext in FALLBACK_BY_EXT) return { language: FALLBACK_BY_EXT[ext], tier: 'fallback' };
  if (ext in NONE_BY_EXT) return { language: NONE_BY_EXT[ext], tier: 'none' };

  if (ext === '' && firstLine?.startsWith('#!')) {
    if (/python/i.test(firstLine)) return { language: 'python', tier: 'deep' };
    if (/node/i.test(firstLine)) return { language: 'javascript', tier: 'deep' };
    if (/\b(sh|bash|zsh)\b/.test(firstLine)) return { language: 'shell', tier: 'fallback' };
  }
  return { language: null, tier: 'none' };
}
