import { startTransition, useEffect, useEffectEvent, useRef, useState } from 'react';
import {
  defaultSettings,
  fontOptions,
  languageOptions,
  type JsonMateSettings
} from '@/core/settings/schema';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import { getOptionMessages } from './messages';
import './style.css';

type SaveState = 'idle' | 'saving' | 'saved';

const supportLinks = [
  {
    key: 'openToolkit',
    href: '/transform-toolkit.html',
    caption: 'transform-toolkit.html',
    external: false
  },
  {
    key: 'officialWebsite',
    href: 'https://json-mate.0o666.xyz',
    caption: 'json-mate.0o666.xyz',
    external: true
  },
  {
    key: 'feedback',
    href: 'https://json-mate.0o666.xyz/#feedback',
    caption: 'json-mate.0o666.xyz/#feedback',
    external: true
  },
  {
    key: 'projectRoadmap',
    href: 'https://json-mate.0o666.xyz/#roadmap',
    caption: 'json-mate.0o666.xyz/#roadmap',
    external: true
  }
] as const;

function ToggleRow(props: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const { title, description, checked, onChange } = props;

  return (
    <label className="toggleRow">
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
      <input
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}

function RadioGroup<T extends string>(props: {
  label: string;
  name: string;
  options: Array<{ value: T; label: string }>;
  value: T;
  wide?: boolean;
  onChange: (value: T) => void;
}) {
  const { label, name, options, value, wide = false, onChange } = props;

  return (
    <div className="fieldBlock">
      <div className="fieldLabel">
        <strong>{label}</strong>
      </div>
      <div className={`choiceGrid${wide ? ' choiceGridWide' : ''}`}>
        {options.map((option) => (
          <label className="choiceChip" key={option.value}>
            <input
              checked={value === option.value}
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }> | ReadonlyArray<string>;
  onChange: (value: T) => void;
}) {
  const { label, value, options, onChange } = props;

  return (
    <div className="fieldBlock">
      <label className="fieldLabel">
        <strong>{label}</strong>
      </label>
      <select
        className="selectControl"
        onChange={(event) => onChange(event.target.value as T)}
        value={value}
      >
        {options.map((option) => {
          if (typeof option === 'string') {
            return (
              <option key={option} value={option}>
                {option}
              </option>
            );
          }

          return (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          );
        })}
      </select>
    </div>
  );
}

export function App() {
  const [settings, setSettings] = useState<JsonMateSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<number | null>(null);

  const messages = getOptionMessages(settings.lang);

  const applyPagePresentation = useEffectEvent((nextSettings: JsonMateSettings) => {
    document.documentElement.lang = nextSettings.lang;
    document.documentElement.style.setProperty(
      '--body-font',
      `"${nextSettings.fontFamily}", "Avenir Next", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`
    );
    document.title = messages.title;
  });

  useEffect(() => {
    void (async () => {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);
      setIsLoaded(true);
    })();
  }, []);

  useEffect(() => {
    applyPagePresentation(settings);
  }, [applyPagePresentation, settings]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
  }, []);

  const persistSetting = useEffectEvent(async <K extends keyof JsonMateSettings>(
    key: K,
    value: JsonMateSettings[K]
  ) => {
    const nextSettings = {
      ...settings,
      [key]: value
    };

    setSettings(nextSettings);
    startTransition(() => setSaveState('saving'));
    await saveSettings({ [key]: value });
    startTransition(() => setSaveState('saved'));

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(() => {
      startTransition(() => setSaveState('idle'));
    }, 1600);
  });

  const statusText = saveState === 'saving'
    ? messages.statusSaving
    : saveState === 'saved'
      ? messages.statusSaved
      : '';

  const closeOptionsPage = useEffectEvent(async () => {
    const searchParams = new URLSearchParams(window.location.search);
    const source = searchParams.get('source');
    const isReturnSource = source === 'viewer' || source === 'launcher' || source === 'toolkit';
    const isExplicitPopupWindow = window.opener != null || searchParams.get('windowMode') === 'popup';

    if (isReturnSource) {
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      const fallbackUrl = source === 'toolkit'
        ? '/transform-toolkit.html'
        : source === 'launcher'
          ? '/viewer.html?launcher=1'
          : '/viewer.html';
      window.location.assign(browser.runtime.getURL(fallbackUrl));
      return;
    }

    if (isExplicitPopupWindow) {
      const currentTab = await browser.tabs.getCurrent();
      if (currentTab?.id != null) {
        await browser.tabs.remove(currentTab.id);
        return;
      }

      window.close();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    const currentTab = await browser.tabs.getCurrent();
    if (currentTab?.id != null) {
      await browser.tabs.remove(currentTab.id);
      return;
    }

    window.location.assign(browser.runtime.getURL('/viewer.html?launcher=1'));
  });

  return (
    <main className="shell">
      <section className="heroCard">
        <div className="heroBrand">
          <div aria-hidden="true" className="heroBadge">JM</div>
          <div>
            <p className="eyebrow">{messages.eyebrow}</p>
            <h1>{messages.title}</h1>
            <p className="heroCopy">{messages.subtitle}</p>
          </div>
        </div>
        <div className="heroActions">
          <p className="saveHint">{messages.saveHint}</p>
          <button className="ghostButton" onClick={() => void closeOptionsPage()} type="button">
            {messages.close}
          </button>
        </div>
      </section>

      <section className={`statusStrip${statusText ? '' : ' isHidden'}`} aria-live="polite">
        {statusText}
      </section>

      <div className="settingsGrid">
        <section className="card">
          <div className="cardHeading">
            <p className="eyebrow">{messages.sectionBehaviorEyebrow}</p>
            <h2>{messages.sectionBehavior}</h2>
          </div>

          <ToggleRow
            checked={settings.autoRenderEnabled}
            description={messages.autoRenderDesc}
            onChange={(value) => void persistSetting('autoRenderEnabled', value)}
            title={messages.autoRender}
          />

          <ToggleRow
            checked={settings.contextMenuEnabled}
            description={messages.contextMenuEnabledDesc}
            onChange={(value) => void persistSetting('contextMenuEnabled', value)}
            title={messages.contextMenuEnabled}
          />

          <RadioGroup
            label={messages.openMode}
            name="openViewerMode"
            onChange={(value) => void persistSetting('openViewerMode', value)}
            options={[
              { value: 'popup', label: messages.openWindow },
              { value: 'tab', label: messages.openTab }
            ]}
            value={settings.openViewerMode}
          />

          <RadioGroup
            label={messages.detachedOpenMode}
            name="detachedViewerMode"
            onChange={(value) => void persistSetting('detachedViewerMode', value)}
            options={[
              { value: 'tab', label: messages.openTab },
              { value: 'popup', label: messages.openWindow }
            ]}
            value={settings.detachedViewerMode}
          />

          <RadioGroup
            label={messages.panelMode}
            name="panelMode"
            onChange={(value) => void persistSetting('panelMode', value)}
            options={[
              { value: 'always', label: messages.panelAlways },
              { value: 'leftClick', label: messages.panelLeftClick },
              { value: 'rightClick', label: messages.panelRightClick },
              { value: 'clickButton', label: messages.panelButton }
            ]}
            value={settings.panelMode}
            wide
          />
        </section>

        <section className="card">
          <div className="cardHeading">
            <p className="eyebrow">{messages.sectionAppearanceEyebrow}</p>
            <h2>{messages.sectionAppearance}</h2>
          </div>

          <ToggleRow
            checked={settings.minimalism}
            description={messages.minimalismDesc}
            onChange={(value) => void persistSetting('minimalism', value)}
            title={messages.minimalism}
          />

          {settings.minimalism && (
            <RadioGroup
              label={messages.minimalismWhen}
              name="minimalismTrigger"
              onChange={(value) => void persistSetting('minimalismTrigger', value)}
              options={[
                { value: 'largePayloadOnly', label: messages.minimalismWhenLargePayloadOnly },
                { value: 'always', label: messages.minimalismWhenAlways }
              ]}
              value={settings.minimalismTrigger}
            />
          )}

          <RadioGroup
            label={messages.renderMode}
            name="renderMode"
            onChange={(value) => void persistSetting('renderMode', value)}
            options={[
              { value: 'rich', label: messages.renderRich },
              { value: 'smart', label: messages.renderSmart },
              { value: 'dark', label: messages.renderDark }
            ]}
            value={settings.renderMode}
          />

          <SelectField
            label={messages.fontFamily}
            onChange={(value) => void persistSetting('fontFamily', value)}
            options={fontOptions}
            value={settings.fontFamily}
          />

          <SelectField
            label={messages.language}
            onChange={(value) => void persistSetting('lang', value)}
            options={languageOptions}
            value={settings.lang}
          />
        </section>

        <section className="card">
          <div className="cardHeading">
            <p className="eyebrow">{messages.sectionDataEyebrow}</p>
            <h2>{messages.sectionData}</h2>
          </div>

          <RadioGroup
            label={messages.showImageMode}
            name="showImageMode"
            onChange={(value) => void persistSetting('showImageMode', value)}
            options={[
              { value: 'hover', label: messages.showImagesOnHover },
              { value: 'all', label: messages.showImagesAlways }
            ]}
            value={settings.showImageMode}
          />

          <RadioGroup
            label={messages.showLengthMode}
            name="showLengthMode"
            onChange={(value) => void persistSetting('showLengthMode', value)}
            options={[
              { value: 'array', label: messages.showLengthArray },
              { value: 'array-object', label: messages.showLengthBoth }
            ]}
            value={settings.showLengthMode}
          />

          <RadioGroup
            label={messages.jsonEngine}
            name="jsonEngine"
            onChange={(value) => void persistSetting('jsonEngine', value)}
            options={[
              { value: 'JM-JSON', label: messages.jsonEngineMate },
              { value: 'JSON', label: messages.jsonEngineNative }
            ]}
            value={settings.jsonEngine}
          />

          <ToggleRow
            checked={Boolean(settings.sortKey)}
            description={messages.sortKeyDesc}
            onChange={(value) => void persistSetting('sortKey', value)}
            title={messages.sortKey}
          />

          <ToggleRow
            checked={settings.showTextFormat}
            description={messages.showTextFormatDesc}
            onChange={(value) => void persistSetting('showTextFormat', value)}
            title={messages.showTextFormat}
          />

          <ToggleRow
            checked={settings.rememberNodeState}
            description={messages.rememberNodeStateDesc}
            onChange={(value) => void persistSetting('rememberNodeState', value)}
            title={messages.rememberNodeState}
          />
        </section>

        <aside className="card supportCard">
          <div className="cardHeading">
            <p className="eyebrow">{messages.sectionSupportEyebrow}</p>
            <h2>{messages.sectionSupport}</h2>
          </div>

          <div className="supportList">
            {supportLinks.map((link) => (
              <a
                className="supportLink"
                href={link.href}
                key={link.key}
                rel={link.external ? 'noreferrer' : undefined}
                target={link.external ? '_blank' : undefined}
              >
                <span>{messages[link.key]}</span>
                <small>{link.caption}</small>
              </a>
            ))}
          </div>

          <div className="notePanel">
            <strong>{messages.disableEdge}</strong>
            <code>edge://flags/#edge-json-viewer</code>
          </div>
        </aside>
      </div>
    </main>
  );
}
