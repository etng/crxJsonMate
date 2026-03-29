import { describe, expect, it } from 'vitest';
import { parseViewerInput, resolveEmbeddedPayload } from './session';

describe('viewer session parsing', () => {
  it('builds a viewer state from pending strict JSON', () => {
    const result = parseViewerInput('{"root":{"leaf":3}}', 'JSON', 'pending');

    expect(result).toMatchObject({
      source: 'pending',
      nodeCount: 3,
      payload: {
        format: 'json',
        data: { root: { leaf: 3 } }
      }
    });
    expect(result?.prettyText).toContain('"leaf": 3');
  });

  it('accepts JM-JSON style input when JSON5 mode is enabled', () => {
    const result = parseViewerInput("{root:'ok'}", 'JM-JSON', 'manual');

    expect(result).toMatchObject({
      source: 'manual',
      payload: {
        data: { root: 'ok' }
      }
    });
  });

  it('resolves iframe payload messages from embedded viewer host pages', () => {
    const result = resolveEmbeddedPayload({
      cmd: 'postJson',
      json: {
        string: '{"root":3}',
        data: { root: 3 },
        format: 'json'
      }
    }, 'JSON');

    expect(result).toMatchObject({
      source: 'iframe',
      payload: {
        data: { root: 3 }
      }
    });
  });
});
