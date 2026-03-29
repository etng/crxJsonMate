import { browser } from '#imports';
import { startTransition, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react';
import { toolkitToolMap, toolkitTools, getLocalizedTool, toolMatchesQuery, dedupeToolIds } from '@/core/toolkit/definitions';
import { type JsonMateSettings } from '@/core/settings/schema';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import { getToolkitMessages } from './messages';
import './style.css';

const queryParams = new URLSearchParams(window.location.search);

const resolveContextValue = (isEmbedded: boolean) => {
  if (!isEmbedded || window.parent === window) {
    return null;
  }

  try {
    const candidate = (window.parent as Window & { jsonMateCurrentValue?: unknown }).jsonMateCurrentValue;
    return typeof candidate === 'string' ? candidate : null;
  } catch {
    return null;
  }
};

const buildNavigation = (currentToolId: string, recentToolIds: string[]) =>
  dedupeToolIds([currentToolId, ...recentToolIds]).slice(0, 5);

export function App() {
  const [settings, setSettings] = useState<JsonMateSettings | null>(null);
  const [lang, setLang] = useState<JsonMateSettings['lang']>('en');
  const [currentToolId, setCurrentToolId] = useState(toolkitTools[0].id);
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);
  const [catalogQuery, setCatalogQuery] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [targetText, setTargetText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [isEmbedded, setIsEmbedded] = useState(false);
  const seedValueRef = useRef('');
  const sourceTextRef = useRef<HTMLTextAreaElement | null>(null);
  const targetTextRef = useRef<HTMLTextAreaElement | null>(null);

  const messages = getToolkitMessages(lang);
  const currentTool = toolkitToolMap[currentToolId];
  const localizedCurrentTool = getLocalizedTool(currentTool, lang);

  const filteredTools = useMemo(() => (
    toolkitTools.filter((tool) => toolMatchesQuery(tool, lang, catalogQuery))
  ), [catalogQuery, lang]);

  const applyPagePresentation = useEffectEvent((nextLang: JsonMateSettings['lang'], embedded: boolean) => {
    document.documentElement.lang = nextLang;
    document.title = getToolkitMessages(nextLang).title;
    document.body.classList.toggle('isEmbedded', embedded);
  });

  const applyCurrentValue = useEffectEvent((value: string) => {
    seedValueRef.current = value;
    setErrorText('');
    if (currentTool.preferEncode) {
      setSourceText(value);
      try {
        setTargetText(currentTool.encode(value));
      } catch (error) {
        setErrorText(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    setTargetText(value);
    try {
      setSourceText(currentTool.decode(value));
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  });

  const publishTransformedValue = useEffectEvent((value: string) => {
    void browser.runtime.sendMessage({
      cmd: 'toolkitReturnValue',
      data: value
    } as const).catch(() => {
      // The viewer can still recover from the pending payload fallback.
    });

    void browser.runtime.sendMessage({
      cmd: 'setPendingJson',
      data: value
    } as const).catch(() => {
      // Ignore runtime failures when the extension bridge is unavailable.
    });
  });

  const syncLoadedSettings = useEffectEvent(async () => {
    const loadedSettings = await loadSettings();
    const embedded = queryParams.get('embedded') === '1';
    const queryLang = queryParams.get('lang');
    const nextLang = queryLang === 'en' || queryLang === 'zh-cn' || queryLang === 'zh-tw' || queryLang === 'ja'
      ? queryLang
      : loadedSettings.lang;

    if (nextLang !== loadedSettings.lang) {
      await saveSettings({ lang: nextLang });
    }

    const saved = Array.isArray(loadedSettings.toolkitNavigation)
      ? loadedSettings.toolkitNavigation.filter((id) => toolkitToolMap[id])
      : [];

    setSettings({
      ...loadedSettings,
      lang: nextLang
    });
    setLang(nextLang);
    setIsEmbedded(embedded);
    setCurrentToolId(saved[0] || toolkitTools[0].id);
    setRecentToolIds(dedupeToolIds(saved.slice(1)).slice(0, 4));
  });

  const applyRuntimeSeed = useEffectEvent(async (embedded: boolean) => {
    try {
      const pendingValue = await browser.runtime.sendMessage({ cmd: 'getPendingJson' } as const);
      if (typeof pendingValue === 'string' && pendingValue) {
        applyCurrentValue(pendingValue);
      }
    } catch {
      // Runtime messaging is optional in local page development.
    }
  });

  useEffect(() => {
    void syncLoadedSettings();
  }, [syncLoadedSettings]);

  useEffect(() => {
    void applyRuntimeSeed(isEmbedded);
  }, [applyRuntimeSeed, isEmbedded]);

  useEffect(() => {
    const nextEditableField = currentTool.preferEncode ? sourceTextRef.current : targetTextRef.current;
    if (!nextEditableField) {
      return;
    }

    const focusFrame = window.requestAnimationFrame(() => {
      nextEditableField.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
    };
  }, [currentToolId, currentTool.preferEncode]);

  useEffect(() => {
    applyPagePresentation(lang, isEmbedded);
  }, [applyPagePresentation, isEmbedded, lang]);

  const persistNavigation = useEffectEvent(async (nextCurrentToolId: string, nextRecentToolIds: string[]) => {
    const nextNavigation = buildNavigation(nextCurrentToolId, nextRecentToolIds);
    await saveSettings({ toolkitNavigation: nextNavigation });
    setSettings((current) => current ? { ...current, toolkitNavigation: nextNavigation } : current);
  });

  const selectTool = useEffectEvent(async (toolId: string, persist = true) => {
    if (!toolkitToolMap[toolId]) {
      return;
    }

    const nextRecentToolIds = toolId === currentToolId
      ? recentToolIds
      : dedupeToolIds([currentToolId, ...recentToolIds.filter((id) => id !== toolId)]).slice(0, 4);

    setCurrentToolId(toolId);
    setRecentToolIds(nextRecentToolIds);

    if (seedValueRef.current) {
      startTransition(() => {
        const nextTool = toolkitToolMap[toolId];
        setErrorText('');
        if (nextTool.preferEncode) {
          setSourceText(seedValueRef.current);
          try {
            setTargetText(nextTool.encode(seedValueRef.current));
          } catch (error) {
            setErrorText(error instanceof Error ? error.message : String(error));
          }
          return;
        }

        setTargetText(seedValueRef.current);
        try {
          setSourceText(nextTool.decode(seedValueRef.current));
        } catch (error) {
          setErrorText(error instanceof Error ? error.message : String(error));
        }
      });
    }

    if (persist) {
      await persistNavigation(toolId, nextRecentToolIds);
    }
  });

  const runTransform = useEffectEvent((direction: 'encode' | 'decode') => {
    setErrorText('');
    const input = direction === 'encode' ? sourceText : targetText;

    if (!input) {
      setErrorText(direction === 'encode' ? messages.needSource : messages.needTarget);
      return;
    }

    try {
      const output = direction === 'encode'
        ? currentTool.encode(input)
        : currentTool.decode(input);
      if (direction === 'encode') {
        setTargetText(output);
        publishTransformedValue(output);
      } else {
        setSourceText(output);
        publishTransformedValue(output);
      }
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : String(error));
    }
  });

  useEffect(() => {
    const handleCurrentValueMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (!event.data || event.data.type !== 'json-mate:set-current-value') {
        return;
      }
      applyCurrentValue(String(event.data.value || ''));
    };

    const handleStorageChange = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') {
        return;
      }
      if (!changes.lang && !changes.toolkitNavigation) {
        return;
      }
      void syncLoadedSettings();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'Enter') {
        return;
      }

      event.preventDefault();
      runTransform(event.shiftKey ? 'decode' : 'encode');
    };

    window.addEventListener('message', handleCurrentValueMessage);
    browser.storage.onChanged.addListener(handleStorageChange);
    document.addEventListener('keydown', handleKeyDown);

    const contextValue = resolveContextValue(isEmbedded);
    if (contextValue) {
      applyCurrentValue(contextValue);
    }

    return () => {
      window.removeEventListener('message', handleCurrentValueMessage);
      browser.storage.onChanged.removeListener(handleStorageChange);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [applyCurrentValue, isEmbedded, runTransform, syncLoadedSettings]);

  return (
    <main className="toolShell">
      {!isEmbedded && (
        <header className="toolHero">
          <div className="toolHeroCopy">
            <p className="eyebrow">{messages.eyebrow}</p>
            <h1>{messages.title}</h1>
            <p className="heroCopy">{messages.subtitle}</p>
          </div>
        </header>
      )}

      <section className="toolLayout">
        <aside className="toolSidebar">
          <section className="sidebarPanel">
            <div className="sidebarHeader">
              <div>
                <h2>{messages.allTools}</h2>
                <p>{messages.catalogHint}</p>
              </div>
              <a className="ghostButton ghostButtonCompact" href="./options.html?source=toolkit">{messages.settingsLink}</a>
            </div>
            <label className="toolSearchField">
              <span>{messages.searchLabel}</span>
              <input
                autoCapitalize="off"
                autoComplete="off"
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder={messages.searchPlaceholder}
                spellCheck={false}
                type="search"
                value={catalogQuery}
              />
            </label>
            <nav className="catalog" aria-label="Tool catalog">
              {filteredTools.length > 0 ? filteredTools.map((tool) => {
                const localizedTool = getLocalizedTool(tool, lang);
                return (
                  <button
                    className={`catalogItem${tool.id === currentToolId ? ' isActive' : ''}`}
                    key={tool.id}
                    onClick={() => void selectTool(tool.id)}
                    type="button"
                  >
                    <strong>{localizedTool.title}</strong>
                    <span>{localizedTool.summary}</span>
                  </button>
                );
              }) : (
                <div className="catalogEmpty">{messages.noTools}</div>
              )}
            </nav>
          </section>
        </aside>

        <section className="workspace">
          <section className={`errorBanner${errorText ? '' : ' isHidden'}`} role="alert">
            {errorText}
          </section>

          <section className="workspaceFocusBar" aria-label={localizedCurrentTool.title}>
            <div className="workspaceFocusCopy">
              <p className="eyebrow workspaceFocusEyebrow">{messages.eyebrow}</p>
              <div className="workspaceFocusRoute">
                <span className="focusTag">{messages.sourceLabel}</span>
                <span aria-hidden="true" className="focusArrow">→</span>
                <strong className="focusToolName">{localizedCurrentTool.title}</strong>
                <span aria-hidden="true" className="focusArrow">→</span>
                <span className="focusTag focusTagTarget">{messages.targetLabel}</span>
              </div>
            </div>
            <p className="workspaceFocusSummary">{localizedCurrentTool.summary}</p>
          </section>

          <section className="workspaceRecentTools" hidden={buildNavigation(currentToolId, recentToolIds).length === 0}>
            <div className="workspaceRecentToolsHead">
              <h2>{messages.recentTools}</h2>
              <p>{messages.recentToolsDesc}</p>
            </div>
            <div className="chipRow compactChipRow recentChipRow" aria-label="Recent tools">
              {buildNavigation(currentToolId, recentToolIds).map((toolId) => (
                <button
                  className={`toolChip${toolId === currentToolId ? ' isActive' : ''}`}
                  key={toolId}
                  onClick={() => void selectTool(toolId)}
                  type="button"
                >
                  {getLocalizedTool(toolkitToolMap[toolId], lang).title}
                </button>
              ))}
            </div>
          </section>

          <div className="workspacePanels">
            <div className="panel panelSource">
              <div className="panelHeader">
                <label htmlFor="sourceText">{messages.sourceLabel}</label>
                <span>{messages.sourceHint}</span>
              </div>
              <textarea
                id="sourceText"
                onChange={(event) => setSourceText(event.target.value)}
                ref={sourceTextRef}
                rows={12}
                spellCheck={false}
                value={sourceText}
              />
            </div>

            <div className="workspaceQuickActions" aria-label="Transform actions">
              <div className="workspaceBridgeLegend" aria-hidden="true">
                <span>{messages.sourceLabel}</span>
                <strong>{localizedCurrentTool.title}</strong>
                <span>{messages.targetLabel}</span>
              </div>
              <button className="primaryButton" onClick={() => runTransform('encode')} type="button">
                {messages.encode}
              </button>
              <button className="secondaryButton" onClick={() => runTransform('decode')} type="button">
                {messages.decode}
              </button>
              <p className="workspaceHotkeyHint">{messages.shortcutHint}</p>
            </div>

            <div className="panel panelTarget">
              <div className="panelHeader">
                <label htmlFor="targetText">{messages.targetLabel}</label>
                <span>{messages.targetHint}</span>
              </div>
              <textarea
                id="targetText"
                onChange={(event) => setTargetText(event.target.value)}
                ref={targetTextRef}
                rows={12}
                spellCheck={false}
                value={targetText}
              />
            </div>
          </div>

          <div className="currentToolCard">
            <div className="toolTitle">{localizedCurrentTool.title}</div>
            <p className="toolSummary">{localizedCurrentTool.summary}</p>
            <div className="toolExample">
              <strong>{messages.exampleInput}</strong>
              <code>{localizedCurrentTool.exampleInput}</code>
            </div>
            <div className="toolExample">
              <strong>{messages.exampleOutput}</strong>
              <code>{localizedCurrentTool.exampleOutput}</code>
            </div>
          </div>
        </section>
      </section>
    </main>
  );
}
