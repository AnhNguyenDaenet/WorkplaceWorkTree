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
  'interface_declaration',
  'struct_declaration',
  'enum_declaration',
]);

const KIND_MAP: Record<string, TypeKind> = {
  class_declaration: 'class',
  interface_declaration: 'interface',
  struct_declaration: 'struct',
  enum_declaration: 'enum',
};

function namespaceOf(node: any): string {
  const parts: string[] = [];
  let current = node.parent;
  while (current) {
    if (
      current.type === 'namespace_declaration' ||
      current.type === 'file_scoped_namespace_declaration'
    ) {
      const name = fieldText(current, 'name');
      if (name) parts.unshift(name);
    }
    current = current.parent;
  }
  return parts.join('.');
}

function extractCalls(typeNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const invocation of collectNodes(typeNode, new Set(['invocation_expression']))) {
    const fn = fieldNode(invocation, 'function');
    if (!fn) continue;
    if (fn.type === 'member_access_expression') {
      const methodName = fieldText(fn, 'name');
      if (!methodName) continue;
      const target = asTargetTypeName(fieldText(fn, 'expression'));
      calls.push({ methodName, targetTypeName: target, confidence: 'syntactic' });
    } else if (fn.type === 'identifier') {
      calls.push({ methodName: fn.text, targetTypeName: null, confidence: 'syntactic' });
    }
  }
  return dedupeCalls(calls);
}

/** C#: types + namespace qualifiers, base-list inheritance/implements, usings, calls (T026). */
export function extractCSharp(rootNode: any, relPath: string, includeCalls: boolean): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const using of collectNodes(rootNode, new Set(['using_directive']))) {
    const nameNode = namedChildrenOf(using).find((c) =>
      ['qualified_name', 'identifier', 'member_access_expression'].includes(c.type),
    );
    const spec = nameNode?.text ?? using.text.replace(/^using\s+|;\s*$/g, '').trim();
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: using.text.trim().replace(/\s+/g, ' '),
      specKind: 'namespace',
      spec,
    });
  }

  const types: TypeEntry[] = [];
  for (const node of collectNodes(rootNode, TYPE_NODES)) {
    const name = fieldText(node, 'name');
    if (!name) continue;
    const qualifier = namespaceOf(node);
    const kind = KIND_MAP[node.type];
    const entry: TypeEntry = {
      id: makeTypeId('csharp', qualifier, name, relPath),
      name,
      qualifier,
      kind,
      language: 'csharp',
      definingFile: relPath,
      relations: [],
      calls: includeCalls ? extractCalls(node) : [],
    };
    const baseList = namedChildrenOf(node).find((c) => c.type === 'base_list');
    if (baseList) {
      for (const base of namedChildrenOf(baseList)) {
        if (!['identifier', 'qualified_name', 'generic_name'].includes(base.type)) continue;
        const target = simpleTypeName(base.text);
        if (!target) continue;
        // C# convention: I-prefixed names in a class base list are interfaces.
        const looksInterface = /^I[A-Z]/.test(target);
        const relKind =
          node.type === 'interface_declaration' ? 'inherits' : looksInterface ? 'implements' : 'inherits';
        entry.relations.push(relation(relKind, target));
      }
    }
    types.push(entry);
  }
  return { types, dependencies };
}
