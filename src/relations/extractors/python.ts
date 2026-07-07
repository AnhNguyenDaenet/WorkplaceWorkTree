import type { CallReference, TypeEntry } from '../../types.js';
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

function moduleQualifier(relPath: string): string {
  return relPath.replace(/\.pyw?$/i, '').replace(/\//g, '.');
}

function extractCalls(classNode: any): CallReference[] {
  const calls: CallReference[] = [];
  for (const call of collectNodes(classNode, new Set(['call']))) {
    const fn = fieldNode(call, 'function');
    if (!fn) continue;
    if (fn.type === 'attribute') {
      const methodName = fieldText(fn, 'attribute');
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

/** Python extractor (T028): classes, base classes, imports with module resolution hints, calls. */
export function extractPython(rootNode: any, relPath: string, includeCalls: boolean): ExtractorOutput {
  const dependencies: RawDependency[] = [];
  for (const imp of collectNodes(rootNode, new Set(['import_statement', 'import_from_statement']))) {
    let spec: string | null = null;
    if (imp.type === 'import_from_statement') {
      spec = fieldText(imp, 'module_name');
    } else {
      const dotted = namedChildrenOf(imp).find((c) =>
        ['dotted_name', 'aliased_import'].includes(c.type),
      );
      spec = dotted?.type === 'aliased_import' ? fieldText(dotted, 'name') : (dotted?.text ?? null);
    }
    if (!spec) continue;
    dependencies.push({
      fromFile: relPath,
      rawSpecifier: imp.text.trim().replace(/\s+/g, ' '),
      specKind: 'module-path',
      spec,
    });
  }

  const qualifier = moduleQualifier(relPath);
  const types: TypeEntry[] = [];
  for (const node of collectNodes(rootNode, new Set(['class_definition']))) {
    const name = fieldText(node, 'name');
    if (!name) continue;
    const entry: TypeEntry = {
      id: makeTypeId('python', qualifier, name, relPath),
      name,
      qualifier,
      kind: 'class',
      language: 'python',
      definingFile: relPath,
      relations: [],
      calls: includeCalls ? extractCalls(node) : [],
    };
    const superclasses = fieldNode(node, 'superclasses');
    if (superclasses) {
      for (const base of namedChildrenOf(superclasses)) {
        if (!['identifier', 'attribute'].includes(base.type)) continue;
        const target = simpleTypeName(base.text);
        if (target && target !== 'object') entry.relations.push(relation('inherits', target));
      }
    }
    types.push(entry);
  }
  return { types, dependencies };
}
