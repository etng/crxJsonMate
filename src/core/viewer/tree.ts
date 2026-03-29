import { getViewerValueCapabilities, type ViewerValueCapabilities } from './value-classification';

export type ViewerPathSegment = string | number;
export type ViewerPath = ViewerPathSegment[];

export interface ViewerTreeNode {
  key: ViewerPathSegment;
  path: ViewerPath;
  value: unknown;
}

export interface ViewerPathSearchMatch {
  path: ViewerPath;
  formattedPath: string;
  kind: string;
  preview: string;
}

export type ViewerPathSearchMode = 'key' | 'value';

export interface ViewerNodeDisplayData {
  kind: string;
  preview: string;
  childCount: number;
  structured: boolean;
  valueCapabilities: ViewerValueCapabilities;
}

const emptyViewerValueCapabilities: ViewerValueCapabilities = {
  canOpenDetachedValue: false,
  externalUrlHref: null,
  previewImageSrc: null
};

const viewerNodeDisplayObjectCache = new WeakMap<object, ViewerNodeDisplayData>();
const viewerNodeDisplayPrimitiveCache = new Map<string, ViewerNodeDisplayData>();
const viewerNodeDisplayPrimitiveCacheLimit = 12_000;

const normalizeViewerFieldKey = (fieldKey?: string | number | null) => (
  typeof fieldKey === 'string' || typeof fieldKey === 'number'
    ? String(fieldKey).trim()
    : ''
);

const createViewerNodeDisplayData = (
  value: unknown,
  fieldKey?: string | number | null
): ViewerNodeDisplayData => {
  if (Array.isArray(value)) {
    const childCount = value.length;
    return {
      kind: 'array',
      preview: `Array(${childCount})`,
      childCount,
      structured: true,
      valueCapabilities: emptyViewerValueCapabilities
    };
  }

  if (value && typeof value === 'object') {
    const childCount = Object.keys(value).length;
    return {
      kind: 'object',
      preview: `Object(${childCount})`,
      childCount,
      structured: true,
      valueCapabilities: emptyViewerValueCapabilities
    };
  }

  const kind = value === null ? 'null' : typeof value;
  if (typeof value === 'string') {
    return {
      kind,
      preview: getValuePreview(value),
      childCount: 0,
      structured: false,
      valueCapabilities: getViewerValueCapabilities(value, fieldKey)
    };
  }

  return {
    kind,
    preview: getValuePreview(value),
    childCount: 0,
    structured: false,
    valueCapabilities: emptyViewerValueCapabilities
  };
};

export const getViewerNodeDisplayData = (
  value: unknown,
  fieldKey?: string | number | null
) => {
  if (value && typeof value === 'object') {
    const cachedValue = viewerNodeDisplayObjectCache.get(value);
    if (cachedValue) {
      return cachedValue;
    }

    const nextValue = createViewerNodeDisplayData(value, fieldKey);
    viewerNodeDisplayObjectCache.set(value, nextValue);
    return nextValue;
  }

  const cacheKey = `${typeof value}\u0000${String(value)}\u0000${normalizeViewerFieldKey(fieldKey)}`;
  const cachedValue = viewerNodeDisplayPrimitiveCache.get(cacheKey);
  if (cachedValue) {
    return cachedValue;
  }

  const nextValue = createViewerNodeDisplayData(value, fieldKey);
  viewerNodeDisplayPrimitiveCache.set(cacheKey, nextValue);
  if (viewerNodeDisplayPrimitiveCache.size > viewerNodeDisplayPrimitiveCacheLimit) {
    viewerNodeDisplayPrimitiveCache.clear();
  }

  return nextValue;
};

export const getViewerPathKey = (path: ViewerPath) => JSON.stringify(path);

export const formatViewerPath = (path: ViewerPath) => {
  if (path.length === 0) {
    return 'Root';
  }

  return `Root${path.map((segment) => (
    typeof segment === 'number'
      ? `[${segment}]`
      : (/^[A-Za-z_$][\w$]*$/.test(segment) ? `.${segment}` : `[${JSON.stringify(segment)}]`)
  )).join('')}`;
};

export const formatViewerEditablePath = (path: ViewerPath) => (
  path.map((segment, index) => (
    typeof segment === 'number'
      ? `[${segment}]`
      : (/^[A-Za-z_$][\w$]*$/.test(segment) ? `${index === 0 ? '' : '.'}${segment}` : `[${JSON.stringify(segment)}]`)
  )).join('')
);

export const parseViewerPath = (rawPath: string): ViewerPath | null => {
  const trimmedPath = rawPath.trim();
  if (!trimmedPath || trimmedPath === 'Root') {
    return [];
  }

  let cursor = trimmedPath.startsWith('Root') ? 4 : 0;
  const parsedPath: ViewerPath = [];

  while (cursor < trimmedPath.length) {
    const token = trimmedPath.slice(cursor);

    if (cursor === 0) {
      const leadingKeyMatch = token.match(/^([A-Za-z_$][\w$]*)/);
      if (leadingKeyMatch) {
        parsedPath.push(leadingKeyMatch[1]!);
        cursor += leadingKeyMatch[0].length;
        continue;
      }
    }

    if (token.startsWith('.')) {
      const match = token.match(/^\.([A-Za-z_$][\w$]*)/);
      if (!match) {
        return null;
      }
      parsedPath.push(match[1]!);
      cursor += match[0].length;
      continue;
    }

    if (token.startsWith('[')) {
      const numericMatch = token.match(/^\[(\d+)\]/);
      if (numericMatch) {
        parsedPath.push(Number(numericMatch[1]));
        cursor += numericMatch[0].length;
        continue;
      }

      const stringMatch = token.match(/^\[(?:"((?:\\.|[^"])*)"|'((?:\\.|[^'])*)')\]/);
      if (stringMatch) {
        const quotedValue = stringMatch[1] ?? stringMatch[2] ?? '';
        try {
          parsedPath.push(JSON.parse(`"${quotedValue.replace(/"/g, '\\"')}"`));
        } catch {
          return null;
        }
        cursor += stringMatch[0].length;
        continue;
      }
    }

    return null;
  }

  return parsedPath;
};

export const isStructuredValue = (value: unknown): value is Array<unknown> | Record<string, unknown> => (
  Boolean(value) && typeof value === 'object'
);

export const getValueKind = (value: unknown) => {
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value === null) {
    return 'null';
  }
  return typeof value;
};

export const getValuePreview = (value: unknown) => {
  if (Array.isArray(value)) {
    return `Array(${value.length})`;
  }
  if (value && typeof value === 'object') {
    return `Object(${Object.keys(value).length})`;
  }
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    return compact.length > 48 ? `${compact.slice(0, 48)}...` : compact || '""';
  }
  return String(value);
};

export const getStructuredChildCount = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.length;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length;
  }

  return 0;
};

export const listNodeChildrenRange = (
  value: unknown,
  shouldSortObjectKeys = false,
  start = 0,
  end = Number.POSITIVE_INFINITY
): ViewerTreeNode[] => {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(safeStart, end);

  if (Array.isArray(value)) {
    return value.slice(safeStart, safeEnd).map((child, offset) => ({
      key: safeStart + offset,
      path: [safeStart + offset],
      value: child
    }));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  if (shouldSortObjectKeys) {
    const objectEntries = Object.entries(value);
    objectEntries.sort(([left], [right]) => left.localeCompare(right));

    return objectEntries.slice(safeStart, safeEnd).map(([key, child]) => ({
      key,
      path: [key],
      value: child
    }));
  }

  const objectValue = value as Record<string, unknown>;
  const children: ViewerTreeNode[] = [];
  let index = 0;

  for (const key in objectValue) {
    if (!Object.prototype.hasOwnProperty.call(objectValue, key)) {
      continue;
    }

    if (index >= safeEnd) {
      break;
    }

    if (index >= safeStart) {
      children.push({
        key,
        path: [key],
        value: objectValue[key]
      });
    }

    index += 1;
  }

  return children;
};

export const listNodeChildren = (value: unknown, shouldSortObjectKeys = false): ViewerTreeNode[] => {
  if (Array.isArray(value)) {
    return value.map((child, index) => ({
      key: index,
      path: [index],
      value: child
    }));
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  const objectEntries = Object.entries(value);
  if (shouldSortObjectKeys) {
    objectEntries.sort(([left], [right]) => left.localeCompare(right));
  }

  return objectEntries.map(([key, child]) => ({
    key,
    path: [key],
    value: child
  }));
};

export const getValueAtPath = (rootValue: unknown, path: ViewerPath): unknown => {
  let currentValue = rootValue;

  for (const segment of path) {
    if (Array.isArray(currentValue) && typeof segment === 'number') {
      currentValue = currentValue[segment];
      continue;
    }

    if (currentValue && typeof currentValue === 'object' && typeof segment === 'string') {
      currentValue = (currentValue as Record<string, unknown>)[segment];
      continue;
    }

    return undefined;
  }

  return currentValue;
};

const cloneContainer = (value: unknown) => {
  if (Array.isArray(value)) {
    return [...value];
  }

  if (value && typeof value === 'object') {
    return { ...(value as Record<string, unknown>) };
  }

  return value;
};

export const setValueAtPath = (rootValue: unknown, path: ViewerPath, nextValue: unknown): unknown => {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path;

  if (Array.isArray(rootValue) && typeof head === 'number') {
    const nextRootValue = cloneContainer(rootValue) as unknown[];
    nextRootValue[head] = setValueAtPath(rootValue[head], tail, nextValue);
    return nextRootValue;
  }

  if (rootValue && typeof rootValue === 'object' && typeof head === 'string') {
    const currentRecord = rootValue as Record<string, unknown>;
    const nextRootValue = cloneContainer(rootValue) as Record<string, unknown>;
    nextRootValue[head] = setValueAtPath(currentRecord[head], tail, nextValue);
    return nextRootValue;
  }

  throw new Error('Cannot update the selected path');
};

export const canRenameKeyAtPath = (rootValue: unknown, path: ViewerPath) => {
  if (path.length === 0 || typeof path[path.length - 1] !== 'string') {
    return false;
  }

  const parentValue = getValueAtPath(rootValue, path.slice(0, -1));
  return Boolean(parentValue && typeof parentValue === 'object' && !Array.isArray(parentValue));
};

export const renameKeyAtPath = (rootValue: unknown, path: ViewerPath, nextKey: string): unknown => {
  if (path.length === 0 || typeof path[path.length - 1] !== 'string') {
    throw new Error('Cannot rename the selected path');
  }

  const normalizedNextKey = nextKey.trim();
  if (!normalizedNextKey) {
    throw new Error('Key cannot be empty');
  }

  if (path.length === 1) {
    if (!rootValue || typeof rootValue !== 'object' || Array.isArray(rootValue)) {
      throw new Error('Cannot rename the selected path');
    }

    const currentRecord = rootValue as Record<string, unknown>;
    const currentKey = path[0] as string;
    if (normalizedNextKey !== currentKey && Object.prototype.hasOwnProperty.call(currentRecord, normalizedNextKey)) {
      throw new Error('Key already exists');
    }

    const nextRecord = cloneContainer(rootValue) as Record<string, unknown>;
    const currentValue = currentRecord[currentKey];
    delete nextRecord[currentKey];
    nextRecord[normalizedNextKey] = currentValue;
    return nextRecord;
  }

  const [head, ...tail] = path;

  if (Array.isArray(rootValue) && typeof head === 'number') {
    const nextRootValue = cloneContainer(rootValue) as unknown[];
    nextRootValue[head] = renameKeyAtPath(rootValue[head], tail, normalizedNextKey);
    return nextRootValue;
  }

  if (rootValue && typeof rootValue === 'object' && typeof head === 'string') {
    const currentRecord = rootValue as Record<string, unknown>;
    const nextRootValue = cloneContainer(rootValue) as Record<string, unknown>;
    nextRootValue[head] = renameKeyAtPath(currentRecord[head], tail, normalizedNextKey);
    return nextRootValue;
  }

  throw new Error('Cannot rename the selected path');
};

const normalizePathSearchQuery = (query: string) => query.trim().toLowerCase();

const getValueSearchText = (value: unknown) => {
  if (typeof value === 'string') {
    return value;
  }

  try {
    const jsonText = JSON.stringify(value);
    if (jsonText) {
      return jsonText.length > 1200 ? jsonText.slice(0, 1200) : jsonText;
    }
  } catch {
    // Fall through to string coercion when serialization fails.
  }

  return getValuePreview(value);
};

const scoreKeyPathMatch = (token: string, formattedPath: string, currentKey: string) => {
  const normalizedPath = formattedPath.toLowerCase();
  const normalizedKey = currentKey.toLowerCase();

  if (normalizedPath === token) {
    return 1400;
  }
  if (normalizedKey === token) {
    return 1350;
  }
  if (normalizedPath.startsWith(token)) {
    return 1180 - Math.min(160, normalizedPath.length - token.length);
  }
  if (normalizedKey.startsWith(token)) {
    return 1120 - Math.min(120, normalizedKey.length - token.length);
  }

  const segmentIndex = Math.max(
    normalizedPath.indexOf(`.${token}`),
    normalizedPath.indexOf(`["${token}`),
    normalizedPath.indexOf(`[${token}]`)
  );
  if (segmentIndex >= 0) {
    return 1080 - Math.min(180, segmentIndex * 2);
  }

  const pathIndex = normalizedPath.indexOf(token);
  if (pathIndex >= 0) {
    return 980 - Math.min(240, pathIndex * 3);
  }

  const keyIndex = normalizedKey.indexOf(token);
  if (keyIndex >= 0) {
    return 1020 - Math.min(180, keyIndex * 3);
  }

  let cursor = -1;
  let penalty = 0;
  for (const char of token) {
    cursor = normalizedPath.indexOf(char, cursor + 1);
    if (cursor < 0) {
      return -1;
    }
    penalty += cursor;
  }

  return 620 - Math.min(260, penalty);
};

const scoreValueMatch = (token: string, valueSearchText: string) => {
  const normalizedValue = valueSearchText.toLowerCase();
  const startsAt = normalizedValue.indexOf(token);

  if (startsAt === 0) {
    return 1250 - Math.min(220, normalizedValue.length - token.length);
  }
  if (startsAt > 0) {
    return 1080 - Math.min(320, startsAt * 2);
  }
  return -1;
};

export const searchViewerPaths = (
  rootValue: unknown,
  query: string,
  shouldSortObjectKeys = false,
  mode: ViewerPathSearchMode = 'key'
) => {
  const normalizedQuery = normalizePathSearchQuery(query);
  if (!normalizedQuery) {
    return [] as ViewerPathSearchMatch[];
  }

  const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
  const matches: Array<ViewerPathSearchMatch & { score: number }> = [];
  const visitNode = (currentPath: ViewerPath) => {
    const currentValue = getValueAtPath(rootValue, currentPath);
    const formattedPath = formatViewerPath(currentPath);
    const currentKey = currentPath.length === 0 ? 'Root' : String(currentPath[currentPath.length - 1]);
    const valueSearchText = getValueSearchText(currentValue);
    const valueDisplayData = getViewerNodeDisplayData(currentValue, currentPath[currentPath.length - 1] ?? null);
    const canMatchCurrentNode = mode !== 'value' || !isStructuredValue(currentValue);
    let score = 0;

    if (canMatchCurrentNode) {
      for (const token of tokens) {
        const tokenScore = mode === 'value'
          ? scoreValueMatch(token, valueSearchText)
          : scoreKeyPathMatch(token, formattedPath, currentKey);

        if (tokenScore < 0) {
          score = -1;
          break;
        }

        score += tokenScore;
      }
    }

    if (canMatchCurrentNode && score >= 0) {
      matches.push({
        path: currentPath,
        formattedPath,
        kind: valueDisplayData.kind,
        preview: valueDisplayData.preview,
        score
      });
    }

    for (const child of listNodeChildren(currentValue, shouldSortObjectKeys)) {
      visitNode([...currentPath, ...child.path]);
    }
  };

  visitNode([]);

  return matches
    .map((match) => ({
      ...match,
      score: tokens.length > 1 ? match.score + 60 : match.score
    }))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      if (left.formattedPath.length !== right.formattedPath.length) {
        return left.formattedPath.length - right.formattedPath.length;
      }
      return left.formattedPath.localeCompare(right.formattedPath);
    })
    .map(({ score: _score, ...match }) => match)
    .slice(0, 80);
};
