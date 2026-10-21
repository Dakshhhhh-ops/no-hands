/**
 * RFC 6902 JSON Patch Engine
 * Implements atomic diffing, forward patching, and inverse rollback patch generation.
 */

export type JsonPatchOp = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

export interface JsonPatchOperation {
  op: JsonPatchOp;
  path: string; // RFC 6901 JSON Pointer, e.g. "/components/2/sub"
  value?: JsonValue;
  from?: string;
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Escapes characters for JSON Pointer (RFC 6901)
 */
function escapePointer(str: string): string {
  return str.replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Unescapes characters from JSON Pointer (RFC 6901)
 */
function unescapePointer(str: string): string {
  return str.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Splits a JSON Pointer path into tokens
 */
function parsePointer(path: string): string[] {
  if (!path || path === '/') return [];
  const parts = path.split('/');
  if (parts[0] === '') parts.shift();
  return parts.map(unescapePointer);
}

/**
 * Traverses a document following a JSON Pointer path
 */
function getValueAtPath(doc: JsonValue, path: string): JsonValue | undefined {
  const tokens = parsePointer(path);
  let curr: JsonValue | undefined = doc;
  for (const token of tokens) {
    if (curr === null || curr === undefined) return undefined;
    if (Array.isArray(curr)) {
      const idx = Number(token);
      curr = curr[idx];
    } else {
      curr = (curr as Record<string, JsonValue>)[token];
    }
  }
  return curr;
}

/**
 * Generates an RFC 6902 JSON Patch by comparing two JavaScript objects/documents.
 */
export function generateJsonPatch(beforeObj: JsonValue, afterObj: JsonValue, prefix = ''): JsonPatchOperation[] {
  const patches: JsonPatchOperation[] = [];

  if (beforeObj === afterObj) return patches;

  // Handle primitives, nulls, or type mismatches
  if (
    typeof beforeObj !== 'object' ||
    beforeObj === null ||
    typeof afterObj !== 'object' ||
    afterObj === null
  ) {
    if (beforeObj !== afterObj) {
      patches.push({
        op: 'replace',
        path: prefix || '/',
        value: structuredClone(afterObj),
      });
    }
    return patches;
  }

  // Handle Arrays
  if (Array.isArray(beforeObj) && Array.isArray(afterObj)) {
    const maxLength = Math.max(beforeObj.length, afterObj.length);
    for (let i = 0; i < maxLength; i++) {
      const currentPath = `${prefix}/${i}`;
      if (i >= beforeObj.length) {
        patches.push({
          op: 'add',
          path: `${prefix}/-`, // Append in RFC 6902
          value: structuredClone(afterObj[i]),
        });
      } else if (i >= afterObj.length) {
        patches.push({
          op: 'remove',
          path: `${prefix}/${afterObj.length}`, // Repeated removal at tail
        });
      } else {
        patches.push(...generateJsonPatch(beforeObj[i], afterObj[i], currentPath));
      }
    }
    return patches;
  }

  // Handle Objects
  const beforeKeys = Object.keys(beforeObj);
  const afterKeys = Object.keys(afterObj);
  const allKeys = new Set([...beforeKeys, ...afterKeys]);

  for (const key of allKeys) {
    const currentPath = `${prefix}/${escapePointer(key)}`;
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);

    if (hasBefore && !hasAfter) {
      patches.push({
        op: 'remove',
        path: currentPath,
      });
    } else if (!hasBefore && hasAfter) {
      patches.push({
        op: 'add',
        path: currentPath,
        value: structuredClone((afterObj as Record<string, JsonValue>)[key]),
      });
    } else {
      patches.push(...generateJsonPatch(
        (beforeObj as Record<string, JsonValue>)[key],
        (afterObj as Record<string, JsonValue>)[key],
        currentPath
      ));
    }
  }

  return patches;
}

/**
 * Applies an RFC 6902 JSON Patch onto a base document (pure/immutable, returns cloned result)
 * and generates the exact inverse rollback patch.
 */
export function applyJsonPatch<T extends JsonValue>(
  baseDoc: T,
  patches: JsonPatchOperation[]
): { result: T; inversePatch: JsonPatchOperation[] } {
  const cloned = structuredClone(baseDoc);
  const inversePatch: JsonPatchOperation[] = [];

  // Helper to resolve parent and property/index
  function getParentAndKey(doc: JsonValue, path: string): { parent: JsonValue; key: string | number } {
    const tokens = parsePointer(path);
    if (tokens.length === 0) throw new Error('Cannot target root document directly for add/remove');
    let parent: JsonValue = doc;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i];
      if (Array.isArray(parent)) {
        parent = parent[Number(t)];
      } else {
        parent = (parent as Record<string, JsonValue>)[t];
      }
      if (parent === undefined || parent === null) {
        throw new Error(`Invalid patch path token: "${t}" in path: "${path}"`);
      }
    }
    const lastToken = tokens[tokens.length - 1];
    return {
      parent,
      key: Array.isArray(parent) ? (lastToken === '-' ? parent.length : Number(lastToken)) : lastToken,
    };
  }

  // Process patches in order and record reverse actions
  for (const patch of patches) {
    if (patch.path === '' || patch.path === '/') {
      if (patch.op === 'replace') {
        inversePatch.unshift({
          op: 'replace',
          path: patch.path,
          value: structuredClone(cloned),
        });
        return { result: structuredClone(patch.value as T), inversePatch };
      }
      throw new Error(`Unsupported root operation: ${patch.op}`);
    }

    const oldValue = getValueAtPath(cloned, patch.path);
    const { parent, key } = getParentAndKey(cloned, patch.path);

    switch (patch.op) {
      case 'add': {
        if (Array.isArray(parent)) {
          const index = key === '-' ? parent.length : (key as number);
          parent.splice(index, 0, structuredClone(patch.value as JsonValue));
          inversePatch.unshift({
            op: 'remove',
            path: patch.path === `${patch.path.slice(0, patch.path.lastIndexOf('/'))}/-`
              ? `${patch.path.slice(0, patch.path.lastIndexOf('/'))}/${index}`
              : patch.path,
          });
        } else {
          const existed = Object.prototype.hasOwnProperty.call(parent, key);
          (parent as Record<string, JsonValue>)[key as string] = structuredClone(patch.value as JsonValue);
          if (existed) {
            inversePatch.unshift({
              op: 'replace',
              path: patch.path,
              value: structuredClone(oldValue),
            });
          } else {
            inversePatch.unshift({
              op: 'remove',
              path: patch.path,
            });
          }
        }
        break;
      }
      case 'remove': {
        if (Array.isArray(parent)) {
          parent.splice(key as number, 1);
        } else {
          delete (parent as Record<string, JsonValue>)[key as string];
        }
        inversePatch.unshift({
          op: 'add',
          path: patch.path,
          value: structuredClone(oldValue),
        });
        break;
      }
      case 'replace': {
        (parent as Record<string, JsonValue>)[key as string] = structuredClone(patch.value as JsonValue);
        inversePatch.unshift({
          op: 'replace',
          path: patch.path,
          value: structuredClone(oldValue),
        });
        break;
      }
      case 'test': {
        const currentVal = getValueAtPath(cloned, patch.path);
        if (JSON.stringify(currentVal) !== JSON.stringify(patch.value)) {
          throw new Error(`Test operation failed at path ${patch.path}`);
        }
        break;
      }
      default:
        throw new Error(`Unsupported JSON Patch operation: ${(patch as JsonPatchOperation).op}`);
    }
  }

  return { result: cloned, inversePatch };
}