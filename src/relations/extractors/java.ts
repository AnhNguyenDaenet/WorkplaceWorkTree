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

const TYPE_NODES = new Set(['class_declaration', 'interface_declaration', 'enum_declaration']);

const KIND_MAP: Record<string, TypeKind> = {
  class_declaration: 'class',
  interface_declaration: 'interface',
  enum_declaration: 'enum',
};

function packageOf(rootNode: any): string {
  const pkg = collectNodes(rootNode, new Set(['package_declaration']))[0];
  if (!pkg) return '';
  const nameNode = namedChildrenOf(pkg).find((c) =>
    ['scoped_identifier', 'identifier'].includes(c.type),
  );
  return nameNode?.text ?? '';
}

function extractCalls(typeNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const invocation of collectNodes(typeNode, new Set(['method_invocation']))) {
    const methodName = fieldText(invocation, 'name');
    if (!methodName) continue;
    calls.push({
      methodName,
      targetTypeName: asTargetTypeName(fieldText(invocation, 'object')),
      confidence: 'syntactic',
    });
  }
  return dedupeCalls(calls);
}

/** Java extractor (T029): classes/interfaces/enums, extends/implements, imports, invocations. */
export function extractJava(rootNode: any, relPath: string, includeCalls: boolean): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const imp of collectNodes(rootNode, new Set(['import_declaration']))) {
    const nameNode = namedChildrenOf(imp).find((c) =>
      ['scoped_identifier', 'identifier'].includes(c.type),
    );
    if (!nameNode) continue;
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: imp.text.trim().replace(/\s+/g, ' '),
      specKind: 'namespace',
      spec: nameNode.text,
    });
  }

  const qualifier = packageOf(rootNode);
  const types: TypeEntry[] = [];
  for (const node of collectNodes(rootNode, TYPE_NODES)) {
    const name = fieldText(node, 'name');
    if (!name) continue;
    const entry: TypeEntry = {
      id: makeTypeId('java', qualifier, name, relPath),
      name,
      qualifier,
      kind: KIND_MAP[node.type],
      language: 'java',
      definingFile: relPath,
      relations: [],
      calls: includeCalls ? extractCalls(node) : [],
    };
    const superclass = fieldNode(node, 'superclass');
    if (superclass) {
      const target = simpleTypeName(
        namedChildrenOf(superclass)[0]?.text ?? superclass.text.replace(/^extends\s+/, ''),
      );
      if (target) entry.relations.push(relation('inherits', target));
    }
    const interfaces = fieldNode(node, 'interfaces');
    if (interfaces) {
      for (const typeList of namedChildrenOf(interfaces)) {
        const targets = typeList.type === 'type_list' ? namedChildrenOf(typeList) : [typeList];
        for (const t of targets) {
          const target = simpleTypeName(t.text);
          if (target) entry.relations.push(relation('implements', target));
        }
      }
    }
    // interface Foo extends Bar → extends_interfaces node
    for (const ext of collectNodes(node, new Set(['extends_interfaces']))) {
      for (const typeList of namedChildrenOf(ext)) {
        const targets = typeList.type === 'type_list' ? namedChildrenOf(typeList) : [typeList];
        for (const t of targets) {
          const target = simpleTypeName(t.text);
          if (target) entry.relations.push(relation('inherits', target));
        }
      }
    }
    types.push(entry);
  }
  return { types, dependencies };
}
