import JSON5 from 'json5';
import { describe, expect, it } from 'vitest';
import {
  collectRawTextCandidates,
  detectRawPayload,
  normalizeCandidateText,
  parseRawPayload,
  type JsonLikeApi
} from './raw-payload';

const json5Api: JsonLikeApi = {
  parse: (text) => JSON5.parse(text),
  stringify: (value, replacer, space) => JSON5.stringify(value, replacer as never, space)
};

describe('raw payload parser', () => {
  it('parses strict JSON text', () => {
    const result = parseRawPayload('{"root":3}');

    expect(result).toMatchObject({
      format: 'json',
      string: '{"root":3}',
      data: { root: 3 }
    });
  });

  it('parses JSONP payloads', () => {
    const result = parseRawPayload('callback({"root":3});');

    expect(result).toMatchObject({
      format: 'jsonp',
      string: '{"root":3}',
      data: { root: 3 }
    });
  });

  it('parses JSONL payloads into an array wrapper', () => {
    const result = parseRawPayload('{"root":1}\n{"root":2}');

    expect(result).toMatchObject({
      format: 'jsonl',
      data: [{ root: 1 }, { root: 2 }]
    });
    expect(result?.string).toBe('[\n    {\n        "root": 1\n    },\n    {\n        "root": 2\n    }\n]');
  });

  it('strips BOM and XSSI prefixes before parsing', () => {
    const result = parseRawPayload('\uFEFF)]}\'\n{"root":3}');

    expect(result).toMatchObject({
      format: 'json',
      data: { root: 3 }
    });
  });

  it('supports alternate JSON engines when passed in explicitly', () => {
    const result = parseRawPayload("{root:'ok'}", json5Api);

    expect(result).toMatchObject({
      format: 'json',
      data: { root: 'ok' }
    });
  });

  it('does not mis-detect ordinary HTML text that happens to contain parentheses', () => {
    expect(parseRawPayload('Noise patterns (NN, IK, XX) are listed below.')).toBeNull();
    expect(parseRawPayload('The hash output is BLAKE2s (32 bytes).')).toBeNull();
  });
});

describe('raw payload candidate detection', () => {
  it('collects body text when the content type is JSON', () => {
    expect(collectRawTextCandidates({
      contentType: 'application/json',
      bodyText: '{"root":3}'
    })).toEqual(['{"root":3}']);
  });

  it('collects single PRE or CODE elements as raw candidates', () => {
    expect(collectRawTextCandidates({
      contentType: 'text/html',
      onlyElement: {
        tagName: 'PRE',
        textContent: '{"root":3}',
        childElementCount: 0
      }
    })).toEqual(['{"root":3}']);
  });

  it('detects Edge viewer payloads from the side channel text', () => {
    const result = detectRawPayload({
      contentType: 'text/html',
      bodyText: 'pretty viewer',
      edgeJsonText: '{"root":3}'
    });

    expect(result).toMatchObject({
      format: 'json',
      data: { root: 3 }
    });
  });

  it('does not detect a normal html documentation page as raw json', () => {
    const result = detectRawPayload({
      contentType: 'text/html',
      bodyText: 'Noise Protocol Framework',
      onlyElement: {
        tagName: 'DIV',
        textContent: 'Noise Protocol Framework\nA brief introduction (with examples).',
        childElementCount: 0
      }
    });

    expect(result).toBeNull();
  });
});
