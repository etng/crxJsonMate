import { browser } from '#imports';
import { startTransition, useDeferredValue, useEffect, useEffectEvent, useRef, useState } from 'react';
import { defaultSettings, type JsonMateSettings } from '@/core/settings/schema';
import { loadSettings, saveSettings } from '@/core/settings/storage';
import {
  findViewerCollectionEntryByUrl,
  formatViewerSourceTitle,
  getViewerCollectionEntryDisplayTitle,
  getViewerCollectionLimit,
  getViewerCollectionNames,
  getViewerNormalizedUrl,
  loadViewerLibrary,
  updateViewerLibraryCollection,
  updateViewerLibraryRecent,
  type ViewerCollectionEntry,
  type ViewerLibrarySnapshot,
  type ViewerSourceType
} from '@/core/viewer/library';
import {
  buildViewerPayloadState,
  createViewerStateFromData,
  hydrateViewerPayloadStateMeta,
  type EmbeddedViewerMessage,
  formatViewerEditorValue,
  parseViewerEditorValue,
  parseViewerInput,
  resolveDetachedValueText,
  resolveEmbeddedPayload,
  viewerPayloadMetaDeferralThreshold,
  type ViewerPayloadSource,
  type ViewerPayloadState
} from '@/core/viewer/session';
import {
  canRenameKeyAtPath,
  formatViewerEditablePath,
  formatViewerPath,
  getValueAtPath,
  getValueKind,
  getValuePreview,
  getStructuredChildCount,
  getViewerNodeDisplayData,
  getViewerPathKey,
  isStructuredValue,
  listNodeChildren,
  listNodeChildrenRange,
  parseViewerPath,
  type ViewerNodeDisplayData,
  renameKeyAtPath,
  searchViewerPaths,
  setValueAtPath,
  type ViewerPath,
  type ViewerPathSearchMode
} from '@/core/viewer/tree';
import { getViewerMessages } from './messages';
import './style.css';

const queryParams = new URLSearchParams(window.location.search);
const initialIframeMode = queryParams.get('type') === 'iframe' || queryParams.get('embedded') === '1';
const rootPathKey = getViewerPathKey([]);
const modernSearchHistoryStorageKey = 'jsonMate.modernViewerSearchHistory.v1';
const modernSearchModeStorageKey = 'jsonMate.modernViewerSearchMode.v1';
const modernViewerMinimalModeStorageKey = 'jsonMate.modernViewerMinimalMode.v1';
const jmTreeLengthClassName = 'show-array-length';
const detachedViewerJsonQueryKey = 'json';
const detachedViewerSourcePathQueryKey = 'sourcePath';
const detachedViewerSourceUrlQueryKey = 'sourceUrl';
const launcherViewerQueryKey = 'launcher';
const detachedViewerPayloadHashPrefix = '#payload=';
const maxDetachedViewerHashPayloadLength = 50000;
const settingsStorageKeys = new Set(Object.keys(defaultSettings));
const viewerLibraryStoragePrefix = 'jsonMate.viewer.';
const defaultViewerCollectionName = 'Default';
const progressiveTreeRootBatchSize = 120;
const progressiveTreeBranchBatchSize = 60;
const progressiveTreeRootChunkSize = 240;
const progressiveTreeBranchChunkSize = 120;
const progressiveTreeChunkDelayMs = 24;

const encodeDetachedViewerPayloadHash = (payload: NonNullable<EmbeddedViewerMessage['json']>) => {
  const encodedJson = encodeURIComponent(JSON.stringify(payload));
  return `${detachedViewerPayloadHashPrefix}${encodedJson}`;
};

const decodeDetachedViewerPayloadHash = () => {
  if (!window.location.hash.startsWith(detachedViewerPayloadHashPrefix)) {
    return null;
  }

  try {
    const encodedPayload = window.location.hash.slice(detachedViewerPayloadHashPrefix.length);
    const decodedPayload = JSON.parse(decodeURIComponent(encodedPayload));
    return decodedPayload && typeof decodedPayload === 'object'
      ? decodedPayload as NonNullable<EmbeddedViewerMessage['json']>
      : null;
  } catch {
    return null;
  }
};

const decodeDetachedViewerQueryText = () => {
  const queryValue = queryParams.get(detachedViewerJsonQueryKey);
  if (!queryValue) {
    return null;
  }

  const trimmedValue = queryValue.trim();
  return /^[\[{]/.test(trimmedValue) ? trimmedValue : null;
};

const decodeDetachedViewerSourcePath = () => {
  const sourcePathValue = queryParams.get(detachedViewerSourcePathQueryKey);
  return sourcePathValue ? sourcePathValue.trim() : '';
};

const decodeDetachedViewerSourceUrl = () => {
  const sourceUrlValue = queryParams.get(detachedViewerSourceUrlQueryKey);
  return sourceUrlValue ? sourceUrlValue.trim() : '';
};

const bootstrapDetachedViewerTitle = () => {
  if (typeof document === 'undefined') {
    return;
  }

  const initialTitleParts = [
    decodeDetachedViewerSourcePath(),
    decodeDetachedViewerSourceUrl(),
    'JSON Mate Viewer'
  ].filter(Boolean);

  if (initialTitleParts.length > 1) {
    document.title = initialTitleParts.join(' · ');
  }
};

bootstrapDetachedViewerTitle();

const resolveDetachedHashViewerState = (
  payload: NonNullable<EmbeddedViewerMessage['json']>,
  jsonEngine: JsonMateSettings['jsonEngine']
) => {
  if (payload.data === undefined) {
    return resolveEmbeddedPayload({
      cmd: 'postJson',
      json: payload
    }, jsonEngine);
  }

  const payloadString = typeof payload.string === 'string'
    ? payload.string
    : JSON.stringify(payload.data, null, 2);

  return buildViewerPayloadState({
    string: payloadString,
    data: payload.data,
    format: payload.format || 'json'
  }, 'pending', jsonEngine);
};

interface ViewerSearchHistoryEntry {
  query: string;
  mode: ViewerPathSearchMode;
}

interface ViewerHistoryEntry {
  data: unknown;
  path: ViewerPath;
  source: 'manual' | 'tool';
}

interface EditorConflictState {
  attemptedText: string;
  reason: string;
}

type ViewerToolFilterMode = 'auto' | 'all' | 'text' | 'json' | 'time' | 'state';

const SearchIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M10.4 4a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8zm0 2a4.4 4.4 0 1 0 0 8.8 4.4 4.4 0 0 0 0-8.8z" />
    <path d="M15.4 14a1 1 0 0 1 1.4 0l3.1 3.1a1 1 0 0 1-1.4 1.4l-3.1-3.1a1 1 0 0 1 0-1.4z" />
  </svg>
);

const ExpandCurrentIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M11 4a1 1 0 0 1 2 0v6h6a1 1 0 1 1 0 2h-6v6a1 1 0 1 1-2 0v-6H5a1 1 0 1 1 0-2h6z" />
  </svg>
);

const CollapseCurrentIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M5 11a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2z" />
  </svg>
);

const ExpandAllIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M4 6a1 1 0 0 1 1-1h4a1 1 0 1 1 0 2H6v3a1 1 0 1 1-2 0zm10-1a1 1 0 0 0 0 2h3v3a1 1 0 1 0 2 0V6a1 1 0 0 0-1-1zm3 14h-3a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v4a1 1 0 0 1-1 1zM5 13a1 1 0 0 1 1 1v3h3a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1z" />
  </svg>
);

const CollapseAllIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M7 7a1 1 0 0 1 1-1h2a1 1 0 1 1 0 2H9v1a1 1 0 1 1-2 0zm7-1a1 1 0 0 0 0 2h1v1a1 1 0 1 0 2 0V7a1 1 0 0 0-1-1zm1 9a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1h-2a1 1 0 1 1 0-2h1zM7 15a1 1 0 0 1 2 0v1h1a1 1 0 1 1 0 2H8a1 1 0 0 1-1-1z" />
    <path d="M6 11a1 1 0 1 0 0 2h12a1 1 0 1 0 0-2z" />
  </svg>
);

const ToolkitIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M5 6.2A2.2 2.2 0 0 1 7.2 4h9.6A2.2 2.2 0 0 1 19 6.2v11.6A2.2 2.2 0 0 1 16.8 20H7.2A2.2 2.2 0 0 1 5 17.8zm2.2-.2a.2.2 0 0 0-.2.2v11.6c0 .11.09.2.2.2h9.6a.2.2 0 0 0 .2-.2V6.2a.2.2 0 0 0-.2-.2z" />
    <path d="M9 9a1 1 0 0 1 1-1h4.8a1 1 0 1 1 0 2H10a1 1 0 0 1-1-1zm0 3.5a1 1 0 0 1 1-1h4.8a1 1 0 1 1 0 2H10a1 1 0 0 1-1-1zm0 3.5a1 1 0 0 1 1-1h2.8a1 1 0 1 1 0 2H10a1 1 0 0 1-1-1z" />
  </svg>
);

const SettingsIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M10.5 2.75h3l.7 2.7c.43.15.85.33 1.24.53l2.56-1.28 2.12 2.12-1.28 2.56c.2.39.38.81.53 1.24l2.7.7v3l-2.7.7a8.9 8.9 0 0 1-.53 1.24l1.28 2.56-2.12 2.12-2.56-1.28c-.39.2-.81.38-1.24.53l-.7 2.7h-3l-.7-2.7a8.9 8.9 0 0 1-1.24-.53L5.99 19.3l-2.12-2.12 1.28-2.56a8.9 8.9 0 0 1-.53-1.24l-2.7-.7v-3l2.7-.7c.15-.43.33-.85.53-1.24L3.87 4.7 5.99 2.58l2.56 1.28c.39-.2.81-.38 1.24-.53zM12 8.2A3.8 3.8 0 1 0 12 15.8 3.8 3.8 0 0 0 12 8.2z" />
  </svg>
);

const CollectionIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M12 3.4 14.8 9l6.1.9-4.4 4.3 1 6.1-5.5-2.9-5.5 2.9 1-6.1L3.9 9l6.1-.9z" />
  </svg>
);

const LinkIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M10.6 13.4a1 1 0 0 1 0-1.4l4.8-4.8H13a1 1 0 1 1 0-2h4.8A2.2 2.2 0 0 1 20 7.4v4.8a1 1 0 1 1-2 0V9.8l-4.8 4.8a1 1 0 0 1-1.4 0z" />
    <path d="M6.8 5.2h4a1 1 0 1 1 0 2h-4A1.6 1.6 0 0 0 5.2 8.8v8.4a1.6 1.6 0 0 0 1.6 1.6h8.4a1.6 1.6 0 0 0 1.6-1.6v-4a1 1 0 1 1 2 0v4a3.6 3.6 0 0 1-3.6 3.6H6.8a3.6 3.6 0 0 1-3.6-3.6V8.8a3.6 3.6 0 0 1 3.6-3.6z" />
  </svg>
);

const DetachedValueIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M4.8 4A2.8 2.8 0 0 0 2 6.8v10.4A2.8 2.8 0 0 0 4.8 20h7.4a1 1 0 1 0 0-2H4.8a.8.8 0 0 1-.8-.8V6.8a.8.8 0 0 1 .8-.8h10.4a.8.8 0 0 1 .8.8v2.4a1 1 0 1 0 2 0V6.8A2.8 2.8 0 0 0 15.2 4z" />
    <path d="M8.1 8.6a1 1 0 0 1 1.4 0l1.9 1.9a1 1 0 1 1-1.4 1.4l-1.2-1.2-1.2 1.2a1 1 0 1 1-1.4-1.4zm7.8 3.4a1 1 0 0 1 1.4 0l1.2 1.2 1.2-1.2a1 1 0 1 1 1.4 1.4l-1.9 1.9a1 1 0 0 1-1.4 0l-1.9-1.9a1 1 0 0 1 0-1.4z" />
    <path d="M12.2 9a1 1 0 0 1 1 1v4a1 1 0 1 1-2 0v-4a1 1 0 0 1 1-1zm3.5 8.5a1 1 0 0 1 1.4 0l1 1 2.2-2.2a1 1 0 0 1 1.4 1.4l-2.9 2.9a1 1 0 0 1-1.4 0l-1.7-1.7a1 1 0 0 1 0-1.4z" />
  </svg>
);

const JumpIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M12.4 4.7a1 1 0 0 1 1.2-.2l6.2 3.7a1 1 0 0 1 0 1.7l-6.2 3.7a1 1 0 0 1-1.5-.9v-2H5a1 1 0 1 1 0-2h7.1v-2a1 1 0 0 1 .3-.7z" />
    <path d="M5 13.5a1 1 0 0 1 1 1v1.9a1.6 1.6 0 0 0 1.6 1.6h8.8a1.6 1.6 0 0 0 1.6-1.6v-1.9a1 1 0 1 1 2 0v1.9a3.6 3.6 0 0 1-3.6 3.6H7.6A3.6 3.6 0 0 1 4 16.4v-1.9a1 1 0 0 1 1-1z" />
  </svg>
);

const CopyIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M9 4.8A2.8 2.8 0 0 1 11.8 2h6.4A2.8 2.8 0 0 1 21 4.8v8.4a2.8 2.8 0 0 1-2.8 2.8h-6.4A2.8 2.8 0 0 1 9 13.2zm2.8-.8a.8.8 0 0 0-.8.8v8.4a.8.8 0 0 0 .8.8h6.4a.8.8 0 0 0 .8-.8V4.8a.8.8 0 0 0-.8-.8z" />
    <path d="M5.8 8A2.8 2.8 0 0 1 8 8.9a1 1 0 1 1-1.5 1.3.8.8 0 0 0-.7-.2.8.8 0 0 0-.8.8v8.4a.8.8 0 0 0 .8.8h6.4a.8.8 0 0 0 .8-.8.8.8 0 0 0-.1-.4 1 1 0 1 1 1.7-1 .8.8 0 0 1 .4 1.4 2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 19.2v-8.4A2.8 2.8 0 0 1 5.8 8z" />
  </svg>
);

const SaveIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M5.8 3h9.6l4.6 4.6v10.6a2.8 2.8 0 0 1-2.8 2.8H5.8A2.8 2.8 0 0 1 3 18.2V5.8A2.8 2.8 0 0 1 5.8 3zm0 2a.8.8 0 0 0-.8.8v12.4a.8.8 0 0 0 .8.8h11.4a.8.8 0 0 0 .8-.8V8.4L14.6 5z" />
    <path d="M8 5.5a1 1 0 0 1 1-1h4.8a1 1 0 0 1 1 1v3.1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1zm1 8.6a1 1 0 0 1 1-1h4a1 1 0 0 1 0 2h-4a1 1 0 0 1-1-1z" />
  </svg>
);

const UndoIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M10.1 4.8a1 1 0 0 1 0 1.4L8.2 8H13a6 6 0 1 1 0 12H8.4a1 1 0 1 1 0-2H13a4 4 0 1 0 0-8H8.2l1.9 1.8a1 1 0 1 1-1.4 1.4L5.1 9.6a1 1 0 0 1 0-1.4l3.6-3.4a1 1 0 0 1 1.4 0z" />
  </svg>
);

const RedoIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M13.9 4.8a1 1 0 0 1 1.4 0l3.6 3.4a1 1 0 0 1 0 1.4l-3.6 3.6a1 1 0 0 1-1.4-1.4l1.9-1.8H11a4 4 0 1 0 0 8h4.6a1 1 0 1 1 0 2H11a6 6 0 1 1 0-12h4.8l-1.9-1.8a1 1 0 0 1 0-1.4z" />
  </svg>
);

const PendingIcon = () => (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24">
    <path d="M12 3a1 1 0 0 1 1 1v7.2l4.6 2.7a1 1 0 0 1-1 1.72l-5.1-3A1 1 0 0 1 11 11.8V4a1 1 0 0 1 1-1z" />
    <path d="M12 5.2A6.8 6.8 0 1 0 18.8 12 1 1 0 1 1 20.8 12 8.8 8.8 0 1 1 12 3.2a1 1 0 0 1 0 2z" />
  </svg>
);

interface TreeBranchProps {
  isSelected: (path: ViewerPath) => boolean;
  onSelect: (path: ViewerPath) => void;
  onToggle: (path: ViewerPath) => void;
  parentPath: ViewerPath;
  shouldSortObjectKeys: boolean;
  value: unknown;
  expandedPaths: Record<string, boolean>;
}

interface ViewerTreeBranchProps extends TreeBranchProps {
  jsonEngine: JsonMateSettings['jsonEngine'];
  onPreviewImage: (src: string) => void;
  onOpenDetachedValue: (jsonText: string, sourcePathLabel: string) => void;
  openLinkTitle: string;
  openDetachedValueTitle: string;
  parentKind: 'array' | 'object';
  showArrayIndexes: boolean;
  showArrayLength: boolean;
  showFullText: boolean;
  showImages: boolean;
  showTypeIcons: boolean;
  showLinks: boolean;
  showValues: boolean;
}

const jmTreeIconMap: Record<string, string> = {
  array: 'type-array.svg',
  object: 'type-object.svg',
  string: 'type-string.svg',
  number: 'type-number.svg',
  boolean: 'type-boolean.svg',
  null: 'type-null.svg'
};

const getViewerTreeIconSrc = (kind: string) => `./icons/tree/${jmTreeIconMap[kind] || jmTreeIconMap.object}`;

const getInitialVisibleChildCount = (pathDepth: number, totalChildren: number) => (
  Math.min(
    totalChildren,
    pathDepth === 0 ? progressiveTreeRootBatchSize : progressiveTreeBranchBatchSize
  )
);

const getProgressiveChildChunkSize = (pathDepth: number) => (
  pathDepth === 0 ? progressiveTreeRootChunkSize : progressiveTreeBranchChunkSize
);

const isTreeToggleHitTarget = (target: EventTarget | null) => (
  target instanceof Element && Boolean(target.closest('.treeToggleHitbox'))
);

interface ViewerInlineValueProps {
  fieldKey?: string | number | null;
  jsonEngine: JsonMateSettings['jsonEngine'];
  onPreviewImage: (src: string) => void;
  onOpenDetachedValue: (jsonText: string, sourcePathLabel: string) => void;
  openLinkTitle: string;
  openDetachedValueTitle: string;
  sourcePathLabel: string;
  showFullText: boolean;
  showImages: boolean;
  showLinks: boolean;
  valueInfo: ViewerNodeDisplayData;
  value: unknown;
}

const getViewerInlineDisplayValue = (value: unknown, showFullText: boolean) => {
  if (!showFullText) {
    return getValuePreview(value);
  }

  if (typeof value === 'string') {
    return value || '""';
  }

  return String(value);
};

const ViewerInlineValue = ({
  onPreviewImage,
  onOpenDetachedValue,
  openLinkTitle,
  openDetachedValueTitle,
  sourcePathLabel,
  showFullText,
  showImages,
  showLinks,
  valueInfo,
  value
}: ViewerInlineValueProps) => {
  const previewImageSrc = showImages ? valueInfo.valueCapabilities.previewImageSrc : null;
  const externalUrlHref = showLinks ? valueInfo.valueCapabilities.externalUrlHref : null;
  const canOpenDetachedValue = valueInfo.valueCapabilities.canOpenDetachedValue;
  const [previewMeta, setPreviewMeta] = useState('Loading image...');
  const [previewState, setPreviewState] = useState<'idle' | 'ready' | 'error'>('idle');
  const displayValue = getViewerInlineDisplayValue(value, showFullText);

  if (!previewImageSrc) {
    return (
      <span className={`value${showFullText ? ' value--full' : ''}`}>
        <span className="value-text">{displayValue}</span>
        {showLinks && externalUrlHref ? (
          <a
            className="value-inline-link"
            href={externalUrlHref}
            onClick={(event) => event.stopPropagation()}
            rel="noreferrer"
            target="_blank"
            title={openLinkTitle}
          >
            <LinkIcon />
          </a>
        ) : null}
        {canOpenDetachedValue ? (
          <button
            className="value-inline-action"
            onClick={(event) => {
              event.stopPropagation();
              onOpenDetachedValue(String(value), sourcePathLabel);
            }}
            title={openDetachedValueTitle}
            type="button"
          >
            <DetachedValueIcon />
          </button>
        ) : null}
      </span>
    );
  }

  return (
    <span className={`value has-img${showFullText ? ' value--full' : ''}`}>
      <span className="value-text">{displayValue}</span>
      <span className={`image-preview-shell${previewState === 'ready' ? ' is-ready' : ''}${previewState === 'error' ? ' is-error' : ''}`}>
        <img
          alt=""
          className="value-preview-image"
          onClick={() => onPreviewImage(previewImageSrc)}
          onError={() => {
            setPreviewState('error');
            setPreviewMeta('Image unavailable');
          }}
          onLoad={(event) => {
            const { naturalHeight, naturalWidth } = event.currentTarget;
            if (naturalWidth && naturalHeight) {
              setPreviewState('ready');
              setPreviewMeta(`${naturalWidth} × ${naturalHeight}`);
              return;
            }

            setPreviewState('error');
            setPreviewMeta('Image unavailable');
          }}
          src={previewImageSrc}
        />
        <span className="image-preview-meta">
          <svg aria-hidden="true" className="image-preview-metaIcon" focusable="false" viewBox="0 0 20 20">
            <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h9A2.5 2.5 0 0 1 17 6.5v7a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 13.5v-7Z" fill="currentColor" fillOpacity=".14" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6 12.4 8.8 9.8l2 2 2.2-2.2L15 12.6" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
            <circle cx="7.2" cy="7.2" fill="currentColor" r="1.1" />
          </svg>
          <span>{previewMeta}</span>
        </span>
      </span>
    </span>
  );
};

const ViewerTreeBranch = ({
  isSelected,
  jsonEngine,
  onPreviewImage,
  onOpenDetachedValue,
  openLinkTitle,
  openDetachedValueTitle,
  onSelect,
  onToggle,
  parentKind,
  parentPath,
  shouldSortObjectKeys,
  showArrayIndexes,
  showArrayLength,
  showFullText,
  showImages,
  showTypeIcons,
  showLinks,
  showValues,
  value,
  expandedPaths
}: ViewerTreeBranchProps) => {
  const totalChildren = getStructuredChildCount(value);
  const initialVisibleChildCount = getInitialVisibleChildCount(parentPath.length, totalChildren);
  const [visibleChildCount, setVisibleChildCount] = useState(initialVisibleChildCount);
  const children = listNodeChildrenRange(value, shouldSortObjectKeys, 0, visibleChildCount);

  useEffect(() => {
    setVisibleChildCount(initialVisibleChildCount);
  }, [initialVisibleChildCount, totalChildren, value]);

  useEffect(() => {
    if (visibleChildCount >= totalChildren) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setVisibleChildCount((current) => Math.min(
        totalChildren,
        current + getProgressiveChildChunkSize(parentPath.length)
      ));
    }, progressiveTreeChunkDelayMs);

    return () => window.clearTimeout(timerId);
  }, [parentPath.length, totalChildren, visibleChildCount]);

  return (
    <ul className="treeList">
      {children.map((child) => {
        const childPath = [...parentPath, ...child.path];
        const childPathKey = getViewerPathKey(childPath);
        const childValueInfo = getViewerNodeDisplayData(child.value, child.key);
        const childKind = childValueInfo.kind;
        const childStructured = childValueInfo.structured;
        const childExpanded = childStructured ? expandedPaths[childPathKey] !== false : false;
        const childCount = childStructured ? childValueInfo.childCount : -1;
        const childClassName = [
          'treeBranch',
          childStructured ? `folder ${childKind}` : `node ${childKind}`,
          childExpanded ? 'open' : '',
          isSelected(childPath) ? 'cur' : ''
        ].filter(Boolean).join(' ');
        const keyClassName = parentKind === 'array' ? 'treeKey array-key' : 'treeKey object-key';
        const displayKey = parentKind === 'array' && !showArrayIndexes ? '' : String(child.key);
        const childExternalHref = showLinks ? childValueInfo.valueCapabilities.externalUrlHref : null;
        const showSeparateExternalAction = Boolean(childExternalHref) && (childStructured || !showValues);
        const showSeparateDetachedAction = childValueInfo.valueCapabilities.canOpenDetachedValue && !showValues;
        const childSourcePathLabel = formatViewerInspectorPath(childPath);

        return (
          <li className={childClassName} key={childPathKey}>
            <div
              className="row"
              onClick={(event) => {
                if (isTreeToggleHitTarget(event.target)) {
                  return;
                }
                onSelect(childPath);
              }}
            >
              {showTypeIcons ? <img alt="" className="ico" src={getViewerTreeIconSrc(childKind)} /> : null}
              <div className="treeRow">
                <span className="treeLabel">
                  <button
                    className="treeSelectButton"
                    onClick={(event) => {
                      event.stopPropagation();
                      onSelect(childPath);
                    }}
                    type="button"
                  >
                    <span className={keyClassName}>{displayKey || '\u00A0'}</span>
                    {childStructured || !showValues ? null : (
                      <ViewerInlineValue
                        fieldKey={child.key}
                        jsonEngine={jsonEngine}
                        onPreviewImage={onPreviewImage}
                        onOpenDetachedValue={onOpenDetachedValue}
                        openLinkTitle={openLinkTitle}
                        openDetachedValueTitle={openDetachedValueTitle}
                        sourcePathLabel={childSourcePathLabel}
                        showFullText={showFullText}
                        showImages={showImages}
                        showLinks={showLinks}
                        valueInfo={childValueInfo}
                        value={child.value}
                      />
                    )}
                  </button>
                </span>
                {showArrayLength && childCount > -1 ? <span className="array-length">{childCount}</span> : null}
                {showSeparateExternalAction ? (
                  <a
                    className="treeValueLink viewerIconButton jmViewerIconAction iconButton iconButton--link"
                    href={childExternalHref!}
                    onClick={(event) => event.stopPropagation()}
                    rel="noreferrer"
                    target="_blank"
                    title={openLinkTitle}
                  >
                    <LinkIcon />
                  </a>
                ) : null}
                {showSeparateDetachedAction ? (
                  <button
                    className="treeValueLink viewerIconButton jmViewerIconAction iconButton iconButton--detached"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenDetachedValue(String(child.value), childSourcePathLabel);
                    }}
                    title={openDetachedValueTitle}
                    type="button"
                  >
                    <DetachedValueIcon />
                  </button>
                ) : null}
              </div>
              {childStructured ? (
                <button
                  className="treeToggleHitbox"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(childPath);
                  }}
                  type="button"
                />
              ) : null}
            </div>
            {childStructured && childExpanded ? (
              <ViewerTreeBranch
                expandedPaths={expandedPaths}
                isSelected={isSelected}
                jsonEngine={jsonEngine}
                onPreviewImage={onPreviewImage}
                onOpenDetachedValue={onOpenDetachedValue}
                openLinkTitle={openLinkTitle}
                openDetachedValueTitle={openDetachedValueTitle}
                onSelect={onSelect}
                onToggle={onToggle}
                parentKind={childKind as 'array' | 'object'}
                parentPath={childPath}
                shouldSortObjectKeys={shouldSortObjectKeys}
                showArrayIndexes={showArrayIndexes}
                showArrayLength={showArrayLength}
                showFullText={showFullText}
                showImages={showImages}
                showTypeIcons={showTypeIcons}
                showLinks={showLinks}
                showValues={showValues}
                value={child.value}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
};

const TreeBranch = ({
  isSelected,
  onSelect,
  onToggle,
  parentPath,
  shouldSortObjectKeys,
  value,
  expandedPaths
}: TreeBranchProps) => {
  const totalChildren = getStructuredChildCount(value);
  const initialVisibleChildCount = getInitialVisibleChildCount(parentPath.length, totalChildren);
  const [visibleChildCount, setVisibleChildCount] = useState(initialVisibleChildCount);
  const children = listNodeChildrenRange(value, shouldSortObjectKeys, 0, visibleChildCount);

  useEffect(() => {
    setVisibleChildCount(initialVisibleChildCount);
  }, [initialVisibleChildCount, totalChildren, value]);

  useEffect(() => {
    if (visibleChildCount >= totalChildren) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setVisibleChildCount((current) => Math.min(
        totalChildren,
        current + getProgressiveChildChunkSize(parentPath.length)
      ));
    }, progressiveTreeChunkDelayMs);

    return () => window.clearTimeout(timerId);
  }, [parentPath.length, totalChildren, visibleChildCount]);

  return (
    <div className="treeBranch">
      {children.map((child) => {
        const childPath = [...parentPath, ...child.path];
        const childPathKey = getViewerPathKey(childPath);
        const childValueInfo = getViewerNodeDisplayData(child.value, child.key);
        const childKind = childValueInfo.kind;
        const childStructured = childValueInfo.structured;
        const childExpanded = childStructured ? expandedPaths[childPathKey] !== false : false;

        return (
          <div className="treeNode" key={childPathKey}>
            <div
              className={`treeRow${isSelected(childPath) ? ' isSelected' : ''}`}
              style={{ paddingLeft: `${16 + parentPath.length * 18}px` }}
            >
              <button
                className={`treeToggle${childStructured ? '' : ' isLeaf'}`}
                onClick={() => childStructured && onToggle(childPath)}
                type="button"
              >
                {childStructured ? (childExpanded ? '▾' : '▸') : '·'}
              </button>
              <button className="treeSelect" onClick={() => onSelect(childPath)} type="button">
                <span className="treeKey">{String(child.key)}</span>
                <span className={`treeKind kind-${childKind}`}>{childKind}</span>
                <span className="treePreview">{childValueInfo.preview}</span>
              </button>
            </div>
            {childStructured && childExpanded ? (
              <TreeBranch
                expandedPaths={expandedPaths}
                isSelected={isSelected}
                onSelect={onSelect}
                onToggle={onToggle}
                parentPath={childPath}
                shouldSortObjectKeys={shouldSortObjectKeys}
                value={child.value}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
};

const sourceLabelMap = {
  pending: 'sourcePending',
  iframe: 'sourceIframe',
  manual: 'sourceManual'
} as const;

const ensureExpandedAncestors = (path: ViewerPath) => {
  const nextExpandedPaths: Record<string, boolean> = {
    [rootPathKey]: true
  };

  for (let index = 0; index < path.length; index += 1) {
    nextExpandedPaths[getViewerPathKey(path.slice(0, index + 1))] = true;
  }

  return nextExpandedPaths;
};

const collectStructuredPaths = (
  value: unknown,
  shouldSortObjectKeys: boolean,
  parentPath: ViewerPath = []
): Record<string, boolean> => {
  const nextExpandedPaths: Record<string, boolean> = {
    [getViewerPathKey(parentPath)]: true
  };

  for (const child of listNodeChildren(value, shouldSortObjectKeys)) {
    if (!isStructuredValue(child.value)) {
      continue;
    }

    const childPath = [...parentPath, ...child.path];
    Object.assign(nextExpandedPaths, collectStructuredPaths(child.value, shouldSortObjectKeys, childPath));
  }

  return nextExpandedPaths;
};

const collectCollapsedStructuredPaths = (
  value: unknown,
  shouldSortObjectKeys: boolean,
  parentPath: ViewerPath = []
): Record<string, boolean> => {
  const parentKey = getViewerPathKey(parentPath);
  const nextExpandedPaths: Record<string, boolean> = {
    [parentKey]: parentPath.length === 0
  };

  for (const child of listNodeChildren(value, shouldSortObjectKeys)) {
    if (!isStructuredValue(child.value)) {
      continue;
    }

    const childPath = [...parentPath, ...child.path];
    Object.assign(nextExpandedPaths, collectCollapsedStructuredPaths(child.value, shouldSortObjectKeys, childPath));
  }

  return nextExpandedPaths;
};

const readViewerSearchHistory = (): ViewerSearchHistoryEntry[] => {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(modernSearchHistoryStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((entry): ViewerSearchHistoryEntry[] => {
      if (typeof entry === 'string') {
        return [{ query: entry, mode: 'key' as const }];
      }

      if (!entry || typeof entry !== 'object' || typeof entry.query !== 'string') {
        return [];
      }

      return [{
        query: entry.query,
        mode: entry.mode === 'value' ? 'value' as const : 'key' as const
      }];
    }).slice(0, 12);
  } catch {
    return [];
  }
};

const writeViewerSearchHistory = (entries: ViewerSearchHistoryEntry[]) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(modernSearchHistoryStorageKey, JSON.stringify(entries));
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

const readViewerSearchMode = (): ViewerPathSearchMode => {
  if (typeof window === 'undefined') {
    return 'key';
  }

  try {
    return window.localStorage.getItem(modernSearchModeStorageKey) === 'value' ? 'value' : 'key';
  } catch {
    return 'key';
  }
};

const writeViewerSearchMode = (mode: ViewerPathSearchMode) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(modernSearchModeStorageKey, mode);
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

const readViewerMinimalMode = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return window.localStorage.getItem(modernViewerMinimalModeStorageKey) === 'true';
  } catch {
    return false;
  }
};

const writeViewerMinimalMode = (enabled: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(modernViewerMinimalModeStorageKey, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage failures in constrained browser contexts.
  }
};

const formatViewerInspectorPath = (path: ViewerPath) => (
  path.length === 0 ? '' : formatViewerEditablePath(path)
);

const serializeViewerNodeValue = (
  value: unknown,
  jsonEngine: JsonMateSettings['jsonEngine']
) => {
  if (typeof value === 'string') {
    return value;
  }

  return formatViewerEditorValue(value, jsonEngine, true);
};

const isStructuredKind = (kind: string) => kind === 'array' || kind === 'object';

const looksLikeUrlText = (value: unknown) => /^(https?:\/\/|data:image\/)/i.test(String(value ?? '').trim());

const canSingleLine = (kind: string, value: unknown) => (
  isStructuredKind(kind) || (kind === 'string' && /\r|\n/.test(String(value ?? '')))
);

const looksLikeIsoDateString = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(normalized)) {
    return false;
  }

  return !Number.isNaN(Date.parse(normalized));
};

const looksLikeTimestamp = (value: unknown, kind: string) => {
  let numericValue: number | null = null;
  if (kind === 'number' && Number.isFinite(value)) {
    numericValue = Number(value);
  } else if (kind === 'string' && /^\d{10,13}$/.test(String(value ?? '').trim())) {
    numericValue = Number(String(value ?? '').trim());
  }

  if (numericValue === null) {
    return false;
  }

  const epochMs = Math.abs(numericValue) < 1e12 ? numericValue * 1000 : numericValue;
  const dateValue = new Date(epochMs);
  const year = dateValue.getFullYear();
  return !Number.isNaN(dateValue.getTime()) && year >= 2000 && year <= 2100;
};

const formatTimestampValue = (value: unknown, kind: string) => {
  const numericValue = kind === 'number'
    ? Number(value)
    : Number(String(value ?? '').trim());
  const epochMs = Math.abs(numericValue) < 1e12 ? numericValue * 1000 : numericValue;
  const dateValue = new Date(epochMs);
  const offsetMinutes = -dateValue.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offsetAbs = Math.abs(offsetMinutes);
  const hours = String(Math.floor(offsetAbs / 60)).padStart(2, '0');
  const minutes = String(offsetAbs % 60).padStart(2, '0');
  const isoValue = new Date(epochMs - (dateValue.getTimezoneOffset() * 60000)).toISOString().slice(0, 19);
  return `${isoValue}${sign}${hours}:${minutes}`;
};

const formatIsoAsTimestamp = (value: string) => {
  const epochMs = Date.parse(String(value ?? '').trim());
  if (Number.isNaN(epochMs)) {
    throw new Error('invalid date');
  }

  return String(epochMs);
};

const looksLikeBooleanValue = (value: unknown, kind: string) => {
  if (kind === 'boolean') {
    return true;
  }

  if (kind === 'string') {
    const normalized = String(value ?? '').trim().toLowerCase();
    return normalized === 'true' || normalized === 'false';
  }

  return false;
};

const toggleBooleanText = (value: string) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'true') {
    return 'false';
  }
  if (normalized === 'false') {
    return 'true';
  }
  throw new Error('invalid boolean');
};

const isRealSourceUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const getViewerSourceType = (isLauncherMode: boolean): ViewerSourceType => (
  isLauncherMode ? 'launcher-url' : 'recognized-page'
);

const groupViewerCollections = (entries: ViewerCollectionEntry[]) => {
  const grouped = new Map<string, ViewerCollectionEntry[]>();

  for (const entry of entries) {
    const key = entry.collection.trim() || defaultViewerCollectionName;
    const bucket = grouped.get(key) || [];
    bucket.push(entry);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()].sort((left, right) => left[0].localeCompare(right[0]));
};

export function App() {
  const workspaceBrand = 'JSON Mate';
  const [settings, setSettings] = useState<JsonMateSettings | null>(null);
  const [inputText, setInputText] = useState('');
  const [errorText, setErrorText] = useState('');
  const [viewerState, setViewerState] = useState<ViewerPayloadState | null>(null);
  const [isEditorSingleLine, setIsEditorSingleLine] = useState(false);
  const [isIframeMode, setIsIframeMode] = useState(initialIframeMode);
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(true);
  const [hasSelection, setHasSelection] = useState(false);
  const [selectedPath, setSelectedPath] = useState<ViewerPath>([]);
  const [keyInputValue, setKeyInputValue] = useState('');
  const [pathInputValue, setPathInputValue] = useState('');
  const [editorText, setEditorText] = useState('');
  const [launcherUrlInput, setLauncherUrlInput] = useState('https://ipinfo.io/json');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isToolkitOpen, setIsToolkitOpen] = useState(false);
  const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);
  const [isMinimalTreeMode, setIsMinimalTreeMode] = useState(() => readViewerMinimalMode());
  const [toolFilterMode, setToolFilterMode] = useState<ViewerToolFilterMode>('auto');
  const [pathSearchMode, setPathSearchMode] = useState<ViewerPathSearchMode>(() => readViewerSearchMode());
  const [pathSearchQuery, setPathSearchQuery] = useState('');
  const [pathSearchHistory, setPathSearchHistory] = useState<ViewerSearchHistoryEntry[]>([]);
  const [viewerLibrary, setViewerLibrary] = useState<ViewerLibrarySnapshot>({ recents: [], collections: [] });
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [collectionDialogTitle, setCollectionDialogTitle] = useState('');
  const [collectionDialogCollection, setCollectionDialogCollection] = useState(defaultViewerCollectionName);
  const [collectionDialogNewCollection, setCollectionDialogNewCollection] = useState('');
  const [collectionDialogError, setCollectionDialogError] = useState('');
  const [collectionDialogSaving, setCollectionDialogSaving] = useState(false);
  const [collectionDialogEntryId, setCollectionDialogEntryId] = useState<string | null>(null);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [historyBackEntry, setHistoryBackEntry] = useState<ViewerHistoryEntry | null>(null);
  const [historyForwardEntry, setHistoryForwardEntry] = useState<ViewerHistoryEntry | null>(null);
  const [showUndoConfirm, setShowUndoConfirm] = useState(false);
  const [editorConflict, setEditorConflict] = useState<EditorConflictState | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({
    [rootPathKey]: true
  });
  const [statusText, setStatusText] = useState('');
  const searchButtonRef = useRef<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const sourceInputRef = useRef<HTMLTextAreaElement | null>(null);
  const searchReturnFocusRef = useRef<HTMLElement | null>(null);
  const hasInitializedSearchFocusRef = useRef(false);
  const settingsRef = useRef<JsonMateSettings | null>(null);
  const viewerStateRef = useRef<ViewerPayloadState | null>(null);
  const viewerLibraryRef = useRef<ViewerLibrarySnapshot>({ recents: [], collections: [] });
  const inputTextRef = useRef('');
  const pendingEmbeddedMessageRef = useRef<EmbeddedViewerMessage | null>(null);
  const recordedRecentSourceRef = useRef<string>('');
  const recordedCollectionSourceRef = useRef<string>('');
  const collectionNewInputRef = useRef<HTMLInputElement | null>(null);

  const lang = settings?.lang || 'en';
  const messages = getViewerMessages(lang);
  const currentValue = viewerState && hasSelection ? getValueAtPath(viewerState.payload.data, selectedPath) : undefined;
  const currentValueInfo = hasSelection && viewerState
    ? getViewerNodeDisplayData(currentValue, selectedPath[selectedPath.length - 1] ?? null)
    : null;
  const rootValueInfo = viewerState ? getViewerNodeDisplayData(viewerState.payload.data) : null;
  const viewerJsonEngine = settings?.jsonEngine || 'JM-JSON';
  const currentDetachedValueCandidate = hasSelection
    ? currentValueInfo?.valueCapabilities.canOpenDetachedValue ?? false
    : false;
  const detachedSourcePathLabel = decodeDetachedViewerSourcePath();
  const detachedSourceUrl = decodeDetachedViewerSourceUrl();
  const isLauncherMode = queryParams.get(launcherViewerQueryKey) === '1';
  const currentSourceUrl = detachedSourceUrl || (isIframeMode ? document.referrer : '');
  const canRenameKey = viewerState && hasSelection ? canRenameKeyAtPath(viewerState.payload.data, selectedPath) : false;
  const currentKeyValue = selectedPath.length > 0 ? String(selectedPath[selectedPath.length - 1]!) : '';
  const isKeyDirty = canRenameKey && keyInputValue.trim() !== currentKeyValue;
  const shouldSortObjectKeys = Boolean(settings?.sortKey);
  const showTreeValues = isMinimalTreeMode || settings?.showTreeValues !== false;
  const showTreeLinks = !isMinimalTreeMode && settings?.showLinkButtons !== false;
  const showTypeIcons = !isMinimalTreeMode && Boolean(settings?.showTypeIcons);
  const showArrayLength = !isMinimalTreeMode && Boolean(settings?.showArrayLength);
  const showArrayIndexes = !isMinimalTreeMode && Boolean(settings?.showArrayIndexes);
  const showTreeImages = !isMinimalTreeMode && Boolean(settings?.showImages);
  const showFolderIcons = !isMinimalTreeMode && settings?.treeIconStyle === 'folder';
  const deferredPathSearchQuery = useDeferredValue(pathSearchQuery);
  const [debouncedPathSearchQuery, setDebouncedPathSearchQuery] = useState('');
  const canShowRedoButton = Boolean(historyForwardEntry);
  const pathSearchMatches = viewerState
    ? searchViewerPaths(viewerState.payload.data, debouncedPathSearchQuery, shouldSortObjectKeys, pathSearchMode)
    : [];
  const searchPlaceholder = pathSearchMode === 'value'
    ? messages.valueSearchPlaceholder
    : messages.pathSearchPlaceholder;
  const launcherFixtures = [
    {
      id: 'ipinfo',
      label: messages.launcherFixtureIpInfo,
      url: 'https://ipinfo.io/json'
    },
    {
      id: 'httpbin',
      label: messages.launcherFixtureHttpBin,
      url: 'https://httpbin.org/json'
    },
    {
      id: 'todo',
      label: messages.launcherFixtureTodo,
      url: 'https://jsonplaceholder.typicode.com/todos/1'
    },
    {
      id: 'randomuser',
      label: messages.launcherFixtureRandomUser,
      url: 'https://randomuser.me/api/?results=20'
    },
    {
      id: 'dogapi',
      label: messages.launcherFixtureDogCeo,
      url: 'https://dog.ceo/api/breeds/image/random/20'
    }
  ];
  const launcherInlineSamples = [
    {
      id: 'api',
      label: messages.launcherSampleApi,
      payload: JSON.stringify({
        requestId: 'req_demo_20260328',
        status: 'ok',
        region: 'us-east-1',
        durationMs: 182,
        features: {
          search: true,
          export: true,
          betaFlags: ['structured-edit', 'detached-viewer']
        },
        data: {
          users: 128,
          active: 119,
          errors: 0
        }
      }, null, 2)
    },
    {
      id: 'ops',
      label: messages.launcherSampleOps,
      payload: JSON.stringify({
        service: 'edge-gateway',
        health: 'degraded',
        incidents: [
          { id: 'inc-1042', severity: 'high', summary: 'Elevated latency in ap-southeast-1' },
          { id: 'inc-1043', severity: 'low', summary: 'Retry burst on analytics sink' }
        ],
        metrics: {
          p50: 83,
          p95: 241,
          p99: 610
        },
        rollout: {
          current: '2026.03.28.2',
          canary: 15,
          paused: false
        }
      }, null, 2)
    },
    {
      id: 'catalog',
      label: messages.launcherSampleCatalog,
      payload: JSON.stringify({
        team: 'platform-runtime',
        services: [
          { name: 'viewer-api', owner: 'runtime', sla: '99.95%' },
          { name: 'event-pipeline', owner: 'data', sla: '99.90%' },
          { name: 'asset-proxy', owner: 'edge', sla: '99.99%' }
        ],
        environments: {
          production: ['us', 'eu', 'apac'],
          staging: ['us']
        }
      }, null, 2)
    }
  ];

  const applyViewerState = useEffectEvent((
    nextState: ViewerPayloadState | null,
    nextInputText?: string
  ) => {
    viewerStateRef.current = nextState;
    setViewerState(nextState);
    setErrorText('');
    setIsSearchOpen(false);
    setPathSearchQuery('');
    setActiveSearchIndex(0);
    setHistoryBackEntry(null);
    setHistoryForwardEntry(null);
    setShowUndoConfirm(false);
    setExpandedPaths({
      [rootPathKey]: true
    });
    if (nextState) {
      setHasSelection(true);
      setSelectedPath([]);
      setKeyInputValue('');
      setPathInputValue(formatViewerInspectorPath([]));
      setIsEditorSingleLine(false);
      setEditorText(nextState.prettyText ?? nextState.payload.string);
    } else {
      setHasSelection(false);
      setSelectedPath([]);
      setKeyInputValue('');
      setPathInputValue('');
      setIsEditorSingleLine(false);
      setEditorText('');
    }
    if (typeof nextInputText === 'string') {
      inputTextRef.current = nextInputText;
      setInputText(nextInputText);
    }
  });

  const parseCurrentInput = useEffectEvent((source: 'manual' | 'pending' | 'iframe', nextText?: string) => {
    if (!settings) {
      return;
    }

    const candidate = typeof nextText === 'string' ? nextText : inputText;
    const parsed = parseViewerInput(candidate, settings.jsonEngine, source);

    if (!parsed) {
      setViewerState(null);
      setErrorText(messages.statusError);
      return;
    }

    applyViewerState(parsed, candidate);
    setStatusText(messages.statusReady);
  });

  const loadPendingPayload = useEffectEvent(async () => {
    if (!settings) {
      return;
    }

    try {
      const pendingValue = await browser.runtime.sendMessage({ cmd: 'getPendingJson' } as const);
      if (typeof pendingValue === 'string' && pendingValue) {
        parseCurrentInput('pending', pendingValue);
      }
    } catch {
      // Ignore when the page is opened outside the extension runtime.
    }
  });

  const bootViewer = useEffectEvent(async () => {
    const loadedSettings = await loadSettings();
    setSettings(loadedSettings);
    setPathSearchHistory(readViewerSearchHistory());
    setPathSearchMode(readViewerSearchMode());
    document.documentElement.lang = loadedSettings.lang;

    const iframeMode = queryParams.get('type') === 'iframe' || queryParams.get('embedded') === '1';
    setIsIframeMode(iframeMode);
    setIsWorkspaceOpen(true);

    try {
      let hasLoadedPendingPayload = false;
      const detachedQueryText = decodeDetachedViewerQueryText();
      if (detachedQueryText) {
        const parsedDetachedQuery = parseViewerInput(detachedQueryText, loadedSettings.jsonEngine, 'pending');
        if (parsedDetachedQuery) {
          applyViewerState(parsedDetachedQuery, parsedDetachedQuery.payload.string);
          setStatusText(messages.statusReady);
          hasLoadedPendingPayload = true;
        }
      }

      const detachedHashPayload = decodeDetachedViewerPayloadHash();
      if (!hasLoadedPendingPayload && detachedHashPayload) {
        const resolvedDetachedPayload = resolveDetachedHashViewerState(detachedHashPayload, loadedSettings.jsonEngine);
        if (resolvedDetachedPayload) {
          applyViewerState(resolvedDetachedPayload, resolvedDetachedPayload.payload.string);
          setStatusText(messages.statusReady);
          hasLoadedPendingPayload = true;
          window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
        }
      }

      const pendingValue = await browser.runtime.sendMessage(
        { cmd: iframeMode && !isLauncherMode ? 'peekPendingJson' : 'getPendingJson' } as const
      );
      if (!hasLoadedPendingPayload && typeof pendingValue === 'string' && pendingValue) {
        const parsed = parseViewerInput(pendingValue, loadedSettings.jsonEngine, 'pending');
        if (parsed) {
          applyViewerState(parsed, pendingValue);
          setStatusText(messages.statusReady);
          hasLoadedPendingPayload = true;
        }
      }

      if (!hasLoadedPendingPayload && isLauncherMode) {
        const pendingInputValue = await browser.runtime.sendMessage({ cmd: 'getPendingInput' } as const);
        if (typeof pendingInputValue === 'string' && pendingInputValue) {
          inputTextRef.current = pendingInputValue;
          setInputText(pendingInputValue);
        }
      }

      if (!iframeMode && !hasLoadedPendingPayload) {
        const consumedPendingValue = await browser.runtime.sendMessage({ cmd: 'getPendingJson' } as const);
        if (typeof consumedPendingValue === 'string' && consumedPendingValue) {
          const parsed = parseViewerInput(consumedPendingValue, loadedSettings.jsonEngine, 'pending');
          if (parsed) {
            applyViewerState(parsed, consumedPendingValue);
            setStatusText(messages.statusReady);
          }
        }
      }
    } catch {
      // Ignore when the runtime bridge is unavailable.
    }

    if (iframeMode && window.parent !== window) {
      window.parent.postMessage({ cmd: 'viewerLoadedOk' }, '*');
    } else if (queryParams.get('detached') === '1' && window.opener && window.opener !== window) {
      window.opener.postMessage({ cmd: 'detachedViewerReady' }, '*');
    }
  });

  const syncLoadedSettings = useEffectEvent(async () => {
    const loadedSettings = await loadSettings();
    setSettings(loadedSettings);
    document.documentElement.lang = loadedSettings.lang;
  });

  const selectPath = useEffectEvent((path: ViewerPath) => {
    setHasSelection(true);
    setSelectedPath(path);
    setKeyInputValue(path.length > 0 ? String(path[path.length - 1]!) : '');
    setPathInputValue(formatViewerInspectorPath(path));
    setExpandedPaths((current) => ({
      ...current,
      ...ensureExpandedAncestors(path)
    }));
  });

  const expandAllPaths = useEffectEvent(() => {
    if (!viewerState) {
      return;
    }

    setExpandedPaths(collectStructuredPaths(viewerState.payload.data, shouldSortObjectKeys));
  });

  const collapseAllPaths = useEffectEvent(() => {
    if (!viewerState) {
      return;
    }

    setExpandedPaths(collectCollapsedStructuredPaths(viewerState.payload.data, shouldSortObjectKeys));
  });

  const expandSelectedPath = useEffectEvent(() => {
    if (!viewerState) {
      return;
    }

    const nextValue = getValueAtPath(viewerState.payload.data, selectedPath);
    if (!isStructuredValue(nextValue)) {
      return;
    }

    setExpandedPaths((current) => ({
      ...current,
      ...collectStructuredPaths(nextValue, shouldSortObjectKeys, selectedPath)
    }));
  });

  const collapseSelectedPath = useEffectEvent(() => {
    if (selectedPath.length === 0) {
      collapseAllPaths();
      return;
    }

    setExpandedPaths((current) => ({
      ...current,
      [getViewerPathKey(selectedPath)]: false
    }));
  });

  const togglePath = useEffectEvent((path: ViewerPath) => {
    const pathKey = getViewerPathKey(path);
    setExpandedPaths((current) => ({
      ...current,
      [pathKey]: current[pathKey] === false
    }));
  });

  const copyText = useEffectEvent(async (value: string, nextStatus: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setStatusText(nextStatus);
    } catch {
      setErrorText(messages.copyError);
    }
  });

  const persistSettings = useEffectEvent(async (patch: Partial<JsonMateSettings>) => {
    const normalizedPatch = await saveSettings(patch);
    setSettings((current) => current ? { ...current, ...normalizedPatch } : current);
  });

  const applyResolvedViewerEdit = useEffectEvent((
    nextValue: unknown,
    source: 'manual' | 'tool'
  ) => {
    if (!settings || !viewerState || !hasSelection) {
      return;
    }

    setHistoryBackEntry({
      data: viewerState.payload.data,
      path: selectedPath,
      source
    });
    setHistoryForwardEntry(null);
    setShowUndoConfirm(false);

    let nextData = setValueAtPath(viewerState.payload.data, selectedPath, nextValue);
    let nextPath = selectedPath;

    if (isKeyDirty) {
      const normalizedNextKey = keyInputValue.trim();
      nextData = renameKeyAtPath(nextData, selectedPath, normalizedNextKey);
      nextPath = [...selectedPath.slice(0, -1), normalizedNextKey];
    }

    const nextStateSource: ViewerPayloadSource = source === 'tool' ? 'manual' : source;
    const nextState = createViewerStateFromData(nextData, settings.jsonEngine, nextStateSource);
    const refreshedValue = getValueAtPath(nextState.payload.data, nextPath);

    setViewerState(nextState);
    setInputText(nextState.payload.string);
    setEditorConflict(null);
    setErrorText('');
    setStatusText(messages.editApplied);
    setHasSelection(true);
    setSelectedPath(nextPath);
    setKeyInputValue(nextPath.length > 0 ? String(nextPath[nextPath.length - 1]!) : '');
    setPathInputValue(formatViewerInspectorPath(nextPath));
    setEditorText(formatViewerEditorValue(refreshedValue, settings.jsonEngine));
    setExpandedPaths((current) => ({
      ...current,
      ...ensureExpandedAncestors(nextPath)
    }));
  });

  const applyToolkitReturnValue = useEffectEvent((nextValue: string) => {
    if (settings && viewerState && hasSelection) {
      commitViewerEdit(nextValue, 'tool');
      return;
    }

    applyViewerState(null, nextValue);
    setErrorText('');
    setStatusText(messages.statusReady);
  });

  const commitViewerEdit = useEffectEvent((nextEditorText: string, source: 'manual' | 'tool' = 'manual') => {
    if (!settings || !viewerState || !hasSelection) {
      return;
    }

    try {
      const nextValue = parseViewerEditorValue(nextEditorText, currentValue, settings.jsonEngine);
      applyResolvedViewerEdit(nextValue, source);
    } catch (error) {
      const reason = error instanceof Error ? error.message : messages.statusError;
      setEditorConflict(typeof currentValue === 'string' ? null : {
        attemptedText: nextEditorText,
        reason
      });
      setErrorText(reason);
      setStatusText('');
    }
  });

  const ignoreEditorConflict = useEffectEvent(() => {
    setEditorConflict(null);
    setErrorText('');
    setStatusText(messages.editIgnored);
  });

  const applyEditorConflictAsString = useEffectEvent(() => {
    if (!editorConflict) {
      return;
    }

    applyResolvedViewerEdit(editorConflict.attemptedText, 'manual');
    setStatusText(messages.editAppliedAsString);
  });

  const restoreHistoryEntry = useEffectEvent((entry: ViewerHistoryEntry, direction: 'back' | 'forward') => {
    if (!settings || !viewerState) {
      return;
    }

    const currentSnapshot: ViewerHistoryEntry = {
      data: viewerState.payload.data,
      path: hasSelection ? selectedPath : [],
      source: 'manual'
    };
    const nextState = createViewerStateFromData(entry.data, settings.jsonEngine, 'manual');
    const canRestorePath = entry.path.length === 0 || getValueAtPath(nextState.payload.data, entry.path) !== undefined;
    const nextPath = canRestorePath ? entry.path : [];
    const restoredValue = getValueAtPath(nextState.payload.data, nextPath);

    if (direction === 'back') {
      setHistoryForwardEntry(currentSnapshot);
      setHistoryBackEntry(null);
    } else {
      setHistoryBackEntry(currentSnapshot);
      setHistoryForwardEntry(null);
    }

    setViewerState(nextState);
    setInputText(nextState.payload.string);
    setEditorConflict(null);
    setErrorText('');
    setStatusText(direction === 'back' ? messages.undoApplied : messages.redoApplied);
    setHasSelection(true);
    setSelectedPath(nextPath);
    setKeyInputValue(nextPath.length > 0 ? String(nextPath[nextPath.length - 1]!) : '');
    setPathInputValue(formatViewerInspectorPath(nextPath));
    setEditorText(formatViewerEditorValue(restoredValue, settings.jsonEngine));
    setExpandedPaths((current) => ({
      ...current,
      ...ensureExpandedAncestors(nextPath)
    }));
    setShowUndoConfirm(false);
  });

  const requestUndo = useEffectEvent(() => {
    if (!historyBackEntry) {
      return;
    }

    if (historyBackEntry.source === 'manual') {
      setShowUndoConfirm(true);
      return;
    }

    restoreHistoryEntry(historyBackEntry, 'back');
  });

  const confirmUndo = useEffectEvent(() => {
    if (!historyBackEntry) {
      return;
    }
    restoreHistoryEntry(historyBackEntry, 'back');
  });

  const redoEdit = useEffectEvent(() => {
    if (!historyForwardEntry) {
      return;
    }
    restoreHistoryEntry(historyForwardEntry, 'forward');
  });

  const applyUrlDecode = useEffectEvent(() => {
    try {
      commitViewerEdit(decodeURIComponent(editorText), 'tool');
    } catch {
      setErrorText(messages.statusError);
    }
  });

  const applyUrlEncode = useEffectEvent(() => {
    commitViewerEdit(encodeURIComponent(editorText), 'tool');
  });

  const applySingleLine = useEffectEvent(() => {
    if (!settings) {
      return;
    }

    try {
      const nextValue = parseViewerEditorValue(editorText, currentValue, settings.jsonEngine);
      if (isStructuredValue(nextValue)) {
        setIsEditorSingleLine(true);
        setEditorText(formatViewerEditorValue(nextValue, settings.jsonEngine, true));
        setErrorText('');
        setStatusText(messages.statusReady);
        return;
      }

      const flattenedText = String(nextValue ?? '').replace(/\s+/g, ' ').trim();
      setIsEditorSingleLine(true);
      commitViewerEdit(JSON.stringify(flattenedText), 'tool');
    } catch {
      setIsEditorSingleLine(true);
      setEditorText(editorText.replace(/\s+/g, ' ').trim());
      setErrorText('');
      setStatusText(messages.statusReady);
    }
  });

  const applyTimestampTransform = useEffectEvent(() => {
    if (timestampAvailable) {
      commitViewerEdit(JSON.stringify(formatTimestampValue(inspectorTextValue || currentValue, selectedKind)), 'tool');
      return;
    }

    if (isoDateAvailable) {
      commitViewerEdit(formatIsoAsTimestamp(editorText), 'tool');
      return;
    }

    setErrorText(messages.statusError);
  });

  const applyToggleBoolean = useEffectEvent(() => {
    if (!booleanAvailable || !settings) {
      setErrorText(messages.statusError);
      return;
    }

    if (typeof currentValue === 'boolean') {
      commitViewerEdit(formatViewerEditorValue(!currentValue, settings.jsonEngine), 'tool');
      return;
    }

    try {
      commitViewerEdit(toggleBooleanText(editorText), 'tool');
    } catch {
      setErrorText(messages.statusError);
    }
  });

  const jumpToPathInput = useEffectEvent(() => {
    if (!viewerState) {
      return;
    }

    const nextPath = parseViewerPath(pathInputValue);
    if (!nextPath) {
      setErrorText(messages.statusError);
      return;
    }

    const nextValue = getValueAtPath(viewerState.payload.data, nextPath);
    if (nextPath.length > 0 && nextValue === undefined) {
      setErrorText(messages.statusError);
      return;
    }

    setErrorText('');
    selectPath(nextPath);
  });

  const saveSearchHistoryEntry = useEffectEvent((query: string, mode: ViewerPathSearchMode) => {
    const normalizedQuery = query.replace(/\s+/g, ' ').trim();
    if (!normalizedQuery) {
      return;
    }

    setPathSearchHistory((current) => {
      const nextEntries = [
        { query: normalizedQuery, mode },
        ...current.filter((entry) => !(entry.query === normalizedQuery && entry.mode === mode))
      ].slice(0, 12);
      writeViewerSearchHistory(nextEntries);
      return nextEntries;
    });
  });

  const closeSearch = () => {
    hasInitializedSearchFocusRef.current = false;
    const returnFocusTarget = searchReturnFocusRef.current;
    if (returnFocusTarget) {
      returnFocusTarget.focus({ preventScroll: true });
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    setIsSearchOpen(false);
  };

  const focusSearchInput = useEffectEvent((shouldSelect = false) => {
    const focusInput = () => {
      searchInputRef.current?.focus({ preventScroll: true });
      if (shouldSelect) {
        searchInputRef.current?.select();
      }
    };

    window.requestAnimationFrame(focusInput);
  });

  const openSearch = () => {
    const activeElement = document.activeElement;
    searchReturnFocusRef.current = activeElement instanceof HTMLElement
      ? activeElement
      : searchButtonRef.current;
    hasInitializedSearchFocusRef.current = false;
    setPathSearchMode(readViewerSearchMode());
    setPathSearchQuery('');
    setActiveSearchIndex(0);
    setIsSearchOpen(true);
  };

  const switchSearchMode = (mode: ViewerPathSearchMode) => {
    setPathSearchMode(mode);
    writeViewerSearchMode(mode);
    focusSearchInput(false);
  };

  const selectSearchMatch = (path: ViewerPath) => {
    selectPath(path);
    saveSearchHistoryEntry(pathSearchQuery, pathSearchMode);
    setIsSearchOpen(false);
  };

  const openToolkitForCurrentValue = useEffectEvent(async () => {
    const candidate = hasSelection && settings
      ? serializeViewerNodeValue(currentValue, settings.jsonEngine)
      : inputText;

    try {
      await browser.runtime.sendMessage({
        cmd: 'setPendingJson',
        data: candidate || null
      } as const);
      if (isIframeMode) {
        setIsToolkitOpen(true);
        return;
      }
      await browser.tabs.create({
        url: browser.runtime.getURL('/transform-toolkit.html'),
        active: true
      });
    } catch {
      window.open('./transform-toolkit.html', '_blank');
    }
  });

  const openCollectionDialog = useEffectEvent(() => {
    if (!viewerState || !currentSourceUrl || !isRealSourceUrl(currentSourceUrl)) {
      return;
    }

    const activeLibrary = viewerLibraryRef.current;
    const detectedTitle = formatViewerSourceTitle(currentSourceUrl, detachedSourcePathLabel);
    const existingEntry = findViewerCollectionEntryByUrl(activeLibrary.collections, currentSourceUrl);

    setCollectionDialogEntryId(existingEntry?.id || null);
    setCollectionDialogTitle(existingEntry?.customTitle || existingEntry?.detectedTitle || detectedTitle);
    setCollectionDialogCollection(existingEntry?.collection || defaultViewerCollectionName);
    setCollectionDialogNewCollection('');
    setCollectionDialogError('');
    setIsCollectionDialogOpen(true);
  });

  const closeCollectionDialog = useEffectEvent(() => {
    setCollectionDialogSaving(false);
    setCollectionDialogError('');
    setIsCollectionDialogOpen(false);
  });

  useEffect(() => {
    if (!isCollectionDialogOpen || collectionDialogCollection !== '__new__') {
      return;
    }

    collectionNewInputRef.current?.focus();
  }, [collectionDialogCollection, isCollectionDialogOpen]);

  const saveCollectionDialog = useEffectEvent(async () => {
    if (!viewerState || !currentSourceUrl || !isRealSourceUrl(currentSourceUrl)) {
      return;
    }

    const activeLibrary = viewerLibraryRef.current.collections.length > 0 || viewerLibraryRef.current.recents.length > 0
      ? viewerLibraryRef.current
      : await loadViewerLibrary();
    viewerLibraryRef.current = activeLibrary;
    setViewerLibrary(activeLibrary);
    const existingEntry = collectionDialogEntryId
      ? activeLibrary.collections.find((entry) => entry.id === collectionDialogEntryId) || findViewerCollectionEntryByUrl(activeLibrary.collections, currentSourceUrl)
      : findViewerCollectionEntryByUrl(activeLibrary.collections, currentSourceUrl);
    const currentCollectionNames = getViewerCollectionNames(activeLibrary.collections);
    const isCreatingNewCollection = collectionDialogCollection === '__new__';
    const nextCollectionName = isCreatingNewCollection
      ? collectionDialogNewCollection.trim()
      : collectionDialogCollection.trim();
    const normalizedCollectionName = nextCollectionName || defaultViewerCollectionName;
    const detectedTitle = formatViewerSourceTitle(currentSourceUrl, detachedSourcePathLabel);
    const customTitle = collectionDialogTitle.trim() || detectedTitle;

    if (isCreatingNewCollection && !collectionDialogNewCollection.trim()) {
      setCollectionDialogError(messages.collectionNameRequired);
      return;
    }

    if (isCreatingNewCollection && !currentCollectionNames.includes(normalizedCollectionName) && currentCollectionNames.length >= getViewerCollectionLimit()) {
      setCollectionDialogError(messages.collectionLimitHint);
      return;
    }

    setCollectionDialogSaving(true);

    try {
      const nextLibrary = await updateViewerLibraryCollection({
        id: existingEntry?.id || collectionDialogEntryId || undefined,
        url: currentSourceUrl,
        detectedTitle,
        customTitle,
        collection: normalizedCollectionName,
        createdAt: existingEntry?.createdAt,
        updatedAt: Date.now(),
        lastOpenedAt: Date.now(),
        sourceType: getViewerSourceType(isLauncherMode)
      });

      const savedEntry = nextLibrary.collections.find((entry) => getViewerNormalizedUrl(entry.url) === getViewerNormalizedUrl(currentSourceUrl)) || null;
      viewerLibraryRef.current = nextLibrary;
      setViewerLibrary(nextLibrary);
      setCollectionDialogEntryId(savedEntry?.id || null);
      if (savedEntry) {
        recordedCollectionSourceRef.current = `${savedEntry.id}:${currentSourceUrl}`;
      }
      setCollectionDialogError('');
      setIsCollectionDialogOpen(false);
      setStatusText(messages.collectionSaved);
    } catch (error) {
      const message = error instanceof Error && error.message === 'collection-limit'
        ? messages.collectionLimitHint
        : error instanceof Error
          ? error.message
          : messages.statusError;
      setCollectionDialogError(message);
    } finally {
      setCollectionDialogSaving(false);
    }
  });

  const openLauncherUrl = useEffectEvent(() => {
    const candidate = launcherUrlInput.trim();
    if (!candidate) {
      return;
    }

    try {
      const resolvedUrl = new URL(
        /^[a-z][a-z0-9+.-]*:/i.test(candidate) ? candidate : `https://${candidate}`
      );
      window.open(resolvedUrl.toString(), '_blank');
    } catch {
      setErrorText(messages.statusError);
    }
  });

  const openLauncherFixtureUrl = useEffectEvent((url: string) => {
    setLauncherUrlInput(url);

    try {
      window.open(url, '_blank');
    } catch {
      setErrorText(messages.statusError);
    }
  });

  const loadLauncherInlineSample = useEffectEvent((payload: string) => {
    inputTextRef.current = payload;
    setInputText(payload);
    parseCurrentInput('manual', payload);
  });

  const openDetachedViewerWithPayload = useEffectEvent(async (
    detachedPayload: NonNullable<EmbeddedViewerMessage['json']> | null,
    fallbackText: string
  ) => {
    const activeSettings = settingsRef.current || settings;
    const candidate = detachedPayload?.string || fallbackText;
    if (!candidate || !candidate.trim()) {
      return;
    }

    try {
      await browser.runtime.sendMessage({
        cmd: 'setPendingJson',
        data: candidate
      } as const);

      const viewerUrl = new URL(browser.runtime.getURL('/viewer.html'));
      viewerUrl.searchParams.set('type', 'iframe');
      viewerUrl.searchParams.set('detached', '1');
      if (detachedPayload && candidate.length <= maxDetachedViewerHashPayloadLength) {
        viewerUrl.hash = encodeDetachedViewerPayloadHash(detachedPayload);
      }
      const popupFeatures = [
        'popup=yes',
        'width=1180',
        'height=760',
        'left=80',
        'top=60'
      ].join(',');
      const detachedViewerWindow = activeSettings?.detachedViewerMode === 'tab'
        ? window.open(viewerUrl.toString(), '_blank')
        : window.open(viewerUrl.toString(), '_blank', popupFeatures);

      if (detachedViewerWindow) {
        const detachedBootstrapTimer = window.setInterval(() => {
          if (detachedViewerWindow.closed) {
            window.clearInterval(detachedBootstrapTimer);
            return;
          }

          try {
            const detachedBodyText = detachedViewerWindow.document.body?.innerText || '';
            if (detachedBodyText.includes(messages.sourcePending) || detachedBodyText.includes(messages.statusReady)) {
              window.clearInterval(detachedBootstrapTimer);
              return;
            }

            const detachedButtons = Array.from(detachedViewerWindow.document.querySelectorAll('button'));
            const loadPendingButton = detachedButtons.find((button) => button.textContent?.trim() === messages.loadPending);
            if (loadPendingButton && detachedBodyText.includes(messages.idleTitle)) {
              loadPendingButton.click();
              window.clearInterval(detachedBootstrapTimer);
            }
          } catch {
            // The detached window may still be navigating.
          }
        }, 220);

        window.setTimeout(() => {
          window.clearInterval(detachedBootstrapTimer);
        }, 5000);
      }

      if (detachedViewerWindow && detachedPayload && !viewerUrl.hash) {
        const targetOrigin = viewerUrl.origin;
        const detachedPayloadMessage = {
          cmd: 'postJson' as const,
          json: detachedPayload
        };

        const handleDetachedViewerReady = (event: MessageEvent) => {
          if (event.origin !== targetOrigin || event.source !== detachedViewerWindow) {
            return;
          }

          if (event.data?.cmd !== 'detachedViewerReady') {
            return;
          }

          detachedViewerWindow.postMessage(detachedPayloadMessage, targetOrigin);
          window.removeEventListener('message', handleDetachedViewerReady);
        };

        window.addEventListener('message', handleDetachedViewerReady);
      } else {
        await browser.runtime.sendMessage({
          cmd: 'openWorkspaceLauncher'
        } as const);
      }

      setStatusText(messages.detachedViewerOpened);
    } catch {
      window.open('./viewer.html', '_blank');
    }
  });

  const openDetachedViewerForCurrentDocument = useEffectEvent(async () => {
    const activeSettings = settingsRef.current || settings;
    const currentViewerState = viewerStateRef.current || viewerState;
    const candidate = currentViewerState && activeSettings
      ? serializeViewerNodeValue(currentViewerState.payload.data, activeSettings.jsonEngine)
      : inputTextRef.current || inputText;
    const detachedPayload = currentViewerState
      ? {
        string: currentViewerState.payload.string,
        data: currentViewerState.payload.data,
        format: currentViewerState.payload.format
      }
      : null;

    await openDetachedViewerWithPayload(detachedPayload, candidate);
  });

  const openDetachedViewerForValue = useEffectEvent(async (
    detachedValueText: string,
    sourcePathLabel: string
  ) => {
    const activeSettings = settingsRef.current || settings;
    const resolvedDetachedValueText = activeSettings
      ? resolveDetachedValueText(detachedValueText, activeSettings.jsonEngine)
      : null;
    const candidate = resolvedDetachedValueText?.trim();
    if (!candidate) {
      setErrorText(messages.statusError);
      return;
    }

    const viewerUrl = new URL(browser.runtime.getURL('/viewer.html'));
    viewerUrl.searchParams.set('type', 'iframe');
    viewerUrl.searchParams.set('detached', '1');
    viewerUrl.searchParams.set(detachedViewerJsonQueryKey, candidate);
    if (sourcePathLabel) {
      viewerUrl.searchParams.set(detachedViewerSourcePathQueryKey, sourcePathLabel);
    }
    if (currentSourceUrl) {
      viewerUrl.searchParams.set(detachedViewerSourceUrlQueryKey, currentSourceUrl);
    }

    const popupFeatures = [
      'popup=yes',
      'width=1180',
      'height=760',
      'left=80',
      'top=60'
    ].join(',');

    if (activeSettings?.detachedViewerMode === 'tab') {
      window.open(viewerUrl.toString(), '_blank');
    } else {
      window.open(viewerUrl.toString(), '_blank', popupFeatures);
    }
    setStatusText(messages.detachedViewerOpened);
  });

  const applyCurrentEdit = useEffectEvent(() => {
    if (!settings || !viewerState || !hasSelection) {
      return;
    }

    commitViewerEdit(editorText, 'manual');
  });

  useEffect(() => {
    void bootViewer();
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshViewerLibrary = async () => {
      const loadedLibrary = await loadViewerLibrary();
      if (cancelled) {
        return;
      }

      viewerLibraryRef.current = loadedLibrary;
      setViewerLibrary(loadedLibrary);
    };

    void refreshViewerLibrary();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isLauncherMode || viewerState) {
      return;
    }

    sourceInputRef.current?.focus();
  }, [isLauncherMode, viewerState]);

  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
      areaName: string
    ) => {
      if (areaName !== 'local') {
        return;
      }

      const changedKeys = Object.keys(changes);
      const settingsChanged = changedKeys.some((key) => settingsStorageKeys.has(key));
      const libraryChanged = changedKeys.some((key) => key.startsWith(viewerLibraryStoragePrefix));

      if (!settingsChanged && !libraryChanged) {
        return;
      }

      if (settingsChanged) {
        void syncLoadedSettings();
      }

      if (libraryChanged) {
        void loadViewerLibrary().then((loadedLibrary) => {
          viewerLibraryRef.current = loadedLibrary;
          setViewerLibrary(loadedLibrary);
        });
      }
    };

    const handleLocalStorageChange = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage || !event.key) {
        return;
      }

      if (event.key === modernViewerMinimalModeStorageKey) {
        setIsMinimalTreeMode(readViewerMinimalMode());
        return;
      }

      if (event.key === modernSearchModeStorageKey) {
        setPathSearchMode(readViewerSearchMode());
        return;
      }

      if (event.key === modernSearchHistoryStorageKey) {
        setPathSearchHistory(readViewerSearchHistory());
      }
    };

    const storageOnChanged = browser?.storage?.onChanged;
    storageOnChanged?.addListener(handleStorageChange);
    window.addEventListener('storage', handleLocalStorageChange);

    return () => {
      storageOnChanged?.removeListener(handleStorageChange);
      window.removeEventListener('storage', handleLocalStorageChange);
    };
  }, [syncLoadedSettings]);

  useEffect(() => {
    const titleParts = [
      detachedSourcePathLabel,
      detachedSourceUrl,
      messages.title
    ].filter(Boolean);
    document.title = titleParts.join(' · ');
  }, [detachedSourcePathLabel, detachedSourceUrl, messages.title]);

  useEffect(() => {
    if (!settings || viewerState) {
      return;
    }

    const detachedQueryText = decodeDetachedViewerQueryText();
    if (detachedQueryText) {
      const parsedDetachedQuery = parseViewerInput(detachedQueryText, settings.jsonEngine, 'pending');
      if (!parsedDetachedQuery) {
        return;
      }

      applyViewerState(parsedDetachedQuery, parsedDetachedQuery.payload.string);
      setStatusText(messages.statusReady);
      return;
    }

    const detachedHashPayload = decodeDetachedViewerPayloadHash();
    if (!detachedHashPayload) {
      return;
    }

    const resolvedDetachedPayload = resolveDetachedHashViewerState(detachedHashPayload, settings.jsonEngine);
    if (!resolvedDetachedPayload) {
      return;
    }

    applyViewerState(resolvedDetachedPayload, resolvedDetachedPayload.payload.string);
    setStatusText(messages.statusReady);
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }, [applyViewerState, messages.statusReady, settings, viewerState]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedPathSearchQuery(pathSearchQuery);
    }, 120);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [pathSearchQuery]);

  useEffect(() => {
    setActiveSearchIndex(pathSearchMatches.length > 0 ? 0 : -1);
  }, [debouncedPathSearchQuery, pathSearchMatches.length, pathSearchMode, viewerState]);

  useEffect(() => {
    if (!viewerState) {
      return;
    }

    if (viewerState.source === 'pending' || viewerState.source === 'iframe') {
      setHistoryBackEntry(null);
      setHistoryForwardEntry(null);
      setShowUndoConfirm(false);
    }
  }, [viewerState]);

  useEffect(() => {
    if (!settings || !viewerState) {
      return;
    }

    if (viewerState.nodeCount !== null && viewerState.prettyText !== null) {
      return;
    }

    const currentPayloadString = viewerState.payload.string;
    const isDeferredPayload = currentPayloadString.length > viewerPayloadMetaDeferralThreshold;
    const scheduleHydration = () => {
      const hydratedMeta = hydrateViewerPayloadStateMeta(viewerState.payload, settings.jsonEngine);
      startTransition(() => {
        setViewerState((current) => {
          if (!current || current.payload.string !== currentPayloadString) {
            return current;
          }

          const nextState = {
            ...current,
            ...hydratedMeta
          };
          viewerStateRef.current = nextState;
          return nextState;
        });
      });
    };
    let idleCallback: number | null = null;
    let timeoutId: number | null = null;

    if (isDeferredPayload && 'requestIdleCallback' in window) {
      idleCallback = window.requestIdleCallback(scheduleHydration, { timeout: 1500 });
    } else {
      timeoutId = window.setTimeout(scheduleHydration, isDeferredPayload ? 1500 : 0);
    }

    return () => {
      if (idleCallback !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleCallback);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [settings, viewerState]);

  useEffect(() => {
    if (!isSearchOpen || hasInitializedSearchFocusRef.current) {
      return;
    }

    hasInitializedSearchFocusRef.current = true;
    focusSearchInput(true);
  }, [focusSearchInput, isSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen || !searchInputRef.current) {
      return;
    }

    const inputElement = searchInputRef.current;
    const syncSearchQuery = () => {
      setPathSearchQuery(inputElement.value);
    };

    inputElement.addEventListener('input', syncSearchQuery);
    inputElement.addEventListener('change', syncSearchQuery);
    inputElement.addEventListener('search', syncSearchQuery);

    return () => {
      inputElement.removeEventListener('input', syncSearchQuery);
      inputElement.removeEventListener('change', syncSearchQuery);
      inputElement.removeEventListener('search', syncSearchQuery);
    };
  }, [isSearchOpen]);

  useEffect(() => {
    if (!settings || !viewerState || !hasSelection) {
      setIsEditorSingleLine(false);
      setEditorConflict(null);
      setEditorText('');
      return;
    }

    const nextValue = getValueAtPath(viewerState.payload.data, selectedPath);
    setIsEditorSingleLine(false);
    setEditorConflict(null);
    setErrorText('');
    if (selectedPath.length === 0) {
      setEditorText(viewerState.prettyText ?? viewerState.payload.string);
      return;
    }

    setEditorText(formatViewerEditorValue(nextValue, settings.jsonEngine));
  }, [hasSelection, selectedPath, settings, viewerState]);

  const applyEmbeddedPayload = useEffectEvent((message: EmbeddedViewerMessage) => {
    const activeSettings = settingsRef.current;
    if (!activeSettings) {
      pendingEmbeddedMessageRef.current = message;
      return;
    }

    const resolved = resolveEmbeddedPayload(message, activeSettings.jsonEngine);
    if (!resolved) {
      return;
    }

    const currentViewerState = viewerStateRef.current;
    if (
      currentViewerState
      && currentViewerState.payload.string === resolved.payload.string
      && inputTextRef.current === resolved.payload.string
    ) {
      pendingEmbeddedMessageRef.current = null;
      return;
    }

    pendingEmbeddedMessageRef.current = null;
    startTransition(() => {
      applyViewerState(resolved, resolved.payload.string);
      setStatusText(messages.statusReady);
    });
  });

  useEffect(() => {
    settingsRef.current = settings;
    if (!settings || !pendingEmbeddedMessageRef.current) {
      return;
    }

    applyEmbeddedPayload(pendingEmbeddedMessageRef.current);
  }, [applyEmbeddedPayload, settings]);

  useEffect(() => {
    viewerStateRef.current = viewerState;
  }, [viewerState]);

  useEffect(() => {
    inputTextRef.current = inputText;
  }, [inputText]);

  useEffect(() => {
    if (!viewerState || !currentSourceUrl || !isRealSourceUrl(currentSourceUrl)) {
      return;
    }

    const detectedTitle = formatViewerSourceTitle(currentSourceUrl, detachedSourcePathLabel);
    const sourceType = getViewerSourceType(isLauncherMode);
    const recentKey = `${sourceType}:${currentSourceUrl}`;

    if (recordedRecentSourceRef.current !== recentKey) {
      recordedRecentSourceRef.current = recentKey;
      void updateViewerLibraryRecent(currentSourceUrl, detectedTitle, sourceType).then((loadedLibrary) => {
        viewerLibraryRef.current = loadedLibrary;
        setViewerLibrary(loadedLibrary);
      });
    }

    const existingCollection = findViewerCollectionEntryByUrl(viewerLibraryRef.current.collections, currentSourceUrl);
    const collectionKey = existingCollection ? `${existingCollection.id}:${currentSourceUrl}` : '';
    if (existingCollection && recordedCollectionSourceRef.current !== collectionKey) {
      recordedCollectionSourceRef.current = collectionKey;
      void updateViewerLibraryCollection({
        ...existingCollection,
        lastOpenedAt: Date.now()
      }).then((loadedLibrary) => {
        viewerLibraryRef.current = loadedLibrary;
        setViewerLibrary(loadedLibrary);
      });
    }
  }, [currentSourceUrl, detachedSourcePathLabel, isLauncherMode, viewerLibrary, viewerState]);

  useEffect(() => {
    if (!statusText) {
      return;
    }

    const statusTimer = window.setTimeout(() => {
      setStatusText('');
    }, 2200);

    return () => {
      window.clearTimeout(statusTimer);
    };
  }, [statusText]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.cmd !== 'postJson') {
        if (!event.data || event.data.cmd !== 'toolkitReturnValue') {
          return;
        }

        applyToolkitReturnValue(String(event.data.data ?? ''));
        return;
      }

      applyEmbeddedPayload(event.data as EmbeddedViewerMessage);
    };

    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [applyEmbeddedPayload]);

  useEffect(() => {
    const handleRuntimeMessage = (request: unknown) => {
      if (!request || typeof request !== 'object') {
        return;
      }

      const message = request as { cmd?: string; data?: unknown };
      if (message.cmd !== 'toolkitReturnValue') {
        return;
      }

      applyToolkitReturnValue(typeof message.data === 'string' ? message.data : '');
    };

    browser.runtime.onMessage.addListener(handleRuntimeMessage);
    return () => {
      browser.runtime.onMessage.removeListener(handleRuntimeMessage);
    };
  }, [applyToolkitReturnValue]);

  const selectedPathLabel = hasSelection ? formatViewerInspectorPath(selectedPath) : '';
  const selectedKind = currentValue === undefined ? '-' : currentValueInfo?.kind ?? '-';
  const inspectorTextValue = hasSelection ? editorText : '';
  const canOpenDetachedViewer = Boolean(
    (viewerState && settings) || inputText.trim()
  );
  const urlToolAvailable = hasSelection && selectedKind === 'string' && looksLikeUrlText(inspectorTextValue || currentValue);
  const singleLineAvailable = hasSelection && canSingleLine(selectedKind, inspectorTextValue || currentValue);
  const timestampAvailable = hasSelection && looksLikeTimestamp(inspectorTextValue || currentValue, selectedKind);
  const isoDateAvailable = hasSelection && selectedKind === 'string' && looksLikeIsoDateString(inspectorTextValue || currentValue);
  const booleanAvailable = hasSelection && looksLikeBooleanValue(currentValue, selectedKind);
  const effectiveToolFilterMode: Exclude<ViewerToolFilterMode, 'auto'> | 'auto' = (() => {
    if (toolFilterMode !== 'auto') {
      return toolFilterMode;
    }

    if (booleanAvailable) {
      return 'state';
    }

    if (timestampAvailable || isoDateAvailable) {
      return 'time';
    }

    if (singleLineAvailable && isStructuredKind(selectedKind)) {
      return 'json';
    }

    if (selectedKind === 'string') {
      return 'text';
    }

    if (currentValue !== undefined) {
      return 'json';
    }

    return 'auto';
  })();
  const visibleQuickTools = [
    {
      id: 'urlDecode',
      category: 'text',
      label: messages.urlDecodeLabel,
      available: urlToolAvailable,
      onClick: () => applyUrlDecode()
    },
    {
      id: 'urlEncode',
      category: 'text',
      label: messages.urlEncodeLabel,
      available: urlToolAvailable,
      onClick: () => applyUrlEncode()
    },
    {
      id: 'singleLine',
      category: isStructuredKind(selectedKind) ? 'json' : 'text',
      label: isStructuredKind(selectedKind) ? messages.singleLineLabel : messages.singleLineLabel,
      available: singleLineAvailable,
      onClick: () => applySingleLine()
    },
    {
      id: 'timestamp',
      category: 'time',
      label: timestampAvailable ? messages.timeTransformLabel : messages.timeTransformLabel,
      available: timestampAvailable || isoDateAvailable,
      onClick: () => applyTimestampTransform()
    },
    {
      id: 'toggleBoolean',
      category: 'state',
      label: messages.toggleBooleanLabel,
      available: booleanAvailable,
      onClick: () => applyToggleBoolean()
    }
  ].filter((tool) => {
    if (toolFilterMode === 'all' || toolFilterMode === 'auto') {
      return tool.available;
    }

    return tool.category === effectiveToolFilterMode || (effectiveToolFilterMode === 'json' && tool.category === 'text');
  });
  const shellClassName = `viewerShell${isIframeMode ? ' isIframeMode' : ''}`;
  const frameClassName = `viewerFrame${isIframeMode ? ' isIframeMode' : ''}`;
  const gridClassName = `viewerGrid${isIframeMode ? ' isIframeMode' : ''}`;
  const treeCardClassName = `viewerCard jmTreeCard${isIframeMode ? ' isIframeMode' : ''}`;
  const editorCardClassName = `viewerEditor${isIframeMode ? ' isIframeMode' : ''}`;
  const showLauncherStage = isIframeMode && isLauncherMode && !viewerState;
  const shouldShowSourceCard = !isIframeMode || (isLauncherMode && !viewerState && !showLauncherStage);
  const sourceCardClassName = `viewerCard viewerSourceCard${shouldShowSourceCard ? '' : ' isHidden'}`;
  const rootExternalHref = viewerState && showTreeLinks
    ? rootValueInfo?.valueCapabilities.externalUrlHref ?? null
    : null;
  const showRootExternalAction = Boolean(rootExternalHref) && (rootValueInfo?.structured || !showTreeValues);
  const hasRealSourceUrl = Boolean(viewerState && currentSourceUrl && isRealSourceUrl(currentSourceUrl));
  const currentLibraryEntry = hasRealSourceUrl
    ? findViewerCollectionEntryByUrl(viewerLibrary.collections, currentSourceUrl)
    : null;
  const collectionButtonTooltip = currentLibraryEntry ? messages.collectionDialogTitle : messages.collectionButtonLabel;
  const launcherRecentItems = viewerLibrary.recents;
  const launcherCollectionGroups = groupViewerCollections(viewerLibrary.collections);
  const viewerCollectionNames = getViewerCollectionNames(viewerLibrary.collections);
  const canCreateNewCollection = viewerCollectionNames.length < getViewerCollectionLimit();
  const visibleCollectionCount = viewerCollectionNames.length;
  const sourceCardSection = (
    <section className={showLauncherStage ? 'viewerCard viewerSourceCard isLauncherStage' : sourceCardClassName}>
      <div className="viewerCardHeader">
        <div>
          <h2>{messages.rawInputLabel}</h2>
          <p>{messages.rawInputHint}</p>
        </div>
      </div>
      {isLauncherMode && !viewerState ? (
        <div className="viewerLauncherLayout">
          <div className="viewerLauncherLaunchStack">
            <div className="viewerLauncherQuickStart">
              <div className="viewerLauncherQuickStartHeader">
                <strong>{messages.launcherQuickStartTitle}</strong>
                <p>{messages.launcherQuickStartHint}</p>
              </div>
              <label className="viewerLauncherUrlField">
                <span>{messages.launcherUrlLabel}</span>
                <div className="viewerLauncherUrlInputRow">
                  <input
                    className="viewerInspectorInput"
                    onChange={(event) => setLauncherUrlInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        openLauncherUrl();
                      }
                    }}
                    placeholder={messages.launcherUrlPlaceholder}
                    spellCheck={false}
                    type="text"
                    value={launcherUrlInput}
                  />
                  <button className="viewerButton secondary" onClick={() => openLauncherUrl()} type="button">
                    {messages.launcherOpenUrl}
                  </button>
                </div>
              </label>
              <div className="viewerLauncherFixtureBlock">
                <span>{messages.launcherFixturesLabel}</span>
                <p className="viewerLauncherFixtureNote">{messages.launcherImagePreviewExamplesLabel}</p>
                <div className="viewerLauncherFixtureList">
                  {launcherFixtures.map((fixture) => (
                    <button
                      className="viewerButton secondary"
                      key={fixture.id}
                      onClick={() => openLauncherFixtureUrl(fixture.url)}
                      type="button"
                    >
                      {fixture.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="viewerLauncherFixtureBlock">
                <span>{messages.launcherInlineSamplesLabel}</span>
                <div className="viewerLauncherFixtureList">
                  {launcherInlineSamples.map((sample) => (
                    <button
                      className="viewerButton secondary"
                      key={sample.id}
                      onClick={() => loadLauncherInlineSample(sample.payload)}
                      type="button"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <aside className="viewerLauncherLibrary">
            <section className="viewerLauncherLibraryBlock">
              <div className="viewerLauncherLibraryHead">
                <strong>{messages.launcherRecentLabel}</strong>
                <span>{messages.launcherRecentEmpty}</span>
              </div>
              {launcherRecentItems.length > 0 ? (
                <div className="viewerLauncherLibraryList">
                  {launcherRecentItems.map((entry) => (
                    <button
                      className="viewerButton secondary viewerLauncherLibraryItem"
                      key={`${entry.sourceType}:${entry.url}`}
                      onClick={() => openLauncherFixtureUrl(entry.url)}
                      type="button"
                    >
                      <span className="viewerLauncherLibraryItemTitle">{entry.detectedTitle}</span>
                      <span className="viewerLauncherLibraryItemMeta">{entry.url}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="viewerLauncherLibraryEmpty">{messages.launcherRecentEmpty}</div>
              )}
            </section>
            <section className="viewerLauncherLibraryBlock">
              <div className="viewerLauncherLibraryHead">
                <strong>{messages.launcherCollectionsLabel}</strong>
                <span>{messages.launcherCollectionsEmpty}</span>
              </div>
              {launcherCollectionGroups.length > 0 ? (
                <div className="viewerLauncherCollections">
                  {launcherCollectionGroups.map(([collectionName, entries]) => (
                    <div className="viewerLauncherCollectionGroup" key={collectionName}>
                      <div className="viewerLauncherCollectionGroupTitle">
                        <strong>{collectionName}</strong>
                        <span>{entries.length}</span>
                      </div>
                      <div className="viewerLauncherLibraryList">
                        {entries.map((entry) => (
                          <button
                            className="viewerButton secondary viewerLauncherLibraryItem"
                            key={entry.id}
                            onClick={() => openLauncherFixtureUrl(entry.url)}
                            type="button"
                          >
                            <span className="viewerLauncherLibraryItemTitle">{getViewerCollectionEntryDisplayTitle(entry)}</span>
                            <span className="viewerLauncherLibraryItemMeta">{entry.url}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="viewerLauncherLibraryEmpty">{messages.launcherCollectionsEmpty}</div>
              )}
            </section>
          </aside>
        </div>
      ) : null}
      <textarea
        className="viewerTextarea viewerTextareaDocument"
        onChange={(event) => setInputText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            parseCurrentInput('manual');
          }
        }}
        placeholder='{"root": 3}'
        ref={sourceInputRef}
        spellCheck={false}
        value={inputText}
      />
      <div className="viewerToolbar">
        <button className="viewerButton" onClick={() => parseCurrentInput('manual')} type="button">
          {messages.parseInput}
        </button>
        {isIframeMode ? (
          <button
            className="viewerButton secondary"
            disabled={!canOpenDetachedViewer}
            id="openDetachedViewer"
            onClick={() => void openDetachedViewerForCurrentDocument()}
            type="button"
          >
            {messages.openDetachedViewer}
          </button>
        ) : null}
        <button
          className="viewerButton secondary"
          onClick={() => {
            setInputText('');
            setEditorText('');
            setErrorText('');
            setViewerState(null);
            setStatusText('');
            setSelectedPath([]);
          }}
          type="button"
        >
          {messages.clearInput}
        </button>
      </div>
    </section>
  );

  return (
    <main className={shellClassName}>
      <div className={frameClassName}>
        {isIframeMode && statusText ? (
          <div className="viewerStatusToast" id="viewerStatusToast" role="status" aria-live="polite">
            {statusText}
          </div>
        ) : null}
        {isIframeMode ? (
          <>
            <section className={`jmViewerCanvas${showLauncherStage ? ' jmViewerCanvasLauncher' : ''}`}>
              {showLauncherStage ? (
                <div className="viewerLauncherStage">
                  <section className="viewerHero viewerLauncherHero">
                    <div className="viewerLauncherHeroCopy">
                      <div className="viewerLauncherBrand">
                        <div className="jmViewerPanelBrandMark viewerLauncherBrandMark">JM</div>
                        <div className="viewerLauncherBrandCopy">
                          <p className="viewerEyebrow">{messages.eyebrow}</p>
                          <h1>{messages.title}</h1>
                          <p>{messages.subtitle}</p>
                        </div>
                      </div>
                      <div className="viewerStatus viewerStatusInline">
                        {messages.launcherQuickStartTitle}
                      </div>
                    </div>
                    <div className="viewerActions">
                      <a className="viewerGhostLink" href="./options.html?source=launcher">{messages.openSettings}</a>
                    </div>
                  </section>
                  {sourceCardSection}
                </div>
              ) : null}
              {showLauncherStage ? null : (
                <>
              <section className="jmTreeArea" aria-live="polite">
                {viewerState ? (
                  <div
                    className={[
                      'jmTree',
                      'data-explorer',
                      showTreeValues ? 'showValues' : '',
                      isMinimalTreeMode ? 'showFullValueText' : '',
                      showArrayIndexes ? 'showArrayIndexes' : '',
                      showArrayLength ? jmTreeLengthClassName : '',
                      showTreeImages ? 'showImages' : '',
                      showFolderIcons ? 'folderIcons' : '',
                      showTypeIcons ? '' : 'noIcons'
                    ].filter(Boolean).join(' ')}
                    id="dataExplorer"
                  >
                    <div
                      className={[
                        'treeBranch',
                        'root',
                        rootValueInfo?.structured ? `folder ${rootValueInfo.kind}` : `node ${rootValueInfo?.kind ?? 'undefined'}`,
                        expandedPaths[rootPathKey] === false ? '' : 'open',
                        hasSelection && selectedPath.length === 0 ? 'cur' : ''
                      ].filter(Boolean).join(' ')}
                    >
                      <div
                        className="row"
                        onClick={(event) => {
                          if (isTreeToggleHitTarget(event.target)) {
                            return;
                          }
                          selectPath([]);
                        }}
                      >
                        {showTypeIcons ? <img alt="" className="ico" src={getViewerTreeIconSrc(rootValueInfo?.kind ?? 'object')} /> : null}
                        <div className="treeRow">
                          <span className="treeLabel">
                            <button
                              className="treeSelectButton"
                              onClick={(event) => {
                                event.stopPropagation();
                                selectPath([]);
                              }}
                              type="button"
                            >
                              <span className="treeKey object-key">{messages.rootLabel}</span>
                              {rootValueInfo && !rootValueInfo.structured && showTreeValues ? (
                                <ViewerInlineValue
                                  fieldKey={null}
                                  jsonEngine={viewerJsonEngine}
                                  onPreviewImage={setPreviewImageSrc}
                                  onOpenDetachedValue={openDetachedViewerForValue}
                                  openLinkTitle={messages.openLink}
                                  openDetachedValueTitle={messages.openDetachedValue}
                                  sourcePathLabel=""
                                  showFullText={isMinimalTreeMode}
                                  showImages={showTreeImages}
                                  showLinks={showTreeLinks}
                                  valueInfo={rootValueInfo}
                                  value={viewerState.payload.data}
                                />
                              ) : null}
                            </button>
                          </span>
                          {showArrayLength && rootValueInfo?.structured ? (
                            <span className="array-length">{rootValueInfo.childCount}</span>
                          ) : null}
                          {showRootExternalAction ? (
                            <a
                              className="treeValueLink viewerIconButton jmViewerIconAction iconButton iconButton--link"
                              href={rootExternalHref!}
                              onClick={(event) => event.stopPropagation()}
                              rel="noreferrer"
                              target="_blank"
                              title={messages.openLink}
                            >
                              <LinkIcon />
                            </a>
                          ) : null}
                        </div>
                        {isStructuredValue(viewerState.payload.data) ? (
                          <button
                            className="treeToggleHitbox"
                            onClick={(event) => {
                              event.stopPropagation();
                              togglePath([]);
                            }}
                            type="button"
                          />
                        ) : null}
                      </div>
                      {expandedPaths[rootPathKey] === false || !isStructuredValue(viewerState.payload.data) ? null : (
                        <ViewerTreeBranch
                          expandedPaths={expandedPaths}
                          isSelected={(path) => getViewerPathKey(path) === getViewerPathKey(selectedPath)}
                          jsonEngine={viewerJsonEngine}
                          onPreviewImage={setPreviewImageSrc}
                          onOpenDetachedValue={openDetachedViewerForValue}
                          openLinkTitle={messages.openLink}
                          openDetachedValueTitle={messages.openDetachedValue}
                          onSelect={selectPath}
                          onToggle={togglePath}
                          parentKind={Array.isArray(viewerState.payload.data) ? 'array' : 'object'}
                          parentPath={[]}
                          shouldSortObjectKeys={shouldSortObjectKeys}
                          showArrayIndexes={showArrayIndexes}
                          showArrayLength={showArrayLength}
                          showFullText={isMinimalTreeMode}
                          showImages={showTreeImages}
                          showTypeIcons={showTypeIcons}
                          showLinks={showTreeLinks}
                          showValues={showTreeValues}
                          value={viewerState.payload.data}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="viewerPreview">
                    <pre>Waiting for iframe payload...</pre>
                  </div>
                )}
              </section>

              <button
                aria-label={isWorkspaceOpen ? messages.badgeOpenState : messages.badgeClosedState}
                aria-pressed={isWorkspaceOpen}
                className={`viewerMateBadge${isWorkspaceOpen ? ' is-panel-open' : ''}`}
                id="mateBadge"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setIsWorkspaceOpen((current) => !current);
                }}
                title={isWorkspaceOpen ? messages.badgeOpenState : messages.badgeClosedState}
                type="button"
              >
                <span className="viewerMateBadgeMark">JM</span>
                <span className="srOnly">{isWorkspaceOpen ? messages.badgeOpenState : messages.badgeClosedState}</span>
              </button>

              <aside className={`jmViewerPanel${isWorkspaceOpen ? '' : ' isMinimized'}`} id="panel">
                <div className="jmViewerPanelBody" id="valueAct">
                  <div className="jmViewerPanelBrand panelBrand">
                    <div className="jmViewerPanelBrandCopy panelBrand-copy">
                      <strong>{workspaceBrand}</strong>
                      <span>{messages.workspaceSubtitle}</span>
                    </div>
                    <div className="jmViewerPanelBrandActions">
                      {hasRealSourceUrl ? (
                        <button
                          className={`viewerIconButton panelActionButton panelActionButton--collection${currentLibraryEntry ? ' is-active' : ''}`}
                          id="collectionBtn"
                          aria-pressed={Boolean(currentLibraryEntry)}
                          aria-label={collectionButtonTooltip}
                          onClick={() => openCollectionDialog()}
                          title={collectionButtonTooltip}
                          type="button"
                        >
                          <CollectionIcon />
                          <span className="srOnly">{collectionButtonTooltip}</span>
                          <span aria-hidden="true" className="viewerActionTooltip viewerActionTooltip--edge-end">{collectionButtonTooltip}</span>
                        </button>
                      ) : null}
                      <a
                        className="viewerIconButton panelActionButton"
                        href="./options.html?source=viewer"
                        id="optBtn"
                        title={messages.openSettings}
                        aria-label={messages.openSettings}
                      >
                        <SettingsIcon />
                        <span className="srOnly">{messages.openSettings}</span>
                        <span aria-hidden="true" className="viewerActionTooltip viewerActionTooltip--edge-end">{messages.openSettings}</span>
                      </a>
                    </div>
                  </div>

                  <div aria-label="Tree actions" className="jmViewerToolbar workspaceToolbar">
                    <div className="workspaceToolbar-group">
                      <button
                        className="actionButton actionButton--compact"
                        data-tooltip={messages.expandCurrent}
                        disabled={!hasSelection}
                        id="expandCur"
                        onClick={() => expandSelectedPath()}
                        title={messages.expandCurrent}
                        type="button"
                      >
                        <ExpandCurrentIcon />
                        <span className="srOnly">{messages.expandCurrent}</span>
                        <span aria-hidden="true" className="viewerActionTooltip">{messages.expandCurrent}</span>
                      </button>
                      <button
                        className="actionButton actionButton--compact"
                        data-tooltip={messages.collapseCurrent}
                        disabled={!hasSelection}
                        id="collapseCur"
                        onClick={() => collapseSelectedPath()}
                        title={messages.collapseCurrent}
                        type="button"
                      >
                        <CollapseCurrentIcon />
                        <span className="srOnly">{messages.collapseCurrent}</span>
                        <span aria-hidden="true" className="viewerActionTooltip">{messages.collapseCurrent}</span>
                      </button>
                      <button
                        className="actionButton actionButton--compact"
                        data-tooltip={messages.expandAll}
                        id="expandAll"
                        onClick={() => expandAllPaths()}
                        title={messages.expandAll}
                        type="button"
                      >
                        <ExpandAllIcon />
                        <span className="srOnly">{messages.expandAll}</span>
                        <span aria-hidden="true" className="viewerActionTooltip">{messages.expandAll}</span>
                      </button>
                      <button
                        className="actionButton actionButton--compact"
                        data-tooltip={messages.collapseAll}
                        id="collapseAll"
                        onClick={() => collapseAllPaths()}
                        title={messages.collapseAll}
                        type="button"
                      >
                        <CollapseAllIcon />
                        <span className="srOnly">{messages.collapseAll}</span>
                        <span aria-hidden="true" className="viewerActionTooltip">{messages.collapseAll}</span>
                      </button>
                      <button
                        aria-label={messages.pathSearchOpen}
                        className="actionButton actionButton--compact jmViewerToolbarSearch"
                        data-tooltip={messages.pathSearchOpen}
                        id="pathSearchBtn"
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openSearch();
                        }}
                        ref={searchButtonRef}
                        title={messages.pathSearchOpen}
                        type="button"
                      >
                        <SearchIcon />
                        <span className="srOnly">{messages.pathSearchOpen}</span>
                        <span aria-hidden="true" className="viewerActionTooltip">{messages.pathSearchOpen}</span>
                      </button>
                    </div>
                  </div>

                  <div className="jmViewerTopBox topBox">
                    <label className="jmViewerInspectorLine inspectorLine inspectorLine--path">
                      <span className="jmViewerLabel inputTitle">{messages.pathLabel}:</span>
                      <div className="jmViewerInspectorBody inspectorLine-body">
                        <div className="jmViewerPathField pathField">
                          <input
                            className="viewerInspectorInput textInpub pathValue"
                            id="viewerPathInput"
                            onChange={(event) => setPathInputValue(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault();
                                jumpToPathInput();
                              }
                            }}
                            placeholder="links.homepage"
                            spellCheck={false}
                            type="text"
                            value={pathInputValue}
                          />
                          <div className="jmViewerInspectorActions">
                            {typeof currentValue === 'string' && /^https?:\/\//.test(currentValue) ? (
                              <a
                                className="viewerIconButton jmViewerIconAction iconButton iconButton--link"
                                href={currentValue}
                                id="openCurrentLinkButton"
                                rel="noreferrer"
                                target="_blank"
                                title={messages.openLink}
                              >
                                <LinkIcon />
                              </a>
                            ) : null}
                            <button
                              className="viewerIconButton jmViewerIconAction iconButton"
                              id="jumpToPathButton"
                              onClick={() => jumpToPathInput()}
                              title={messages.jumpToPath}
                              type="button"
                            >
                              <JumpIcon />
                            </button>
                            <button
                              className="viewerIconButton jmViewerIconAction iconButton"
                              disabled={!selectedPathLabel}
                              id="copyPathButton"
                              onClick={() => void copyText(selectedPathLabel, messages.pathCopied)}
                              title={messages.copyPath}
                              type="button"
                            >
                              <CopyIcon />
                            </button>
                          </div>
                        </div>
                      </div>
                    </label>
                    <div className="jmViewerInspectorLine inspectorLine inspectorLine--key">
                      <span className="jmViewerLabel inputTitle">{messages.keyLabel}:</span>
                      <div className="jmViewerInspectorBody jmViewerKeyBody inspectorLine-body inspectorEditorBlock">
                        <div className="jmViewerKeyRow inspectorEditorHeading">
                          <span className="lableInput inspectorValueRow">
                            <input
                              className="viewerInspectorInput textInpub"
                              id="viewerKeyInput"
                              onChange={(event) => setKeyInputValue(event.target.value)}
                              readOnly={!canRenameKey}
                              spellCheck={false}
                              type="text"
                              value={keyInputValue}
                            />
                            <span> :</span>
                          </span>
                          <div className="jmViewerInspectorActions">
                            <button
                              className="viewerIconButton jmViewerIconAction iconButton"
                              disabled={selectedPath.length === 0}
                              id="copyKeyBtn"
                              onClick={() => void copyText(selectedPath.length > 0 ? String(selectedPath[selectedPath.length - 1]) : '', messages.keyCopied)}
                              title={messages.copyKey}
                              type="button"
                            >
                              <CopyIcon />
                            </button>
                            <button
                              className="viewerIconButton jmViewerIconAction iconButton iconButton--save"
                              disabled={!isKeyDirty}
                              id="saveKeyBtn"
                              onClick={() => applyCurrentEdit()}
                              title={messages.applyEdit}
                              type="button"
                            >
                              <SaveIcon />
                            </button>
                          </div>
                          <span className={`treeKind kind-${selectedKind}`}>{selectedKind}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {viewerState ? (
                    <>
                      <textarea
                        className={`viewerTextarea jmViewerEditorTextarea${isEditorSingleLine ? ' is-single-line' : ''}${errorText ? ' is-invalid' : ''}`}
                        cols={66}
                        id="editorValue"
                        onChange={(event) => {
                          setEditorText(event.target.value);
                          if (editorConflict) {
                            setEditorConflict(null);
                            setErrorText('');
                          }
                        }}
                        readOnly={!hasSelection}
                        rows={22}
                        spellCheck={false}
                        wrap={isEditorSingleLine ? 'off' : 'soft'}
                        value={editorText}
                      />
                      <div className="jmViewerPrimaryActions editorPrimaryRow">
                        <div className="editorActionGroup editorActionGroup--primary">
                          <div className="actionButtonSlot" hidden={!hasSelection}>
                            <button
                              aria-label={messages.applyEdit}
                              className="jmViewerPrimaryButton jmViewerPrimaryButtonPrimary jmViewerPrimaryButtonIcon actionButton actionButton--primary"
                              disabled={!hasSelection}
                              data-tooltip={messages.applyEdit}
                              id="saveBtn"
                              onClick={() => applyCurrentEdit()}
                              title={messages.applyEdit}
                              type="button"
                            >
                              <SaveIcon />
                              <span className="srOnly">{messages.applyEdit}</span>
                              <span aria-hidden="true" className="viewerActionTooltip">{messages.applyEdit}</span>
                            </button>
                            <div className="undoConfirmPopover" hidden={!editorConflict} id="editorConflictActions">
                              <span className="undoConfirmMessage">{messages.invalidTypedEdit}</span>
                              <span className="undoConfirmMessage">{editorConflict?.reason || ''}</span>
                              <div className="undoConfirmActions">
                                <button
                                  className="actionButton actionButton--compact"
                                  id="ignoreInvalidEditBtn"
                                  onClick={() => ignoreEditorConflict()}
                                  type="button"
                                >
                                  <span className="buttonLabel">{messages.ignoreInvalidEdit}</span>
                                </button>
                                <button
                                  className="actionButton actionButton--compact actionButton--primary"
                                  id="saveAsStringBtn"
                                  onClick={() => applyEditorConflictAsString()}
                                  type="button"
                                >
                                  <span className="buttonLabel">{messages.saveAsString}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                          <div className="actionButtonSlot actionButtonSlot--undo" hidden={!historyBackEntry}>
                            <button
                              aria-label={messages.undoEdit}
                              className="jmViewerPrimaryButton jmViewerPrimaryButtonIcon actionButton"
                              hidden={!historyBackEntry}
                              data-tooltip={messages.undoEdit}
                              id="undoBtn"
                              onClick={() => requestUndo()}
                              title={messages.undoEdit}
                              type="button"
                            >
                              <UndoIcon />
                              <span className="srOnly">{messages.undoEdit}</span>
                              <span aria-hidden="true" className="viewerActionTooltip">{messages.undoEdit}</span>
                            </button>
                            <div className="undoConfirmPopover" hidden={!showUndoConfirm} id="undoConfirmPopover">
                              <span className="undoConfirmMessage">{messages.undoConfirm}</span>
                              <div className="undoConfirmActions">
                                <button
                                  className="actionButton actionButton--compact actionButton--danger"
                                  id="undoConfirmBtn"
                                  onClick={() => confirmUndo()}
                                  type="button"
                                >
                                  <span className="buttonLabel">{messages.undoNow}</span>
                                </button>
                                <button
                                  className="actionButton actionButton--compact"
                                  id="undoCancelBtn"
                                  onClick={() => setShowUndoConfirm(false)}
                                  type="button"
                                >
                                  <span className="buttonLabel">{messages.keepEditing}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                          {canShowRedoButton ? (
                            <button
                              aria-label={messages.redoEdit}
                              className="jmViewerPrimaryButton jmViewerPrimaryButtonIcon actionButton"
                              data-tooltip={messages.redoEdit}
                              id="redoBtn"
                              onClick={() => redoEdit()}
                              title={messages.redoEdit}
                              type="button"
                            >
                              <RedoIcon />
                              <span className="srOnly">{messages.redoEdit}</span>
                              <span aria-hidden="true" className="viewerActionTooltip">{messages.redoEdit}</span>
                            </button>
                          ) : null}
                          <button
                            aria-label={messages.copyValue}
                            className="jmViewerPrimaryButton jmViewerPrimaryButtonIcon actionButton"
                            disabled={!hasSelection}
                            data-tooltip={messages.copyValue}
                            id="copyValue"
                            onClick={() => void copyText(settings ? serializeViewerNodeValue(currentValue, settings.jsonEngine) : editorText, messages.valueCopied)}
                            title={messages.copyValue}
                            type="button"
                          >
                            <CopyIcon />
                            <span className="srOnly">{messages.copyValue}</span>
                            <span aria-hidden="true" className="viewerActionTooltip">{messages.copyValue}</span>
                          </button>
                          {typeof currentValue === 'string' && /^https?:\/\//.test(currentValue) ? (
                            <a
                              aria-label={messages.openLink}
                              className="jmViewerPrimaryButton jmViewerPrimaryButtonGhost jmViewerPrimaryButtonIcon actionButton actionButton--ghost"
                              data-tooltip={messages.openLink}
                              href={currentValue}
                              id="openCurrentLink"
                              rel="noreferrer"
                              target="_blank"
                              title={messages.openLink}
                            >
                              <LinkIcon />
                              <span className="srOnly">{messages.openLink}</span>
                              <span aria-hidden="true" className="viewerActionTooltip">{messages.openLink}</span>
                            </a>
                          ) : null}
                          {currentDetachedValueCandidate ? (
                            <button
                              aria-label={messages.openDetachedValue}
                              className="jmViewerPrimaryButton jmViewerPrimaryButtonGhost jmViewerPrimaryButtonIcon actionButton actionButton--ghost"
                              data-tooltip={messages.openDetachedValue}
                              id="openCurrentDetachedValue"
                              onClick={() => void openDetachedViewerForValue(String(currentValue), selectedPathLabel)}
                              title={messages.openDetachedValue}
                              type="button"
                            >
                              <DetachedValueIcon />
                              <span className="srOnly">{messages.openDetachedValue}</span>
                              <span aria-hidden="true" className="viewerActionTooltip">{messages.openDetachedValue}</span>
                            </button>
                          ) : null}
                          <button
                            aria-label={messages.openToolkit}
                            className="jmViewerPrimaryButton jmViewerPrimaryButtonGhost jmViewerPrimaryButtonIcon actionButton actionButton--ghost"
                            disabled={!hasSelection}
                            data-tooltip={messages.openToolkit}
                            id="openToolkit"
                            onClick={() => void openToolkitForCurrentValue()}
                            title={messages.openToolkit}
                            type="button"
                          >
                            <ToolkitIcon />
                            <span className="srOnly">{messages.openToolkit}</span>
                            <span aria-hidden="true" className="viewerActionTooltip">{messages.openToolkit}</span>
                          </button>
                        </div>
                      </div>

                      <div className="jmViewerToolShelf toolShelf">
                        <div className="jmViewerShelfHead toolShelfHead">
                          <div className="jmViewerShelfLead toolShelfHeadLead">
                            <strong>{messages.quickToolsLabel}</strong>
                            <select
                              className="jmViewerToolFilter toolFilterSelect"
                              id="toolFilter"
                              onChange={(event) => setToolFilterMode(event.target.value as ViewerToolFilterMode)}
                              value={toolFilterMode}
                            >
                              <option value="auto">{messages.toolFilterAuto}</option>
                              <option value="all">{messages.toolFilterAll}</option>
                              <option value="text">{messages.toolFilterText}</option>
                              <option value="json">{messages.toolFilterJson}</option>
                              <option value="time">{messages.toolFilterTime}</option>
                              <option value="state">{messages.toolFilterState}</option>
                            </select>
                          </div>
                          <button
                            aria-label={messages.quickToolsMore}
                            className="jmViewerActionButton jmViewerShelfAction jmViewerShelfActionIcon actionButton actionButton--compact actionButton--ghost"
                            data-tooltip={messages.quickToolsMore}
                            onClick={() => void openToolkitForCurrentValue()}
                            title={messages.quickToolsMore}
                            type="button"
                          >
                            <ToolkitIcon />
                            <span className="srOnly">{messages.quickToolsMore}</span>
                            <span aria-hidden="true" className="viewerActionTooltip">{messages.quickToolsMore}</span>
                          </button>
                        </div>
                        {hasSelection ? (
                          <div className="jmViewerToolGrid editorActionGroup editorActionGroup--context contextToolRow" id="contextTools">
                            {visibleQuickTools.map((tool) => (
                              <button
                                className="jmViewerToolButton actionButton actionButton--tool"
                                disabled={!tool.available}
                                key={tool.id}
                                onClick={() => tool.onClick()}
                                type="button"
                              >
                                {tool.label}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="jmViewerEditorFeedback editorFeedback" aria-live="polite">
                        <div hidden={!errorText || Boolean(editorConflict)} id="editorValidation">{errorText}</div>
                      </div>

                      <div className="jmViewerDisplayPanel displayOptionPanel bottomBox">
                        <div className="jmViewerDisplayHead displayOptionPanel-head">
                          <div className="displayOptionPanel-headCopy">
                            <strong>{messages.displayOptionsLabel}</strong>
                            <span>{messages.displayOptionsHelp}</span>
                          </div>
                          <label className="jmViewerHeadToggle" title={messages.minimalismHelp}>
                            <span className="jmViewerHeadToggleLabel">{messages.minimalismLabel}</span>
                            <span className="jmViewerHeadToggleControl">
                              <input
                                checked={isMinimalTreeMode}
                                id="viewerMinimalMode"
                                onChange={(event) => {
                                  setIsMinimalTreeMode(event.target.checked);
                                  writeViewerMinimalMode(event.target.checked);
                                }}
                                type="checkbox"
                              />
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                        </div>
                        <div className="jmViewerDisplayGrid displayOptionGrid">
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showTreeLinks}
                              disabled={isMinimalTreeMode}
                              id="showLinkButtons"
                              onChange={(event) => void persistSettings({ showLinkButtons: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showLinkButtonsLabel}</strong>
                                <small>{messages.showLinkButtonsHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showArrayIndexes}
                              disabled={isMinimalTreeMode}
                              id="showArrayIndexes"
                              onChange={(event) => void persistSettings({ showArrayIndexes: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showArrayIndexesLabel}</strong>
                                <small>{messages.showArrayIndexesHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showTreeValues}
                              disabled={isMinimalTreeMode}
                              id="showValues"
                              onChange={(event) => void persistSettings({ showTreeValues: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showValuesLabel}</strong>
                                <small>{messages.showValuesHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showArrayLength}
                              disabled={isMinimalTreeMode}
                              id="showArrayLength"
                              onChange={(event) => void persistSettings({ showArrayLength: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showCountLabel}</strong>
                                <small>{messages.showCountHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`} id="showImagesAuto">
                            <input
                              checked={showTreeImages}
                              disabled={isMinimalTreeMode}
                              id="showImages"
                              onChange={(event) => void persistSettings({ showImages: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showImagesLabel}</strong>
                                <small>{messages.showImagesHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showTypeIcons}
                              disabled={isMinimalTreeMode}
                              id="showTypeIcons"
                              onChange={(event) => void persistSettings({ showTypeIcons: event.target.checked })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showTypeIconsLabel}</strong>
                                <small>{messages.showTypeIconsHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                          <label className={`jmViewerToggleCard toggleCard${isMinimalTreeMode ? ' is-disabled' : ''}`}>
                            <input
                              checked={showFolderIcons}
                              disabled={isMinimalTreeMode}
                              id="showFolderIcons"
                              onChange={(event) => void persistSettings({ treeIconStyle: event.target.checked ? 'folder' : '' })}
                              type="checkbox"
                            />
                            <span className="jmViewerToggleBody toggleCard-body">
                              <span className="jmViewerToggleCopy toggleCard-copy">
                                <strong>{messages.showFolderIconsLabel}</strong>
                                <small>{messages.showFolderIconsHelp}</small>
                              </span>
                              <span className="jmViewerToggleSwitch toggleCard-switch" />
                            </span>
                          </label>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="viewerEmptyState jmViewerEmptyState">
                      <strong>{messages.idleTitle}</strong>
                      <p>{messages.idleBody}</p>
                    </div>
                  )}
                </div>
              </aside>
                </>
              )}
            </section>
          </>
        ) : (
          <section className="viewerHero">
            <div>
              <p className="viewerEyebrow">{messages.eyebrow}</p>
              <h1>{messages.title}</h1>
              <p>{messages.subtitle}</p>
              <div className="viewerStatus">
                {statusText || (viewerState ? messages.statusReady : messages.idleTitle)}
              </div>
            </div>
            <div className="viewerActions">
              <button className="viewerButton" onClick={() => void loadPendingPayload()} type="button">
                {messages.loadPending}
              </button>
              <button className="viewerButton secondary" onClick={() => void openToolkitForCurrentValue()} type="button">
                {messages.openToolkit}
              </button>
              <a className="viewerGhostLink" href="./options.html?source=viewer">{messages.openSettings}</a>
            </div>
          </section>
        )}

        {isIframeMode ? null : (
          <section className={gridClassName}>
          <section className={treeCardClassName} aria-live="polite">
            <div className="viewerCardHeader">
              <div>
                <h2>{messages.treeLabel}</h2>
                <p>{viewerState ? messages.treeHint : messages.idleBody}</p>
              </div>
              {viewerState ? (
                <button
                  className={`viewerButton secondary viewerSearchOpenButton${isIframeMode ? ' isIframeMode' : ''}`}
                  onClick={() => openSearch()}
                  type="button"
                >
                  {messages.pathSearchOpen}
                </button>
              ) : null}
            </div>

            {viewerState ? (
              <>
                <div className="viewerMeta">
                  <div className="viewerMetaBlock">
                    <strong>{messages.formatLabel}</strong>
                    <span>{viewerState.payload.format}</span>
                  </div>
                  <div className="viewerMetaBlock">
                    <strong>{messages.nodesLabel}</strong>
                    <span>{viewerState.nodeCount ?? '...'}</span>
                  </div>
                  <div className="viewerMetaBlock">
                    <strong>{messages.sourceLabel}</strong>
                    <span>{messages[sourceLabelMap[viewerState.source]]}</span>
                  </div>
                </div>
                <div className="jmTree">
                  <div className={`treeRow isRoot${selectedPath.length === 0 ? ' isSelected' : ''}`}>
                    <button className="treeToggle" onClick={() => togglePath([])} type="button">
                      {expandedPaths[rootPathKey] === false ? '▸' : '▾'}
                    </button>
                    <button className="treeSelect" onClick={() => selectPath([])} type="button">
                      <span className="treeKey">{messages.rootLabel}</span>
                      <span className={`treeKind kind-${rootValueInfo?.kind ?? 'undefined'}`}>
                        {rootValueInfo?.kind ?? 'undefined'}
                      </span>
                      <span className="treePreview">{rootValueInfo?.preview ?? ''}</span>
                    </button>
                  </div>
                  {expandedPaths[rootPathKey] === false ? null : (
                    <TreeBranch
                      expandedPaths={expandedPaths}
                      isSelected={(path) => getViewerPathKey(path) === getViewerPathKey(selectedPath)}
                      onSelect={selectPath}
                      onToggle={togglePath}
                      parentPath={[]}
                      shouldSortObjectKeys={shouldSortObjectKeys}
                      value={viewerState.payload.data}
                    />
                  )}
                </div>
              </>
            ) : (
              <div className="viewerPreview">
                {isLauncherMode ? (
                  <div className="viewerEmptyState jmViewerEmptyState viewerLauncherEmptyState">
                    <strong>{messages.idleTitle}</strong>
                    <p>{messages.rawInputHint}</p>
                  </div>
                ) : (
                  <pre>{isIframeMode ? 'Waiting for iframe payload...' : '{}'}</pre>
                )}
              </div>
            )}
          </section>

          <section className={editorCardClassName}>
            <div className="viewerCardHeader">
              <div>
                <h2>{messages.inspectorLabel}</h2>
                <p>{viewerState ? messages.inspectorHint : messages.idleBody}</p>
              </div>
            </div>

            {viewerState ? (
              <>
                {isIframeMode ? (
                  <div className="viewerInspectorMeta">
                    <label className="viewerInspectorRow">
                      <span className="viewerInspectorLabel">{messages.pathLabel}</span>
                      <div className="viewerInspectorInputWrap">
                        <input
                          className="viewerInspectorInput"
                          readOnly
                          spellCheck={false}
                          type="text"
                          value={selectedPathLabel}
                        />
                        <button
                          className="viewerInlineAction"
                          onClick={() => void copyText(selectedPathLabel, messages.pathCopied)}
                          type="button"
                        >
                          {messages.copyPath}
                        </button>
                      </div>
                    </label>
                    <div className="viewerInspectorRow">
                      <span className="viewerInspectorLabel">{messages.kindLabel}</span>
                      <div className="viewerInspectorKindRow">
                        <span className={`treeKind kind-${selectedKind}`}>{selectedKind}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="viewerMeta viewerMetaCompact">
                    <div className="viewerMetaBlock">
                      <strong>{messages.pathLabel}</strong>
                      <span>{selectedPathLabel}</span>
                    </div>
                    <div className="viewerMetaBlock">
                      <strong>{messages.kindLabel}</strong>
                      <span>{selectedKind}</span>
                    </div>
                  </div>
                )}
                <textarea
                  className="viewerTextarea"
                  onChange={(event) => {
                    setEditorText(event.target.value);
                    if (editorConflict) {
                      setEditorConflict(null);
                      setErrorText('');
                    }
                  }}
                  spellCheck={false}
                  value={editorText}
                />
                <div className="viewerToolbar">
                  <div className="actionButtonSlot viewerActionSlot">
                    <button className="viewerButton" onClick={() => applyCurrentEdit()} type="button">
                      {messages.applyEdit}
                    </button>
                    <div className="undoConfirmPopover" hidden={!editorConflict} id="viewerEditorConflictActions">
                      <span className="undoConfirmMessage">{messages.invalidTypedEdit}</span>
                      <span className="undoConfirmMessage">{editorConflict?.reason || ''}</span>
                      <div className="undoConfirmActions">
                        <button
                          className="viewerButton secondary"
                          onClick={() => ignoreEditorConflict()}
                          type="button"
                        >
                          {messages.ignoreInvalidEdit}
                        </button>
                        <button
                          className="viewerButton"
                          onClick={() => applyEditorConflictAsString()}
                          type="button"
                        >
                          {messages.saveAsString}
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    className="viewerButton secondary"
                    onClick={() => void copyText(selectedPathLabel, messages.pathCopied)}
                    type="button"
                  >
                    {messages.copyPath}
                  </button>
                  <button
                    className="viewerButton secondary"
                    onClick={() => void copyText(editorText, messages.valueCopied)}
                    type="button"
                  >
                    {messages.copyValue}
                  </button>
                </div>
              </>
            ) : (
              <div className="viewerEmptyState">
                <strong>{messages.selectionEmpty}</strong>
                <p>{messages.idleBody}</p>
              </div>
            )}

            {errorText && !editorConflict ? (
              <div className="viewerError">
                <div>{errorText}</div>
              </div>
            ) : null}
          </section>
        </section>
        )}

        {viewerState ? (
          <div
            aria-hidden={isSearchOpen ? 'false' : 'true'}
            className={isSearchOpen ? 'is-visible' : ''}
            hidden={!isSearchOpen}
            id="pathSearchOverlay"
            inert={!isSearchOpen}
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                closeSearch();
              }
            }}
            role="presentation"
          >
            <section
              aria-labelledby="pathSearchTitle"
              aria-modal="true"
              id="pathSearchDialog"
              role="dialog"
            >
              <div className="pathSearchDialog-head">
                <div className="pathSearchDialog-copy">
                  <strong id="pathSearchTitle">{messages.pathSearchTitle}</strong>
                  <span>{messages.pathSearchHint}</span>
                </div>
                <button
                  className="iconButton iconButton--close"
                  id="pathSearchClose"
                  onClick={() => closeSearch()}
                  title={messages.pathSearchClose}
                  type="button"
                >
                  <span aria-hidden="true">×</span>
                  <span className="srOnly">{messages.pathSearchClose}</span>
                </button>
              </div>
              <div className="pathSearchDialog-body">
                <div
                  aria-label={messages.pathSearchLabel}
                  className="pathSearchMode"
                  id="pathSearchMode"
                  role="radiogroup"
                >
                  <button
                    aria-checked={pathSearchMode === 'key'}
                    className={`pathSearchModeButton${pathSearchMode === 'key' ? ' is-active' : ''}`}
                    data-path-search-mode="key"
                    onClick={() => switchSearchMode('key')}
                    role="radio"
                    type="button"
                  >
                    {messages.pathSearchModeKey}
                  </button>
                  <button
                    aria-checked={pathSearchMode === 'value'}
                    className={`pathSearchModeButton${pathSearchMode === 'value' ? ' is-active' : ''}`}
                    data-path-search-mode="value"
                    onClick={() => switchSearchMode('value')}
                    role="radio"
                    type="button"
                  >
                    {messages.pathSearchModeValue}
                  </button>
                </div>
                <label className="srOnly" htmlFor="pathSearchInput">{messages.pathSearchLabel}</label>
                <input
                  autoCapitalize="off"
                  autoComplete="off"
                  autoFocus
                  className="pathSearchInput"
                  id="pathSearchInput"
                  ref={searchInputRef}
                  onChange={(event) => setPathSearchQuery(event.target.value)}
                  onInput={(event) => setPathSearchQuery((event.target as HTMLInputElement).value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      closeSearch();
                      return;
                    }

                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActiveSearchIndex((current) => (
                        pathSearchMatches.length > 0 ? (current + 1) % pathSearchMatches.length : current
                      ));
                      return;
                    }

                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActiveSearchIndex((current) => (
                        pathSearchMatches.length > 0 ? (current - 1 + pathSearchMatches.length) % pathSearchMatches.length : current
                      ));
                      return;
                    }

                    if (event.key === 'Enter' && pathSearchMatches[activeSearchIndex]) {
                      event.preventDefault();
                      selectSearchMatch(pathSearchMatches[activeSearchIndex].path);
                    }
                  }}
                  placeholder={searchPlaceholder}
                  spellCheck={false}
                  type="search"
                  value={pathSearchQuery}
                />
                <div className="pathSearchMeta" id="pathSearchMeta">
                  {debouncedPathSearchQuery.trim()
                    ? messages.pathSearchResultCount.replace('{count}', String(pathSearchMatches.length))
                    : messages.pathSearchHistory}
                </div>
                <div
                  className={`pathSearchEmpty${debouncedPathSearchQuery.trim() || pathSearchHistory.length === 0 ? ' is-visible' : ''}`}
                  id="pathSearchEmpty"
                >
                  {debouncedPathSearchQuery.trim()
                    ? (pathSearchMatches.length > 0 ? '' : messages.pathSearchEmpty)
                    : (pathSearchHistory.length > 0 ? '' : messages.pathSearchHistoryEmpty)}
                </div>
                <div
                  className="pathSearchHistory"
                  hidden={Boolean(debouncedPathSearchQuery.trim()) || pathSearchHistory.length === 0}
                  id="pathSearchHistory"
                >
                  {pathSearchHistory.map((entry) => (
                    <button
                      className="pathSearchHistoryButton"
                      key={`${entry.mode}:${entry.query}`}
                      onClick={() => {
                        setPathSearchMode(entry.mode);
                        writeViewerSearchMode(entry.mode);
                        setPathSearchQuery(entry.query);
                      }}
                      type="button"
                    >
                      <span className="pathSearchHistoryMode">
                        {entry.mode === 'value' ? messages.pathSearchModeValueShort : messages.pathSearchModeKeyShort}
                      </span>
                      <span>{entry.query}</span>
                    </button>
                  ))}
                </div>
                <div
                  aria-label={messages.pathSearchResults}
                  className="pathSearchResults"
                  id="pathSearchResults"
                  role="listbox"
                >
                  {debouncedPathSearchQuery.trim() && pathSearchMatches.length > 0 ? pathSearchMatches.map((match, index) => {
                    const matchKey = getViewerPathKey(match.path);
                    return (
                      <button
                        aria-selected={index === activeSearchIndex}
                        className={`pathSearchResult${index === activeSearchIndex ? ' is-active' : ''}`}
                        data-index={index}
                        data-path={match.formattedPath}
                        key={matchKey}
                        onClick={() => selectSearchMatch(match.path)}
                        onMouseEnter={() => setActiveSearchIndex(index)}
                        role="option"
                        type="button"
                      >
                        <span className="pathSearchResultPath">{match.formattedPath}</span>
                        <span className="pathSearchResultMeta">
                          <span className="pathSearchResultType">{match.kind}</span>
                          <span className="pathSearchResultValue">{match.preview}</span>
                        </span>
                      </button>
                    );
                  }) : null}
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {isIframeMode && previewImageSrc ? (
          <div
            aria-hidden={false}
            className="viewerToolkitModal viewerImagePreviewModal"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setPreviewImageSrc(null);
              }
            }}
            role="presentation"
          >
            <section
              aria-label={messages.imagePreviewTitle}
              aria-modal="true"
              className="viewerToolkitDialog viewerImagePreviewDialog"
              role="dialog"
            >
              <div className="viewerToolkitDialogHeader">
                <div>
                  <p className="viewerEyebrow viewerEyebrowCompact">{messages.showImagesLabel}</p>
                  <h2>{messages.imagePreviewTitle}</h2>
                  <p>{previewImageSrc}</p>
                </div>
                <button className="viewerButton secondary" onClick={() => setPreviewImageSrc(null)} type="button">
                  {messages.imagePreviewClose}
                </button>
              </div>
              <div className="viewerImagePreviewStage">
                <img alt="" className="viewerImagePreviewLarge" src={previewImageSrc} />
              </div>
            </section>
          </div>
        ) : null}

        {isIframeMode && isToolkitOpen ? (
          <div
            aria-hidden={false}
            className="viewerToolkitModal"
            onClick={(event) => {
              if (event.target === event.currentTarget) {
                setIsToolkitOpen(false);
              }
            }}
            role="presentation"
          >
            <section
              aria-label={messages.openToolkit}
              aria-modal="true"
              className="viewerToolkitDialog viewerToolkitDialogExpanded"
              role="dialog"
            >
              <div className="viewerToolkitDialogHeader">
                <div>
                  <p className="viewerEyebrow viewerEyebrowCompact">{messages.quickToolsLabel}</p>
                  <h2>{messages.openToolkit}</h2>
                </div>
                <button className="viewerButton secondary" onClick={() => setIsToolkitOpen(false)} type="button">
                  {messages.toolkitClose}
                </button>
              </div>
              <div className="viewerToolkitDialogBody">
                <iframe className="viewerToolkitFrame" src="./transform-toolkit.html?embedded=1" title={messages.openToolkit} />
              </div>
            </section>
          </div>
        ) : null}

        {isIframeMode && isCollectionDialogOpen ? (
          <div
            aria-hidden={false}
            className="viewerToolkitModal viewerCollectionModal"
            onClick={(event) => {
              if (event.target === event.currentTarget && !collectionDialogSaving) {
                closeCollectionDialog();
              }
            }}
            role="presentation"
          >
            <section
              aria-label={messages.collectionDialogTitle}
              aria-modal="true"
              className="viewerToolkitDialog viewerCollectionDialog"
              role="dialog"
            >
              <div className="viewerToolkitDialogHeader viewerCollectionDialogHeader">
                <div>
                  <p className="viewerEyebrow viewerEyebrowCompact">{messages.collectionButtonLabel}</p>
                  <h2>{messages.collectionDialogTitle}</h2>
                  <p>{messages.collectionDialogSubtitle}</p>
                </div>
                <button className="viewerButton secondary" disabled={collectionDialogSaving} onClick={() => closeCollectionDialog()} type="button">
                  {messages.collectionCancel}
                </button>
              </div>
              <form
                className="viewerCollectionDialogBody"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveCollectionDialog();
                }}
              >
                <label className="viewerCollectionField">
                  <span>{messages.collectionTitleLabel}</span>
                  <input
                    className="viewerInspectorInput"
                    id="collectionTitleInput"
                    onChange={(event) => setCollectionDialogTitle(event.target.value)}
                    placeholder={formatViewerSourceTitle(currentSourceUrl, detachedSourcePathLabel)}
                    spellCheck={false}
                    type="text"
                    value={collectionDialogTitle}
                  />
                </label>
                <label className="viewerCollectionField">
                  <span>{messages.collectionCollectionLabel}</span>
                  <select
                    className="viewerInspectorInput viewerCollectionSelect"
                    id="collectionSelect"
                    onChange={(event) => {
                      setCollectionDialogCollection(event.target.value);
                      setCollectionDialogError('');
                    }}
                    value={collectionDialogCollection}
                  >
                    {viewerCollectionNames.map((collectionName) => (
                      <option key={collectionName} value={collectionName}>
                        {collectionName}
                      </option>
                    ))}
                    {canCreateNewCollection ? (
                      <option value="__new__">{messages.collectionNewCollectionLabel}</option>
                    ) : null}
                  </select>
                </label>
                {collectionDialogCollection === '__new__' && canCreateNewCollection ? (
                  <label className="viewerCollectionField">
                    <span>{messages.collectionNewCollectionLabel}</span>
                    <input
                      className="viewerInspectorInput"
                      id="collectionNewInput"
                      ref={collectionNewInputRef}
                      onChange={(event) => {
                        setCollectionDialogNewCollection(event.target.value);
                        setCollectionDialogError('');
                      }}
                      placeholder={messages.collectionNewCollectionPlaceholder}
                      spellCheck={false}
                      type="text"
                      value={collectionDialogNewCollection}
                    />
                  </label>
                ) : null}
                <div className="viewerCollectionMeta">
                  <span>{messages.collectionLimitHint}</span>
                  <span>{visibleCollectionCount}/{getViewerCollectionLimit()}</span>
                </div>
                {collectionDialogError ? <div className="viewerCollectionError">{collectionDialogError}</div> : null}
                <div className="viewerCollectionDialogActions">
                  <button
                    className="viewerButton"
                    id="collectionSaveBtn"
                    disabled={collectionDialogSaving}
                    type="submit"
                  >
                    {collectionDialogSaving ? messages.collectionSave : messages.collectionSave}
                  </button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {showLauncherStage ? null : sourceCardSection}
      </div>
    </main>
  );
}
