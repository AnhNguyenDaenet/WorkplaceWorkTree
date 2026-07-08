import path from 'node:path';
import * as TreeSitter from 'web-tree-sitter';
import { resolveGrammarsDir } from '../core/assets.js';
import type { CallReference, TypeEntry, TypeRelation } from '../types.js';

/**
 * Lazy web-tree-sitter grammar loading (research R3). Grammars ship as WASM in
 * assets/grammars/, so no native compilation and no network access at runtime.
 * The import shape is feature-detected to tolerate web-tree-sitter API variations.
 */

const GRAMMAR_FILES: Record<string, string> = {
  csharp: 'tree-sitter-c_sharp.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-tsx.wasm',
  javascript: 'tree-sitter-javascript.wasm',
  python: 'tree-sitter-python.wasm',
  java: 'tree-sitter-java.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
};

const ts = TreeSitter as any;
const ParserCtor: any = ts.Parser ?? ts.default ?? TreeSitter;

let initPromise: Promise<void> | null = null;
const parsers = new Map<string, any>();

/** Get (and cache) a parser for a deep-tier language; null when no grammar is available. */
export async function getParser(language: string): Promise<any | null> {
  const file = GRAMMAR_FILES[language];
  if (!file) return null;
  if (!initPromise) initPromise = ParserCtor.init();
  await initPromise;
  const cached = parsers.get(language);
  if (cached) return cached;
  const LanguageNs: any = ts.Language ?? ParserCtor.Language;
  const lang = await LanguageNs.load(path.join(resolveGrammarsDir(), file));
  const parser = new ParserCtor();
  parser.setLanguage(lang);
  parsers.set(language, parser);
  return parser;
}

export function treeHasError(rootNode: any): boolean {
  const he = rootNode?.hasError;
  return typeof he === 'function' ? Boolean(he.call(rootNode)) : Boolean(he);
}

// ---------------------------------------------------------------------------
// Shared syntax-tree helpers + extractor output types (used by all extractors)
// ---------------------------------------------------------------------------

export interface RawDependency {
  fromFile: string;
  rawSpecifier: string;
  /** How to resolve: namespace lookup (C#/Java), module path (TS/Python), or unresolvable. */
  specKind: 'namespace' | 'module-path' | 'external';
  spec: string;
}

export interface ExtractorOutput {
  types: TypeEntry[];
  dependencies: RawDependency[];
}

export function collectNodes(root: any, types: Set<string>): any[] {
  const out: any[] = [];
  const visit = (node: any): void => {
    if (types.has(node.type)) out.push(node);
    const count = node.namedChildCount ?? 0;
    for (let i = 0; i < count; i++) {
      const child = node.namedChild(i);
      if (child) visit(child);
    }
  };
  visit(root);
  return out;
}

export function fieldText(node: any, field: string): string | null {
  const child = node.childForFieldName?.(field);
  return child ? (child.text as string) : null;
}

export function fieldNode(node: any, field: string): any | null {
  return node.childForFieldName?.(field) ?? null;
}

export function namedChildrenOf(node: any): any[] {
  const out: any[] = [];
  const count = node.namedChildCount ?? 0;
  for (let i = 0; i < count; i++) {
    const child = node.namedChild(i);
    if (child) out.push(child);
  }
  return out;
}

export function makeTypeId(
  language: string,
  qualifier: string,
  name: string,
  relPath: string,
): string {
  const qualified = qualifier ? `${qualifier}.${name}` : name;
  return `${language}:${qualified}@${relPath}`;
}

const IDENTIFIER_RE = /^[A-Z][A-Za-z0-9_]*$/;

export function asTargetTypeName(text: string | null): string | null {
  if (!text) return null;
  return IDENTIFIER_RE.test(text) ? text : null;
}

/** Deduplicate + cap call references for readability. */
export function dedupeCalls(calls: CallReference[], cap = 30): CallReference[] {
  const seen = new Set<string>();
  const out: CallReference[] = [];
  for (const call of calls) {
    const key = `${call.targetTypeName ?? ''}.${call.methodName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(call);
    if (out.length >= cap) break;
  }
  return out;
}

export function simpleTypeName(raw: string): string {
  return raw.split('.').pop()!.replace(/<.*$/s, '').trim();
}

export function relation(kind: TypeRelation['kind'], targetName: string): TypeRelation {
  return { kind, targetName, targetId: null };
}
