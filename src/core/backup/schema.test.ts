import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../settings/schema';
import {
  BackupValidationError,
  buildJsonMateBackup,
  jsonMateBackupFormat,
  jsonMateBackupSchemaVersion,
  maxJsonMateBackupBytes,
  parseJsonMateBackup,
  parseJsonMateBackupText,
  serializeJsonMateBackup
} from './schema';

const buildFixture = () => buildJsonMateBackup({
  settings: {
    ...defaultSettings,
    lang: 'zh-cn',
    fontFamily: 'Fira Code',
    launchCount: 27
  },
  library: {
    recents: [{
      url: 'https://example.com/data.json',
      detectedTitle: 'Example data',
      lastOpenedAt: 1_700_000_000_000,
      sourceType: 'recognized-page'
    }],
    collections: [{
      id: 'jm_example',
      url: 'https://example.com/data.json',
      detectedTitle: 'Example data',
      customTitle: 'API fixture',
      collection: 'Work',
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100,
      lastOpenedAt: 1_700_000_000_100,
      sourceType: 'recognized-page'
    }]
  },
  viewer: {
    searchHistory: [{ query: 'requestId', mode: 'key' }],
    searchMode: 'value',
    minimalMode: true,
    panelWidth: 560
  },
  extensionVersion: '0.4.3',
  exportedAt: '2026-07-15T10:00:00.000Z'
});

describe('JSON Mate backup schema', () => {
  it('round-trips user configuration without internal installation state', () => {
    const backup = buildFixture();
    const restored = parseJsonMateBackupText(serializeJsonMateBackup(backup));

    expect(restored.format).toBe(jsonMateBackupFormat);
    expect(restored.schemaVersion).toBe(jsonMateBackupSchemaVersion);
    expect(restored.data.settings.lang).toBe('zh-cn');
    expect(restored.data.settings.fontFamily).toBe('Fira Code');
    expect(restored.data.library.collections).toHaveLength(1);
    expect(restored.data.viewer.panelWidth).toBe(560);
    expect(restored.data.settings).not.toHaveProperty('launchCount');
    expect(restored.data.settings).not.toHaveProperty('initialized');
  });

  it('ignores non-whitelisted settings and top-level fields', () => {
    const backup = buildFixture() as unknown as Record<string, unknown>;
    const data = backup.data as Record<string, unknown>;
    data.settings = {
      ...(data.settings as Record<string, unknown>),
      launchCount: 999,
      initialized: false,
      'jsonMate.telemetry.installationId.v1': 'private-id'
    };
    backup.pendingViewerJsonText = '{"secret":true}';

    const restored = parseJsonMateBackup(backup);
    expect(restored.data.settings).not.toHaveProperty('launchCount');
    expect(restored.data.settings).not.toHaveProperty('initialized');
    expect(restored.data.settings).not.toHaveProperty('jsonMate.telemetry.installationId.v1');
    expect(restored).not.toHaveProperty('pendingViewerJsonText');
  });

  it.each([
    [{}, 'invalid-format'],
    [{ ...buildFixture(), schemaVersion: 2 }, 'unsupported-version'],
    [{
      ...buildFixture(),
      data: {
        ...buildFixture().data,
        library: {
          recents: [{
            url: 'javascript:alert(1)',
            detectedTitle: 'Invalid',
            lastOpenedAt: 1,
            sourceType: 'manual-input'
          }],
          collections: []
        }
      }
    }, 'invalid-data']
  ])('rejects invalid backup data with %s', (value, expectedCode) => {
    expect(() => parseJsonMateBackup(value)).toThrowError(
      expect.objectContaining({ code: expectedCode })
    );
  });

  it('rejects invalid JSON and oversized files before import', () => {
    expect(() => parseJsonMateBackupText('{')).toThrowError(
      expect.objectContaining<Partial<BackupValidationError>>({ code: 'invalid-json' })
    );
    expect(() => parseJsonMateBackupText('x'.repeat(maxJsonMateBackupBytes + 1))).toThrowError(
      expect.objectContaining<Partial<BackupValidationError>>({ code: 'too-large' })
    );
  });
});
