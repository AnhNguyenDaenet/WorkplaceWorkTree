import type { CallReference, TypeEntry, TypeKind } from '../../types.js';
import {
  asTargetTypeName,
  collectNodes,
  dedupeCalls,
  fieldNode,
  fieldText,
  makeTypeId,
  namedChildrenOf,
  type ExtractorOutput,
  type RawDependency,
} from '../parserRegistry.js';

function packageOf(rootNode: any): string {
  const clause = collectNodes(rootNode, new Set(['package_clause']))[0];
  if (!clause) return '';
  const ident = namedChildrenOf(clause).find((c) => c.type === 'package_identifier');
  return ident?.text ?? '';
}

function extractCalls(rootNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const call of collectNodes(rootNode, new Set(['call_expression']))) {
    const fn = fieldNode(call, 'function');
    if (!fn) continue;
    if (fn.type === 'selector_expression') {
      const methodName = fieldText(fn, 'field');
      if (!methodName) continue;
      calls.push({
        methodName,
        targetTypeName: asTargetTypeName(fieldText(fn, 'operand')),
        confidence: 'syntactic',
      });
    } else if (fn.type === 'identifier') {
      calls.push({ methodName: fn.text, targetTypeName: null, confidence: 'syntactic' });
    }
  }
  return dedupeCalls(calls);
}

/** Go extractor (T030): structs/interfaces with package qualifier, imports, call expressions. */
export function extractGo(rootNode: any, relPath: string, includeCalls: boolean): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const spec of collectNodes(rootNode, new Set(['import_spec']))) {
    const pathNode = fieldNode(spec, 'path') ?? namedChildrenOf(spec).at(-1);
    if (!pathNode) continue;
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: `import ${pathNode.text}`,
      specKind: 'external',
      spec: pathNode.text.replace(/^"|"$/g, ''),
    });
  }

  const qualifier = packageOf(rootNode);
  // Calls in Go frequently live in package-level funcs, not inside type bodies:
  // attach file-level calls to the first declared type as best-effort context.
  const fileCalls = includeCalls ? extractCalls(rootNode) : [];

  const types: TypeEntry[] = [];
  for (const spec of collectNodes(rootNode, new Set(['type_spec']))) {
    const name = fieldText(spec, 'name');
    if (!name) continue;
    const typeNode = fieldNode(spec, 'type');
    let kind: TypeKind = 'type';
    if (typeNode?.type === 'struct_type') kind = 'struct';
    else if (typeNode?.type === 'interface_type') kind = 'interface';
    types.push({
      id: makeTypeId('go', qualifier, name, relPath),
      name,
      qualifier,
      kind,
      language: 'go',
      definingFile: relPath,
      relations: [],
      calls: types.length === 0 ? fileCalls : [],
    });
  }
  return { types, dependencies };
}
