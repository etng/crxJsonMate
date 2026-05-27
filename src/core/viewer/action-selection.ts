import type { JsonMateSettings } from '../settings/schema';
import { parseViewerInput } from './session';

export interface ViewerActionSelectionPayload {
  inputText: string | null;
  jsonText: string | null;
}

export const resolveViewerActionSelectionPayload = (
  selectionText: string | null | undefined,
  _jsonEngine: JsonMateSettings['jsonEngine']
): ViewerActionSelectionPayload => {
  const normalizedSelectionText = typeof selectionText === 'string'
    ? selectionText.trim()
    : '';
  const selectedPayload = normalizedSelectionText
    ? parseViewerInput(normalizedSelectionText, _jsonEngine, 'pending')
    : null;

  return {
    jsonText: selectedPayload?.payload.string || null,
    inputText: !selectedPayload && normalizedSelectionText ? normalizedSelectionText : null
  };
};
