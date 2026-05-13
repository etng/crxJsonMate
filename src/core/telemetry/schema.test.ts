import { describe, expect, it } from 'vitest';
import {
  buildTelemetryPayload,
  isTelemetryEventName,
  normalizeTelemetrySegment
} from './schema';

describe('telemetry schema', () => {
  it('accepts only whitelisted event names', () => {
    expect(isTelemetryEventName('install')).toBe(true);
    expect(isTelemetryEventName('viewer_open')).toBe(true);
    expect(isTelemetryEventName('url_open')).toBe(false);
    expect(isTelemetryEventName('json_value_edit')).toBe(false);
  });

  it('normalizes dimension fields into coarse segments', () => {
    expect(normalizeTelemetrySegment('Chrome 120 / Canary')).toBe('chrome-120-canary');
    expect(normalizeTelemetrySegment('')).toBe('unknown');
  });

  it('builds the allowed payload without content-bearing fields', () => {
    const payload = buildTelemetryPayload({
      appVersion: '0.2.5',
      browserFamily: 'Chrome',
      eventDay: '2026-05-13',
      eventName: 'daily_active',
      installationId: '00000000-0000-4000-8000-000000000000',
      locale: 'zh-CN',
      osFamily: 'macOS',
      previousVersion: '0.2.4'
    });

    expect(payload).toEqual({
      schemaVersion: 1,
      product: 'json-mate',
      eventName: 'daily_active',
      eventDay: '2026-05-13',
      installationId: '00000000-0000-4000-8000-000000000000',
      appVersion: '0.2.5',
      locale: 'zh-cn',
      browserFamily: 'chrome',
      osFamily: 'macos',
      previousVersion: '0.2.4'
    });
    expect(Object.keys(payload)).not.toContain('url');
    expect(Object.keys(payload)).not.toContain('domain');
    expect(Object.keys(payload)).not.toContain('json');
    expect(Object.keys(payload)).not.toContain('searchQuery');
    expect(Object.keys(payload)).not.toContain('convertedText');
  });
});
