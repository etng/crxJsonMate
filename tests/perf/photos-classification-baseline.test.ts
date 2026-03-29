import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { buildViewerPayloadState, parseViewerInput } from '../../src/core/viewer/session';
import { getViewerValueCapabilities, resetViewerValueCapabilityCache } from '../../src/core/viewer/value-classification';
import { listNodeChildren, listNodeChildrenRange } from '../../src/core/viewer/tree';
import { largeServerGroupFixture, largeServerGroupJson, largeServerGroupSize } from '../fixtures/large-server-group';

const imageDataUrlPattern = /^data:image\/[a-z0-9.+-]+;base64,\S+/i;
const imageUrlPattern = /^https?:\/\/\S+/i;
const imageFileExtensionPattern = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)(?:$|[?#&])/i;
const imageSemanticKeyPattern = /(image|img|avatar|icon|logo|photo|picture|cover|thumbnail|thumb|banner)/i;
const nonImageSemanticKeyPattern = /(home|link|href|page|site|url|website|source|request|api|doc|docs)/i;
const detachedValuePattern = /^([\[{]).*([\]}])$/s;
const externalUrlPattern = /^https?:\/\/\S+/i;

interface PayloadStats {
  leaves: number;
  strings: number;
  externalUrlMatches: number;
  imagePreviewMatches: number;
  detachedMatches: number;
}

const makePayloadStats = (): PayloadStats => ({
  leaves: 0,
  strings: 0,
  externalUrlMatches: 0,
  imagePreviewMatches: 0,
  detachedMatches: 0
});

const classifyImagePreview = (value: string, fieldKey?: string | number | null) => {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return false;
  }

  if (imageDataUrlPattern.test(trimmedValue)) {
    return true;
  }

  if (!imageUrlPattern.test(trimmedValue)) {
    return false;
  }

  if (imageFileExtensionPattern.test(trimmedValue)) {
    return true;
  }

  const normalizedFieldKey = typeof fieldKey === 'string' || typeof fieldKey === 'number'
    ? String(fieldKey).trim()
    : '';

  if (!normalizedFieldKey || nonImageSemanticKeyPattern.test(normalizedFieldKey)) {
    return false;
  }

  return imageSemanticKeyPattern.test(normalizedFieldKey);
};

const walkAndClassify = (value: unknown, stats: PayloadStats, fieldKey?: string | number | null) => {
  stats.leaves += 1;

  if (typeof value === 'string') {
    stats.strings += 1;
    const trimmedValue = value.trim();

    if (externalUrlPattern.test(trimmedValue)) {
      stats.externalUrlMatches += 1;
    }

    if (classifyImagePreview(value, fieldKey)) {
      stats.imagePreviewMatches += 1;
    }

    if (trimmedValue.length >= 2) {
      const firstChar = trimmedValue[0];
      const lastChar = trimmedValue[trimmedValue.length - 1];
      if ((firstChar === '{' && lastChar === '}') || (firstChar === '[' && lastChar === ']')) {
        stats.detachedMatches += 1;
      }
    }

    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkAndClassify(value[index], stats, index);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    walkAndClassify(child, stats, key);
  }
};

const walkOnly = (value: unknown): number => {
  let leaves = 1;

  if (!value || typeof value !== 'object') {
    return leaves;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      leaves += walkOnly(value[index]);
    }
    return leaves;
  }

  for (const child of Object.values(value)) {
    leaves += walkOnly(child);
  }

  return leaves;
};

const walkAndClassifyWithCache = (value: unknown, stats: PayloadStats, fieldKey?: string | number | null) => {
  stats.leaves += 1;

  if (typeof value === 'string') {
    stats.strings += 1;
    const capabilities = getViewerValueCapabilities(value, fieldKey);

    if (capabilities.externalUrlHref) {
      stats.externalUrlMatches += 1;
    }

    if (capabilities.previewImageSrc) {
      stats.imagePreviewMatches += 1;
    }

    if (capabilities.canOpenDetachedValue) {
      stats.detachedMatches += 1;
    }

    return;
  }

  if (!value || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      walkAndClassifyWithCache(value[index], stats, index);
    }
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    walkAndClassifyWithCache(child, stats, key);
  }
};

const measure = (iterations: number, fn: () => void) => {
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    fn();
  }

  return performance.now() - startedAt;
};

const fetchPhotos = async () => {
  const response = await fetch('https://jsonplaceholder.typicode.com/photos');
  expect(response.ok).toBe(true);
  return response.text();
};

describe('photos payload classification baseline', () => {
  it('compares payload parsing and render-like classification against the large tree fixture', async () => {
    const photosJson = await fetchPhotos();
    const photosFixture = JSON.parse(photosJson) as Array<Record<string, unknown>>;
    const photosPayload = {
      string: photosJson,
      data: photosFixture,
      format: 'json' as const
    };

    const photosStats = makePayloadStats();
    for (const item of photosFixture) {
      walkAndClassify(item, photosStats);
    }

    const largeStats = makePayloadStats();
    walkAndClassify(largeServerGroupFixture, largeStats);

    const photosParsed = parseViewerInput(photosJson, 'JSON', 'pending');
    expect(photosParsed).not.toBeNull();
    expect(photosParsed?.nodeCount).toBeNull();
    expect(photosParsed?.prettyText).toBeNull();

    const largeParsed = parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
    expect(largeParsed).not.toBeNull();
    expect(largeParsed?.nodeCount).toBeNull();
    expect(largeParsed?.prettyText).toBeNull();

    // Warm up JIT and caches.
    parseViewerInput(photosJson, 'JSON', 'pending');
    parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
    buildViewerPayloadState(photosPayload, 'pending', 'JSON');
    buildViewerPayloadState({
      string: largeServerGroupJson,
      data: largeServerGroupFixture,
      format: 'json'
    }, 'pending', 'JSON');
    resetViewerValueCapabilityCache();
    walkAndClassifyWithCache(photosFixture, makePayloadStats());
    walkAndClassifyWithCache(largeServerGroupFixture, makePayloadStats());
    walkAndClassify(photosFixture, makePayloadStats());
    walkAndClassify(largeServerGroupFixture, makePayloadStats());
    walkOnly(photosFixture);
    walkOnly(largeServerGroupFixture);
    listNodeChildren(photosFixture);
    listNodeChildrenRange(photosFixture, false, 0, 120);

    const photosParseMs = measure(3, () => {
      const result = parseViewerInput(photosJson, 'JSON', 'pending');
      expect(result).not.toBeNull();
    });

    const largeParseMs = measure(3, () => {
      const result = parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
      expect(result).not.toBeNull();
    });

    const photosBuildMs = measure(100, () => {
      const result = buildViewerPayloadState(photosPayload, 'pending', 'JSON');
      expect(result.nodeCount).toBeNull();
      expect(result.prettyText).toBeNull();
    });

    const largeBuildMs = measure(100, () => {
      const result = buildViewerPayloadState({
        string: largeServerGroupJson,
        data: largeServerGroupFixture,
        format: 'json'
      }, 'pending', 'JSON');
      expect(result.nodeCount).toBeNull();
      expect(result.prettyText).toBeNull();
    });

    const photosClassifyMs = measure(50, () => {
      const stats = makePayloadStats();
      for (const item of photosFixture) {
        walkAndClassify(item, stats);
      }
      expect(stats.externalUrlMatches).toBeGreaterThan(0);
    });

    const largeClassifyMs = measure(50, () => {
      const stats = makePayloadStats();
      walkAndClassify(largeServerGroupFixture, stats);
      expect(stats.leaves).toBeGreaterThan(0);
    });

    const photosCachedClassifyMs = measure(50, () => {
      const stats = makePayloadStats();
      for (const item of photosFixture) {
        walkAndClassifyWithCache(item, stats);
      }
      expect(stats.externalUrlMatches).toBeGreaterThan(0);
    });

    const largeCachedClassifyMs = measure(50, () => {
      const stats = makePayloadStats();
      walkAndClassifyWithCache(largeServerGroupFixture, stats);
      expect(stats.leaves).toBeGreaterThan(0);
    });

    const photosWalkOnlyMs = measure(50, () => {
      expect(walkOnly(photosFixture)).toBeGreaterThan(0);
    });

    const largeWalkOnlyMs = measure(50, () => {
      expect(walkOnly(largeServerGroupFixture)).toBeGreaterThan(0);
    });

    const photosListAllChildrenMs = measure(100, () => {
      expect(listNodeChildren(photosFixture).length).toBe(photosFixture.length);
    });

    const photosListFirstBatchMs = measure(100, () => {
      expect(listNodeChildrenRange(photosFixture, false, 0, 120).length).toBe(120);
    });

    const photosParsePerOp = photosParseMs / 3;
    const largeParsePerOp = largeParseMs / 3;
    const photosBuildPerOp = photosBuildMs / 100;
    const largeBuildPerOp = largeBuildMs / 100;
    const photosClassifyPerOp = photosClassifyMs / 50;
    const largeClassifyPerOp = largeClassifyMs / 50;
    const photosCachedClassifyPerOp = photosCachedClassifyMs / 50;
    const largeCachedClassifyPerOp = largeCachedClassifyMs / 50;
    const photosWalkOnlyPerOp = photosWalkOnlyMs / 50;
    const largeWalkOnlyPerOp = largeWalkOnlyMs / 50;
    const photosListAllChildrenPerOp = photosListAllChildrenMs / 100;
    const photosListFirstBatchPerOp = photosListFirstBatchMs / 100;

    console.info(
      [
        `photos payload: ${Buffer.byteLength(photosJson)} bytes, ${photosFixture.length} items,`,
        `${photosStats.leaves} leaves, ${photosStats.strings} strings,`,
        `${photosStats.externalUrlMatches} external-url matches,`,
        `${photosStats.imagePreviewMatches} image-preview matches,`,
        `${photosStats.detachedMatches} detached matches`
      ].join(' ')
    );
    console.info(
      [
        `large fixture: ${largeServerGroupSize} bytes,`,
        `${largeStats.leaves} leaves, ${largeStats.strings} strings,`,
        `${largeStats.externalUrlMatches} external-url matches,`,
        `${largeStats.imagePreviewMatches} image-preview matches,`,
        `${largeStats.detachedMatches} detached matches`
      ].join(' ')
    );
    console.info(
      `baseline timings: photos parse=${photosParsePerOp.toFixed(2)}ms/op, photos classify=${photosClassifyPerOp.toFixed(2)}ms/op, ` +
      `photos cached classify=${photosCachedClassifyPerOp.toFixed(2)}ms/op, ` +
      `photos list all=${photosListAllChildrenPerOp.toFixed(2)}ms/op, photos list first batch=${photosListFirstBatchPerOp.toFixed(2)}ms/op, ` +
      `large parse=${largeParsePerOp.toFixed(2)}ms/op, large classify=${largeClassifyPerOp.toFixed(2)}ms/op, ` +
      `large cached classify=${largeCachedClassifyPerOp.toFixed(2)}ms/op, ` +
      `photos walk-only=${photosWalkOnlyPerOp.toFixed(2)}ms/op, large walk-only=${largeWalkOnlyPerOp.toFixed(2)}ms/op, ` +
      `photos build=${photosBuildPerOp.toFixed(2)}ms/op, large build=${largeBuildPerOp.toFixed(2)}ms/op`
    );

    expect(photosClassifyPerOp).toBeGreaterThan(0);
    expect(largeClassifyPerOp).toBeGreaterThan(0);
    expect(photosCachedClassifyPerOp).toBeLessThan(photosClassifyPerOp);
    expect(photosListFirstBatchPerOp).toBeLessThan(photosListAllChildrenPerOp);
  });
});
