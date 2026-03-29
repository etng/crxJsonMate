import { describe, expect, it } from 'vitest';
import { getViewerValueCapabilities, resetViewerValueCapabilityCache } from './value-classification';

describe('viewer value classification', () => {
  it('detects external links, image previews, and detached payloads', () => {
    resetViewerValueCapabilityCache();

    expect(getViewerValueCapabilities('https://example.com', 'url')).toEqual({
      canOpenDetachedValue: false,
      externalUrlHref: 'https://example.com',
      previewImageSrc: null
    });

    expect(getViewerValueCapabilities('https://cdn.example.com/photo', 'thumbnail')).toEqual({
      canOpenDetachedValue: false,
      externalUrlHref: 'https://cdn.example.com/photo',
      previewImageSrc: 'https://cdn.example.com/photo'
    });

    expect(getViewerValueCapabilities('https://cdn.example.com/thumb/150/92c952', 'thumbnailUrl')).toEqual({
      canOpenDetachedValue: false,
      externalUrlHref: 'https://cdn.example.com/thumb/150/92c952',
      previewImageSrc: 'https://cdn.example.com/thumb/150/92c952'
    });

    expect(getViewerValueCapabilities('{"root":true}', 'payload')).toEqual({
      canOpenDetachedValue: true,
      externalUrlHref: null,
      previewImageSrc: null
    });
  });

  it('reuses cached classification results for repeated values', () => {
    resetViewerValueCapabilityCache();

    const first = getViewerValueCapabilities('https://example.com/avatar', 'avatar');
    const second = getViewerValueCapabilities('https://example.com/avatar', 'avatar');

    expect(second).toBe(first);
  });
});
