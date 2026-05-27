import { describe, expect, it } from 'vitest';
import { resolveViewerActionSelectionPayload } from './action-selection';

describe('viewer action selection payload', () => {
  it('uses the configured JM-JSON parser when resolving selected text', () => {
    expect(resolveViewerActionSelectionPayload("{root:'ok'}", 'JM-JSON')).toEqual({
      jsonText: "{root:'ok'}",
      inputText: null
    });
  });

  it('keeps unparseable selected text as launcher input', () => {
    expect(resolveViewerActionSelectionPayload('not json', 'JM-JSON')).toEqual({
      jsonText: null,
      inputText: 'not json'
    });
  });
});
