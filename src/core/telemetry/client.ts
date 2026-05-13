import { browser } from '#imports';
import { loadSettings } from '@/core/settings/storage';
import {
  allowedTelemetryEvents,
  buildTelemetryPayload,
  telemetryEndpoint,
  type TelemetryEventName,
  type TelemetryPayload
} from './schema';

export interface TelemetryEventOptions {
  force?: boolean;
  previousVersion?: string;
}

const telemetryInstallationIdStorageKey = 'jsonMate.telemetry.installationId.v1';
const telemetryAttemptsStorageKey = 'jsonMate.telemetry.attempts.v1';
const telemetryRequestTimeoutMs = 2500;
const maxStoredAttemptKeys = 120;

const getUtcDay = (date = new Date()) => date.toISOString().slice(0, 10);

const createTelemetryInstallationId = () => {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const values = new Uint8Array(16);
  crypto.getRandomValues(values);
  values[6] = (values[6] & 0x0f) | 0x40;
  values[8] = (values[8] & 0x3f) | 0x80;
  const hex = Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20)
  ].join('-');
};

const resolveBrowserFamily = () => {
  const userAgent = navigator.userAgent || '';
  if (/Edg\//.test(userAgent)) {
    return 'edge';
  }
  if (/Firefox\//.test(userAgent)) {
    return 'firefox';
  }
  if (/Chrome\//.test(userAgent) || /Chromium\//.test(userAgent)) {
    return 'chrome';
  }
  return 'unknown';
};

const resolveOsFamily = () => {
  const userAgentData = (navigator as Navigator & {
    userAgentData?: { platform?: string };
  }).userAgentData;
  const platform = userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  if (/mac/i.test(platform)) {
    return 'macos';
  }
  if (/win/i.test(platform)) {
    return 'windows';
  }
  if (/android/i.test(platform)) {
    return 'android';
  }
  if (/linux/i.test(platform)) {
    return 'linux';
  }
  if (/iphone|ipad|ios/i.test(platform)) {
    return 'ios';
  }
  return 'unknown';
};

const getTelemetryInstallationId = async () => {
  const storedValue = await browser.storage.local.get(telemetryInstallationIdStorageKey);
  const existingInstallationId = storedValue[telemetryInstallationIdStorageKey];
  if (typeof existingInstallationId === 'string' && existingInstallationId) {
    return existingInstallationId;
  }

  const installationId = createTelemetryInstallationId();
  await browser.storage.local.set({
    [telemetryInstallationIdStorageKey]: installationId
  });
  return installationId;
};

const getAttemptKey = (eventName: TelemetryEventName, eventDay: string, appVersion: string) => (
  `${eventDay}:${appVersion}:${eventName}`
);

const readTelemetryAttempts = async () => {
  const storedValue = await browser.storage.local.get(telemetryAttemptsStorageKey);
  const attempts = storedValue[telemetryAttemptsStorageKey];
  return attempts && typeof attempts === 'object' && !Array.isArray(attempts)
    ? attempts as Record<string, string>
    : {};
};

const rememberTelemetryAttempt = async (attemptKey: string) => {
  const attempts = await readTelemetryAttempts();
  attempts[attemptKey] = new Date().toISOString();

  const prunedAttempts = Object.fromEntries(
    Object.entries(attempts)
      .sort(([, left], [, right]) => right.localeCompare(left))
      .slice(0, maxStoredAttemptKeys)
  );

  await browser.storage.local.set({
    [telemetryAttemptsStorageKey]: prunedAttempts
  });
};

const postTelemetryPayload = async (payload: TelemetryPayload) => {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), telemetryRequestTimeoutMs);

  try {
    await fetch(telemetryEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify(payload),
      credentials: 'omit',
      cache: 'no-store',
      signal: abortController.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
};

export const trackTelemetryEvent = async (
  eventName: TelemetryEventName,
  options: TelemetryEventOptions = {}
) => {
  if (!allowedTelemetryEvents.has(eventName)) {
    return false;
  }

  const settings = await loadSettings();
  if (!settings.telemetryEnabled) {
    return false;
  }

  const eventDay = getUtcDay();
  const appVersion = browser.runtime.getManifest().version;
  const attemptKey = getAttemptKey(eventName, eventDay, appVersion);

  if (!options.force) {
    const attempts = await readTelemetryAttempts();
    if (attempts[attemptKey]) {
      return false;
    }
    await rememberTelemetryAttempt(attemptKey);
  }

  const installationId = await getTelemetryInstallationId();
  const locale = settings.lang || browser.i18n.getUILanguage();
  const payload = buildTelemetryPayload({
    appVersion,
    browserFamily: resolveBrowserFamily(),
    eventDay,
    eventName,
    installationId,
    locale,
    osFamily: resolveOsFamily(),
    previousVersion: options.previousVersion
  });

  try {
    await postTelemetryPayload(payload);
    return true;
  } catch {
    return false;
  }
};

export const clearTelemetryLocalState = async () => {
  await browser.storage.local.remove([
    telemetryInstallationIdStorageKey,
    telemetryAttemptsStorageKey
  ]);
};
