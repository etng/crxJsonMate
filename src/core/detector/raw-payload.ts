export type RawPayloadFormat = 'json' | 'jsonp' | 'jsonl';

export interface RawPayloadResult<TData = unknown> {
  string: string;
  data: TData;
  format: RawPayloadFormat;
}

export interface JsonLikeApi {
  parse: (text: string) => unknown;
  stringify: (value: unknown, replacer?: unknown, space?: string | number) => string;
}

export interface RawTextElementSnapshot {
  tagName: string;
  textContent?: string | null;
  childElementCount?: number;
}

export interface RawDocumentSnapshot {
  contentType?: string | null;
  bodyText?: string | null;
  bodyChildElementCount?: number;
  bodyHasOnlyTextNode?: boolean;
  onlyElement?: RawTextElementSnapshot | null;
  edgeJsonText?: string | null;
}

const nativeJsonApi: JsonLikeApi = {
  parse: (text) => JSON.parse(text),
  stringify: (value, replacer, space) => JSON.stringify(value, replacer as never, space)
};

const wrapParsedResult = <TData>(
  sourceText: string,
  data: TData,
  format: RawPayloadFormat
): RawPayloadResult<TData> => ({
  string: sourceText,
  data,
  format
});

const pushTextCandidate = (list: string[], text: string | null | undefined) => {
  const value = String(text || '').trim();
  if (value && !list.includes(value)) {
    list.push(value);
  }
};

export const normalizeCandidateText = (sourceText: string | null | undefined) => {
  if (!sourceText) {
    return '';
  }

  return String(sourceText)
    .replace(/^\uFEFF/, '')
    .replace(/^\)\]\}',?\s*(?:\r?\n)+/, '')
    .trim();
};

export const tryParseJsonText = (
  sourceText: string,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  if (!sourceText) {
    return null;
  }

  try {
    return wrapParsedResult(sourceText, jsonApi.parse(sourceText), 'json');
  } catch {
    return null;
  }
};

export const tryParseJsonpText = (
  sourceText: string,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  const match = sourceText.match(/^[\w$.]+\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  if (!match) {
    return null;
  }

  try {
    return wrapParsedResult(match[1], jsonApi.parse(match[1]), 'jsonp');
  } catch {
    return null;
  }
};

export const tryParseJsonlText = (
  sourceText: string,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return null;
  }

  try {
    const data = lines.map((line) => jsonApi.parse(line));
    return wrapParsedResult(jsonApi.stringify(data, null, 4), data, 'jsonl');
  } catch {
    return null;
  }
};

export const parseRawPayload = (
  text: string | null | undefined,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  const normalized = normalizeCandidateText(text);
  if (!normalized) {
    return null;
  }

  return tryParseJsonText(normalized, jsonApi)
    || tryParseJsonpText(normalized, jsonApi)
    || tryParseJsonlText(normalized, jsonApi);
};

export const looksLikeStructuredPayloadText = (text: string | null | undefined) => {
  const normalized = normalizeCandidateText(text);
  if (!normalized) {
    return false;
  }

  if (normalized.startsWith('{')) {
    return /"\s*:/.test(normalized.slice(0, 400));
  }

  if (normalized.startsWith('[')) {
    return true;
  }

  return /^[\w$.]+\s*\(/.test(normalized);
};

export const isLikelyJsonContentType = (contentType: string | null | undefined) => {
  const value = String(contentType || '').toLowerCase();
  return value.includes('json') || value.includes('ndjson');
};

export const collectRawTextCandidates = (snapshot: RawDocumentSnapshot) => {
  const list: string[] = [];
  const onlyElement = snapshot.onlyElement || null;

  if (isLikelyJsonContentType(snapshot.contentType)) {
    pushTextCandidate(list, snapshot.bodyText);
  }

  if (onlyElement && /^(PRE|CODE|XMP)$/i.test(onlyElement.tagName)) {
    pushTextCandidate(list, onlyElement.textContent);
  }

  if (onlyElement && !onlyElement.childElementCount) {
    pushTextCandidate(list, onlyElement.textContent);
  }

  if (snapshot.bodyHasOnlyTextNode) {
    pushTextCandidate(list, snapshot.bodyText);
  }

  return list;
};

export const detectRawPayload = (
  snapshot: RawDocumentSnapshot,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  for (const candidate of collectRawTextCandidates(snapshot)) {
    const parsed = parseRawPayload(candidate, jsonApi);
    if (parsed) {
      return parsed;
    }
  }

  return parseRawPayload(snapshot.edgeJsonText, jsonApi);
};

export const shouldRefetchRawPayloadText = (
  snapshot: RawDocumentSnapshot,
  jsonApi: JsonLikeApi = nativeJsonApi
) => {
  const normalizedBodyText = normalizeCandidateText(snapshot.bodyText);
  const onlyElement = snapshot.onlyElement || null;
  const alreadyDirectText = snapshot.bodyHasOnlyTextNode
    || !!(onlyElement && /^(PRE|CODE|XMP)$/i.test(onlyElement.tagName))
    || !!(onlyElement && !onlyElement.childElementCount);

  if (!normalizedBodyText || isLikelyJsonContentType(snapshot.contentType) || alreadyDirectText) {
    return false;
  }

  if (!looksLikeStructuredPayloadText(normalizedBodyText)) {
    return false;
  }

  if (parseRawPayload(normalizedBodyText, jsonApi)) {
    return false;
  }

  return Number(snapshot.bodyChildElementCount || 0) > 0;
};

const getNodeText = (node: Element | null) => {
  if (!node) {
    return null;
  }

  return node.innerHTML === undefined
    ? node.textContent
    : (node as HTMLElement).innerText || node.textContent;
};

export const createRawDocumentSnapshot = (documentRef: Document): RawDocumentSnapshot => {
  const body = documentRef.body;
  if (!body) {
    return {};
  }

  const onlyElement = body.childElementCount === 1 ? body.firstElementChild : null;
  const bodyHasOnlyTextNode = !body.childElementCount && Array.from(body.childNodes).some((node) => (
    node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim()
  ));
  const edgeJsonText = documentRef.querySelector('body[data-code-mirror]')
    ? getNodeText(documentRef.querySelector('[data-language="json"]'))
    : null;

  return {
    contentType: documentRef.contentType,
    bodyText: (body as HTMLElement).innerText || body.textContent,
    bodyChildElementCount: body.childElementCount,
    bodyHasOnlyTextNode,
    onlyElement: onlyElement ? {
      tagName: onlyElement.tagName,
      textContent: getNodeText(onlyElement),
      childElementCount: onlyElement.childElementCount
    } : null,
    edgeJsonText
  };
};
