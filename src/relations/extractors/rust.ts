import type { CallReference, TypeEntry, TypeKind } from '../../types.js';
import {
  asTargetTypeName,
  collectNodes,
  dedupeCalls,
  fieldNode,
  fieldText,
  makeTypeId,
  relation,
  simpleTypeName,
  type ExtractorOutput,
  type RawDependency,
} from '../parserRegistry.js';

const TYPE_NODES = new Set(['struct_item', 'enum_item', 'trait_item']);

const KIND_MAP: Record<string, TypeKind> = {
  struct_item: 'struct',
  enum_item: 'enum',
  trait_item: 'trait',
};

function moduleQualifier(relPath: string): string {
  return relPath.replace(/\.rs$/i, '').replace(/\//g, '::');
}

function extractCalls(rootNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const call of collectNodes(rootNode, new Set(['call_expression']))) {
    const fn = fieldNode(call, 'function');
    if (!fn) continue;
    if (fn.type === 'field_expression') {
      const methodName = fieldText(fn, 'field');
      if (!methodName) continue;
      calls.push({
        methodName,
        targetTypeName: asTargetTypeName(fieldText(fn, 'value')),
        confidence: 'syntactic',
      });
    } else if (fn.type === 'identifier') {
      calls.push({ methodName: fn.text, targetTypeName: null, confidence: 'syntactic' });
    } else if (fn.type === 'scoped_identifier') {
      const methodName = fieldText(fn, 'name');
      if (!methodName) continue;
      calls.push({
        methodName,
        targetTypeName: asTargetTypeName(fieldText(fn, 'path')),
        confidence: 'syntactic',
      });
    }
  }
  return dedupeCalls(calls);
}

/** Rust extractor (T031): structs/enums/traits, `impl Trait for Type` relations, use declarations. */
export function extractRust(rootNode: any, relPath: string, includeCalls: boolean): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const use of collectNodes(rootNode, new Set(['use_declaration']))) {
    const arg = fieldNode(use, 'argument');
    if (!arg) continue;
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: use.text.trim().replace(/\s+/g, ' '),
      specKind: 'external',
      spec: arg.text,
    });
  }

  const qualifier = moduleQualifier(relPath);
  const fileCalls = includeCalls ? extractCalls(rootNode) : [];
  const types: TypeEntry[] = [];
  for (const node of collectNodes(rootNode, TYPE_NODES)) {
    const name = fieldText(node, 'name');
    if (!name) continue;
    types.push({
      id: makeTypeId('rust', qualifier, name, relPath),
      name,
      qualifier,
      kind: KIND_MAP[node.type],
      language: 'rust',
      definingFile: relPath,
      relations: [],
      calls: types.length === 0 ? fileCalls : [],
    });
  }

  // impl Trait for Type → implements relation on the type (same file lookup).
  for (const impl of collectNodes(rootNode, new Set(['impl_item']))) {
    const traitNode = fieldNode(impl, 'trait');
    const typeNode = fieldNode(impl, 'type');
    if (!traitNode || !typeNode) continue;
    const traitName = simpleTypeName(traitNode.text.split('::').pop() ?? traitNode.text);
    const typeName = simpleTypeName(typeNode.text.split('::').pop() ?? typeNode.text);
    const target = types.find((t) => t.name === typeName);
    if (target && traitName) {
      target.relations.push(relation('implements', traitName));
    }
  }
  return { types, dependencies };
}
