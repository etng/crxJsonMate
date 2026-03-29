import { describe, expect, it } from 'vitest';
import { canRenameKeyAtPath, formatViewerEditablePath, formatViewerPath, getValueAtPath, listNodeChildren, parseViewerPath, renameKeyAtPath, searchViewerPaths, setValueAtPath } from './tree';

describe('viewer tree helpers', () => {
  it('formats root and nested paths', () => {
    expect(formatViewerPath([])).toBe('Root');
    expect(formatViewerPath(['user', 'name'])).toBe('Root.user.name');
    expect(formatViewerPath(['items', 2, 'label'])).toBe('Root.items[2].label');
    expect(formatViewerEditablePath([])).toBe('');
    expect(formatViewerEditablePath(['user', 'name'])).toBe('user.name');
  });

  it('reads values by path', () => {
    const data = { user: { name: 'mate' }, items: [{ id: 1 }, { id: 2 }] };

    expect(getValueAtPath(data, ['user', 'name'])).toBe('mate');
    expect(getValueAtPath(data, ['items', 1, 'id'])).toBe(2);
  });

  it('parses editable viewer paths', () => {
    expect(parseViewerPath('Root')).toEqual([]);
    expect(parseViewerPath('user.profile')).toEqual(['user', 'profile']);
    expect(parseViewerPath('Root.user.profile')).toEqual(['user', 'profile']);
    expect(parseViewerPath('Root.items[2].label')).toEqual(['items', 2, 'label']);
    expect(parseViewerPath('Root["meta-key"][0]')).toEqual(['meta-key', 0]);
    expect(parseViewerPath('Root.user[')).toBeNull();
  });

  it('updates values immutably by path', () => {
    const data = { user: { name: 'mate' }, items: [{ id: 1 }, { id: 2 }] };
    const nextData = setValueAtPath(data, ['items', 1, 'id'], 9) as typeof data;

    expect(nextData.items[1]?.id).toBe(9);
    expect(data.items[1]?.id).toBe(2);
  });

  it('renames object keys immutably by path', () => {
    const data = { user: { profile: { displayName: 'mate' } } };
    const nextData = renameKeyAtPath(data, ['user', 'profile', 'displayName'], 'name') as typeof data;

    expect(canRenameKeyAtPath(data, ['user', 'profile', 'displayName'])).toBe(true);
    expect(nextData.user.profile).toEqual({ name: 'mate' });
    expect(data.user.profile).toEqual({ displayName: 'mate' });
  });

  it('lists object children in key order when requested', () => {
    const children = listNodeChildren({ b: 2, a: 1 }, true);

    expect(children.map((child) => child.key)).toEqual(['a', 'b']);
  });

  it('searches all matching formatted paths', () => {
    const data = {
      user: {
        profile: {
          name: 'mate'
        }
      },
      items: [
        { profileName: 'one' },
        { profileName: 'two' }
      ]
    };

    const matches = searchViewerPaths(data, 'profile');

    expect(matches[0]?.formattedPath).toBe('Root.user.profile');
    expect(matches.map((match) => match.formattedPath)).toEqual(expect.arrayContaining([
      'Root.user.profile',
      'Root.user.profile.name',
      'Root.items[0].profileName',
      'Root.items[1].profileName'
    ]));
  });

  it('searches values separately from keys and paths', () => {
    const data = {
      user: {
        profile: {
          name: 'mate runner'
        }
      },
      meta: {
        note: 'runner'
      }
    };

    const valueMatches = searchViewerPaths(data, 'runner', false, 'value');

    expect(valueMatches[0]?.formattedPath).toBe('Root.meta.note');
    expect(valueMatches.map((match) => match.formattedPath)).toEqual(expect.arrayContaining([
      'Root.meta.note',
      'Root.user.profile.name',
      'Root.meta',
      'Root.user.profile'
    ]));
  });

  it('searches serialized structured values in value mode', () => {
    const data = {
      meta: {
        payload: {
          source: 'json-mate-local-fixture',
          version: '0.2.4'
        }
      },
      user: {
        profile: {
          displayName: 'JSON Mate'
        }
      }
    };

    const valueMatches = searchViewerPaths(data, 'json-mate-local-fixture', false, 'value');

    expect(valueMatches[0]?.formattedPath).toBe('Root.meta.payload.source');
    expect(valueMatches.map((match) => match.formattedPath)).toEqual(expect.arrayContaining([
      'Root.meta.payload.source',
      'Root.meta.payload'
    ]));
  });

  it('keeps stronger multi-token path matches ahead of loose matches', () => {
    const data = {
      user: {
        profile: {
          displayName: 'JSON Mate'
        }
      },
      profile: {
        userDisplay: true
      }
    };

    const matches = searchViewerPaths(data, 'user profile');

    expect(matches[0]?.formattedPath).toBe('Root.user.profile');
  });

  it('returns repeated key matches in rendered path order for concrete path searches', () => {
    const data = {
      items: [
        { price: 19.99, title: 'starter' },
        { price: 48.5, title: 'pro' }
      ],
      meta: {
        priceGuide: 'usd'
      }
    };

    const matches = searchViewerPaths(data, 'price');

    expect(matches.map((match) => match.formattedPath)).toEqual([
      'Root.items[0].price',
      'Root.items[1].price',
      'Root.meta.priceGuide'
    ]);
  });

  it('finds repeated scalar values in value mode', () => {
    const data = {
      items: [
        { price: 19.99 },
        { price: 48.5 }
      ],
      summary: {
        defaultPrice: 19.99
      }
    };

    const matches = searchViewerPaths(data, '19.99', false, 'value');

    expect(matches.map((match) => match.formattedPath)).toEqual(expect.arrayContaining([
      'Root.items[0].price',
      'Root.summary.defaultPrice'
    ]));
  });
});
