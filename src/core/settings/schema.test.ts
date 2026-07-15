import { describe, expect, it } from 'vitest';
import { defaultSettings } from './schema';

describe('defaultSettings', () => {
  it('enables every detailed Viewer display option for first-time users', () => {
    expect(defaultSettings).toMatchObject({
      showArrayIndexes: true,
      showArrayLength: true,
      showImages: true,
      showLinkButtons: true,
      showTreeValues: true,
      showTypeIcons: true,
      treeIconStyle: 'folder'
    });
  });
});
