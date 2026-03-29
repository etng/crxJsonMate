import JSON5 from 'json5';
import type { JsonMateSettings } from '../settings/schema';
import { parseRawPayload, type JsonLikeApi, type RawPayloadResult } from '../detector/raw-payload';

export type ViewerPayloadSource = 'pending' | 'iframe' | 'manual';

export interface ViewerPayloadState {
  source: ViewerPayloadSource;
  payload: RawPayloadResult;
  nodeCount: number | null;
  prettyText: string | null;
}

export interface EmbeddedViewerMessage {
  cmd: 'postJson';
  json?: {
    string?: string;
    data?: unknown;
    format?: 'json' | 'jsonp' | 'jsonl';
  } | null;
}

const json5Api: JsonLikeApi = {
  parse: (text) => JSON5.parse(text),
  stringify: (value, replacer, space) => JSON5.stringify(value, replacer as never, space) || ''
};

const countNodes = (value: unknown): number => {
  let total = 1;
  if (!value || typeof value !== 'object') {
    return total;
  }

  for (const child of Object.values(value)) {
    total += countNodes(child);
  }

  return total;
};

const getJsonApi = (jsonEngine: JsonMateSettings['jsonEngine']) => (
  jsonEngine === 'JM-JSON' ? json5Api : undefined
);

export const viewerPayloadMetaDeferralThreshold = 120_000;

const stringifyWithEngine = (
  value: unknown,
  jsonEngine: JsonMateSettings['jsonEngine'],
  space: number
) => {
  const jsonApi = getJsonApi(jsonEngine);
  return jsonApi
    ? jsonApi.stringify(value, null, space)
    : JSON.stringify(value, null, space);
};

export const buildViewerPayloadState = (
  payload: RawPayloadResult,
  source: ViewerPayloadSource,
  jsonEngine: JsonMateSettings['jsonEngine']
): ViewerPayloadState => {
  const shouldDeferViewerMeta = payload.string.length > viewerPayloadMetaDeferralThreshold;
  const prettyText = shouldDeferViewerMeta
    ? null
    : stringifyWithEngine(payload.data, jsonEngine, 2);

  return {
    source,
    payload,
    nodeCount: shouldDeferViewerMeta ? null : countNodes(payload.data),
    prettyText
  };
};

export const hydrateViewerPayloadStateMeta = (
  payload: RawPayloadResult,
  jsonEngine: JsonMateSettings['jsonEngine']
) => ({
  nodeCount: countNodes(payload.data),
  prettyText: stringifyWithEngine(payload.data, jsonEngine, 2)
});

export const parseViewerInput = (
  text: string,
  jsonEngine: JsonMateSettings['jsonEngine'],
  source: ViewerPayloadSource
) => {
  const payload = parseRawPayload(text, getJsonApi(jsonEngine));
  if (!payload) {
    return null;
  }

  return buildViewerPayloadState(payload, source, jsonEngine);
};

export const resolveEmbeddedPayload = (
  message: EmbeddedViewerMessage,
  jsonEngine: JsonMateSettings['jsonEngine']
) => {
  if (!message || message.cmd !== 'postJson' || !message.json) {
    return null;
  }

  const messagePayload = message.json;
  const rawText = typeof messagePayload.string === 'string'
    ? messagePayload.string
    : (
      messagePayload.data === undefined
        ? ''
        : JSON.stringify(messagePayload.data)
    );

  return parseViewerInput(rawText, jsonEngine, 'iframe');
};

export const formatViewerEditorValue = (
  value: unknown,
  jsonEngine: JsonMateSettings['jsonEngine'],
  singleLine = false
) => {
  if (typeof value === 'string') {
    return value;
  }

  return stringifyWithEngine(value, jsonEngine, singleLine ? 0 : 2);
};

export const parseViewerEditorValue = (
  value: string,
  originalValue: unknown,
  jsonEngine: JsonMateSettings['jsonEngine']
) => {
  const trimmedValue = value.trim();
  const jsonApi = getJsonApi(jsonEngine) || JSON;

  if (typeof originalValue === 'string') {
    if (/^"[\s\S]*"$/.test(trimmedValue)) {
      return jsonApi.parse(trimmedValue);
    }
    return value;
  }

  return jsonApi.parse(trimmedValue);
};

export const createViewerStateFromData = (
  data: unknown,
  jsonEngine: JsonMateSettings['jsonEngine'],
  source: ViewerPayloadSource = 'manual'
) => buildViewerPayloadState({
  string: stringifyWithEngine(data, jsonEngine, 2),
  data,
  format: 'json'
}, source, jsonEngine);

export const resolveDetachedValueText = (
  value: unknown,
  jsonEngine: JsonMateSettings['jsonEngine']
) => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  if (!trimmedValue || !/^[\[{]/.test(trimmedValue)) {
    return null;
  }

  const payload = parseRawPayload(trimmedValue, getJsonApi(jsonEngine));
  if (!payload) {
    return null;
  }

  return payload.string;
};

export const looksLikeDetachedValueText = (value: unknown) => {
  if (typeof value !== 'string') {
    return false;
  }

  const trimmedValue = value.trim();
  if (trimmedValue.length < 2) {
    return false;
  }

  const firstChar = trimmedValue[0];
  const lastChar = trimmedValue[trimmedValue.length - 1];
  return (firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']');
};
