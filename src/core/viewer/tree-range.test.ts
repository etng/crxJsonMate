import { describe, expect, it } from 'vitest';
import { listNodeChildrenRange } from './tree';

describe('viewer tree child windowing', () => {
  it('lists only the requested child window for large branches', () => {
    const children = listNodeChildrenRange(['zero', 'one', 'two', 'three'], false, 1, 3);

    expect(children).toEqual([
      { key: 1, path: [1], value: 'one' },
      { key: 2, path: [2], value: 'two' }
    ]);
  });
});
