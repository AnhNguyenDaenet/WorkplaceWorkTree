import type { CallReference, TypeEntry, TypeKind } from '../../types.js';
import {
  asTargetTypeName,
  collectNodes,
  dedupeCalls,
  fieldNode,
  fieldText,
  makeTypeId,
  namedChildrenOf,
  relation,
  simpleTypeName,
  type ExtractorOutput,
  type RawDependency,
} from '../parserRegistry.js';

const TYPE_NODES = new Set([
  'class_declaration',
  'abstract_class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'enum_declaration',
]);

const KIND_MAP: Record<string, TypeKind> = {
  class_declaration: 'class',
  abstract_class_declaration: 'class',
  interface_declaration: 'interface',
  type_alias_declaration: 'type',
  enum_declaration: 'enum',
};

function moduleQualifier(relPath: string): string {
  return relPath.replace(/\.(tsx?|jsx?|mts|cts|mjs|cjs)$/i, '');
}

/** Collect heritage relations across TS/JS grammar variants (extends/implements clauses). */
function heritageRelations(typeNode: any): Array<{ kind: 'inherits' | 'implements'; name: string }> {
  const out: Array<{ kind: 'inherits' | 'implements'; name: string }> = [];
  const clauses = collectNodes(
    typeNode,
    new Set(['extends_clause', 'implements_clause', 'extends_type_clause', 'class_heritage']),
  );
  for (const clause of clauses) {
    if (clause.type === 'class_heritage') continue; // container; its children are also collected
    const kind = clause.type === 'implements_clause' ? 'implements' : 'inherits';
    for (const child of namedChildrenOf(clause)) {
      if (['identifier', 'member_expression', 'generic_type', 'type_identifier', 'nested_type_identifier'].includes(child.type)) {
        const name = simpleTypeName(child.text);
        if (name && /^[A-Za-z_$][\w$]*$/.test(name)) out.push({ kind, name });
      }
    }
  }
  return out;
}

function extractCalls(typeNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const call of collectNodes(typeNode, new Set(['call_expression']))) {
    const fn = fieldNode(call, 'function');
    if (!fn) continue;
    if (fn.type === 'member_expression') {
      const methodName = fieldText(fn, 'property');
      if (!methodName) continue;
      calls.push({
        methodName,
        targetTypeName: asTargetTypeName(fieldText(fn, 'object')),
        confidence: 'syntactic',
      });
    } else if (fn.type === 'identifier') {
      calls.push({ methodName: fn.text, targetTypeName: null, confidence: 'syntactic' });
    }
  }
  return dedupeCalls(calls);
}

/** TypeScript/TSX/JavaScript extractor (T027): types, heritage, import resolution hints, calls. */
export function extractTypeScript(
  rootNode: any,
  relPath: string,
  includeCalls: boolean,
  language: string,
): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const imp of collectNodes(rootNode, new Set(['import_statement']))) {
    const source = fieldNode(imp, 'source');
    if (!source) continue;
    const spec = source.text.replace(/^['"`]|['"`]$/g, '');
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: imp.text.trim().replace(/\s+/g, ' '),
      specKind: 'module-path',
      spec,
    });
  }

  const qualifier = moduleQualifier(relPath);
  const types: TypeEntry[] = [];
  for (const node of collectNodes(rootNode, TYPE_NODES)) {
    const name = fieldText(node, 'name');
    if (!name) continue;
    const entry: TypeEntry = {
      id: makeTypeId(language, qualifier, name, relPath),
      name,
      qualifier,
      kind: KIND_MAP[node.type],
      language,
      definingFile: relPath,
      relations: [],
      calls: includeCalls ? extractCalls(node) : [],
    };
    for (const heritage of heritageRelations(node)) {
      entry.relations.push(relation(heritage.kind, heritage.name));
    }
    types.push(entry);
  }
  return { types, dependencies };
}
