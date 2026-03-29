export interface ViewerValueCapabilities {
  canOpenDetachedValue: boolean;
  externalUrlHref: string | null;
  previewImageSrc: string | null;
}

const emptyViewerValueCapabilities: ViewerValueCapabilities = {
  canOpenDetachedValue: false,
  externalUrlHref: null,
  previewImageSrc: null
};

const imageDataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,\S+/i;
const imageUrlPattern = /^https?:\/\/\S+/i;
const imageFileExtensionPattern = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#&])/i;
const imageSemanticKeyPattern = /(image|img|avatar|icon|logo|photo|picture|cover|thumbnail|thumb|banner)/i;

const viewerValueCapabilityCache = new Map<string, Map<string, ViewerValueCapabilities>>();
const viewerValueCapabilityCacheLimit = 25_000;
let viewerValueCapabilityCacheSize = 0;

const normalizeViewerFieldKey = (fieldKey?: string | number | null) => (
  typeof fieldKey === 'string' || typeof fieldKey === 'number'
    ? String(fieldKey).trim()
    : ''
);

const classifyViewerStringValue = (
  value: string,
  normalizedFieldKey: string
): ViewerValueCapabilities => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return emptyViewerValueCapabilities;
  }

  const externalUrlHref = imageUrlPattern.test(trimmedValue)
    ? trimmedValue
    : null;
  const canOpenDetachedValue = trimmedValue.length >= 2 && (
    (trimmedValue[0] === '{' && trimmedValue[trimmedValue.length - 1] === '}')
    || (trimmedValue[0] === '[' && trimmedValue[trimmedValue.length - 1] === ']')
  );
  const hasImageSemanticKey = Boolean(normalizedFieldKey)
    && imageSemanticKeyPattern.test(normalizedFieldKey);

  let previewImageSrc: string | null = null;

  if (imageDataUrlPattern.test(trimmedValue)) {
    previewImageSrc = trimmedValue;
  } else if (externalUrlHref) {
    if (imageFileExtensionPattern.test(trimmedValue) || hasImageSemanticKey) {
      previewImageSrc = trimmedValue;
    }
  }

  if (!externalUrlHref && !previewImageSrc && !canOpenDetachedValue) {
    return emptyViewerValueCapabilities;
  }

  return {
    canOpenDetachedValue,
    externalUrlHref,
    previewImageSrc
  };
};

export const resetViewerValueCapabilityCache = () => {
  viewerValueCapabilityCache.clear();
  viewerValueCapabilityCacheSize = 0;
};

export const getViewerValueCapabilities = (
  value: unknown,
  fieldKey?: string | number | null
): ViewerValueCapabilities => {
  if (typeof value !== 'string') {
    return emptyViewerValueCapabilities;
  }

  const normalizedFieldKey = normalizeViewerFieldKey(fieldKey);
  const fieldBucket = viewerValueCapabilityCache.get(normalizedFieldKey);
  if (fieldBucket?.has(value)) {
    return fieldBucket.get(value)!;
  }

  const capabilities = classifyViewerStringValue(value, normalizedFieldKey);
  const nextFieldBucket = fieldBucket || new Map<string, ViewerValueCapabilities>();
  if (!fieldBucket) {
    viewerValueCapabilityCache.set(normalizedFieldKey, nextFieldBucket);
  }
  nextFieldBucket.set(value, capabilities);
  viewerValueCapabilityCacheSize += 1;

  if (viewerValueCapabilityCacheSize > viewerValueCapabilityCacheLimit) {
    resetViewerValueCapabilityCache();
  }

  return capabilities;
};
