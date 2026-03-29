export interface JsonMateSettings {
  autoRenderEnabled: boolean;
  lang: 'en' | 'zh-cn' | 'zh-tw' | 'ja';
  panelMode: 'always' | 'leftClick' | 'rightClick' | 'clickButton';
  showTreeValues: boolean;
  showLinkButtons: boolean;
  showTypeIcons: boolean;
  treeIconStyle: string;
  showArrayIndexes: boolean;
  showImages: boolean;
  showImageMode: 'hover' | 'all';
  openViewerMode: 'popup' | 'tab';
  detachedViewerMode: 'popup' | 'tab';
  showArrayLength: boolean;
  showLengthMode: 'array' | 'array-object';
  renderMode: 'rich' | 'smart' | 'dark';
  rememberNodeState: boolean;
  minimalism: boolean;
  showTextFormat: boolean;
  fontFamily: string;
  minimalismTrigger: 'always' | 'largePayloadOnly';
  jsonEngine: 'JM-JSON' | 'JSON';
  sortKey: boolean | number;
  toolkitNavigation: string[];
  contextMenuEnabled: boolean;
  launchCount: number;
  initialized: boolean;
}

export const defaultSettings: JsonMateSettings = {
  autoRenderEnabled: true,
  lang: 'en',
  panelMode: 'leftClick',
  showTreeValues: true,
  showLinkButtons: true,
  showTypeIcons: false,
  treeIconStyle: '',
  showArrayIndexes: false,
  showImages: true,
  showImageMode: 'all',
  openViewerMode: 'tab',
  detachedViewerMode: 'tab',
  showArrayLength: false,
  showLengthMode: 'array',
  renderMode: 'rich',
  rememberNodeState: true,
  minimalism: true,
  showTextFormat: false,
  fontFamily: 'Tahoma',
  minimalismTrigger: 'largePayloadOnly',
  jsonEngine: 'JM-JSON',
  sortKey: 0,
  toolkitNavigation: [],
  contextMenuEnabled: true,
  launchCount: 0,
  initialized: true
};

export const languageOptions: Array<{ value: JsonMateSettings['lang']; label: string }> = [
  { value: 'zh-cn', label: '简体中文' },
  { value: 'zh-tw', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'en', label: 'English' }
];

export const fontOptions = [
  'Tahoma',
  'fantasy',
  'cursive',
  'Microsoft Yahei',
  'Helvetica',
  'Serif',
  'Consolas',
  'monospace'
] as const;
