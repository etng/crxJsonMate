export const telemetryEndpoint = 'https://json-mate.0o666.xyz/api/telemetry';

export const telemetryEventNames = [
  'install',
  'update',
  'daily_active',
  'viewer_open',
  'toolkit_open'
] as const;

export type TelemetryEventName = typeof telemetryEventNames[number];

export interface TelemetryPayload {
  schemaVersion: 1;
  product: 'json-mate';
  eventName: TelemetryEventName;
  eventDay: string;
  installationId: string;
  appVersion: string;
  locale: string;
  browserFamily: string;
  osFamily: string;
  previousVersion?: string;
}

export const allowedTelemetryEvents = new Set<TelemetryEventName>(telemetryEventNames);

export const normalizeTelemetrySegment = (value: string | null | undefined, fallback = 'unknown') => {
  const normalizedValue = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalizedValue || fallback;
};

export const isTelemetryEventName = (value: unknown): value is TelemetryEventName => (
  typeof value === 'string' && allowedTelemetryEvents.has(value as TelemetryEventName)
);

export const isAutomatedTelemetryEnvironment = (params: {
  userAgent?: string | null;
  webdriver?: boolean | null;
}) => {
  if (params.webdriver) {
    return true;
  }

  return /HeadlessChrome|Playwright|Puppeteer|WebDriver/i.test(String(params.userAgent || ''));
};

export const buildTelemetryPayload = (params: {
  appVersion: string;
  browserFamily: string;
  eventDay: string;
  eventName: TelemetryEventName;
  installationId: string;
  locale: string;
  osFamily: string;
  previousVersion?: string;
}): TelemetryPayload => {
  const payload: TelemetryPayload = {
    schemaVersion: 1,
    product: 'json-mate',
    eventName: params.eventName,
    eventDay: params.eventDay,
    installationId: params.installationId,
    appVersion: normalizeTelemetrySegment(params.appVersion),
    locale: normalizeTelemetrySegment(params.locale),
    browserFamily: normalizeTelemetrySegment(params.browserFamily),
    osFamily: normalizeTelemetrySegment(params.osFamily)
  };

  if (params.previousVersion) {
    payload.previousVersion = normalizeTelemetrySegment(params.previousVersion);
  }

  return payload;
};
