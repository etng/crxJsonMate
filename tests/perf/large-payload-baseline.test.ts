import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { buildViewerPayloadState, parseViewerInput } from '../../src/core/viewer/session';
import { getViewerNodeDisplayData, listNodeChildren, listNodeChildrenRange } from '../../src/core/viewer/tree';
import type { RawPayloadResult } from '../../src/detector/raw-payload';
import { largeServerGroupFixture, largeServerGroupJson, largeServerGroupSize } from '../fixtures/large-server-group';

const makePayload = (): RawPayloadResult => ({
  string: largeServerGroupJson,
  data: largeServerGroupFixture,
  format: 'json'
});

const makeWideObject = (size: number) => Object.fromEntries(
  Array.from({ length: size }, (_, index) => [
    `field_${index}`,
    index % 2 === 0 ? `https://cdn.example.com/photo-${index}.png` : `value-${index}`
  ])
);

const measure = (iterations: number, fn: () => unknown) => {
  const startedAt = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    fn();
  }

  return performance.now() - startedAt;
};

describe('large payload performance baseline', () => {
  it('keeps the big payload path deferred and noticeably cheaper than full parsing', () => {
    const payload = makePayload();

    const parsedState = parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
    expect(parsedState).not.toBeNull();
    expect(parsedState?.nodeCount).toBeNull();
    expect(parsedState?.prettyText).toBeNull();
    expect(parsedState?.payload.string).toBe(largeServerGroupJson);

    const builtState = buildViewerPayloadState(payload, 'pending', 'JSON');
    expect(builtState.nodeCount).toBeNull();
    expect(builtState.prettyText).toBeNull();

    const wideObject = makeWideObject(20_000);

    // Warm up the render-path cache before measuring the first visible window.
    listNodeChildrenRange(wideObject, false, 0, 120).forEach((child) => {
      expect(getViewerNodeDisplayData(child.value, child.key).kind).toBe('string');
    });

    // Warm up JIT so the baseline is more stable across local runs.
    parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
    buildViewerPayloadState(payload, 'pending', 'JSON');

    const parseMs = measure(3, () => {
      const result = parseViewerInput(largeServerGroupJson, 'JSON', 'pending');
      expect(result).not.toBeNull();
    });

    const buildMs = measure(150, () => {
      const result = buildViewerPayloadState(payload, 'pending', 'JSON');
      expect(result.nodeCount).toBeNull();
      expect(result.prettyText).toBeNull();
    });

    const wideListAllMs = measure(10, () => {
      expect(listNodeChildren(wideObject).length).toBe(20_000);
    });

    const wideFirstWindowMs = measure(10, () => {
      const children = listNodeChildrenRange(wideObject, false, 0, 120);
      expect(children.length).toBe(120);
      for (const child of children) {
        expect(getViewerNodeDisplayData(child.value, child.key).kind).toBe('string');
      }
    });

    const parsePerOp = parseMs / 3;
    const buildPerOp = buildMs / 150;
    const wideListAllPerOp = wideListAllMs / 10;
    const wideFirstWindowPerOp = wideFirstWindowMs / 10;

    console.info(
      `large payload baseline (${largeServerGroupSize} bytes): parseViewerInput=${parsePerOp.toFixed(2)}ms/op, buildViewerPayloadState=${buildPerOp.toFixed(2)}ms/op, ` +
      `wideObject listAll=${wideListAllPerOp.toFixed(2)}ms/op, wideObject firstWindow=${wideFirstWindowPerOp.toFixed(2)}ms/op`
    );

    expect(buildPerOp).toBeLessThan(parsePerOp);
    expect(buildPerOp).toBeLessThan(15);
    expect(wideFirstWindowPerOp).toBeLessThan(wideListAllPerOp);
  });
});
