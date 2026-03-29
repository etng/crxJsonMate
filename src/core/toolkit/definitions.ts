import JSON5 from 'json5';
import type { JsonMateSettings } from '@/core/settings/schema';

export interface ToolkitTool {
  id: string;
  title: string;
  summary: string;
  exampleInput: string;
  exampleOutput: string;
  encode: (input: string) => string;
  decode: (input: string) => string;
  preferEncode?: boolean;
}

const encodeBase64 = (value: string) => {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const decodeBase64 = (value: string) => {
  const binary = atob(String(value ?? ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

const ecXmlNumber = (input: string, radix: number) => {
  if (!input) {
    return '';
  }

  const prefix = radix === 16 ? 'x' : '';
  return [...input].map((char) => {
    const code = char === ' ' ? 160 : char.charCodeAt(0);
    return `&#${prefix}${code.toString(radix)};`;
  }).join('');
};

const escapeXml = (input: string) => String(input)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/ /g, '&nbsp;');

const unescapeXml = (input: string) => String(input)
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&nbsp;/g, ' ')
  .replace(/&amp;/g, '&');

const decodeXmlNumbers = (input: string, radix: number, pattern: RegExp) =>
  String(input).replace(pattern, (_, value) => String.fromCharCode(parseInt(value, radix)));

const collectSearchParams = (searchParams: URLSearchParams) => {
  const output: Record<string, string | string[]> = {};

  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    output[key] = values.length > 1 ? values : values[0] || '';
  }

  return output;
};

const encodeBase64Url = (input: string) => encodeBase64(String(input))
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const decodeBase64Url = (input: string) => {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const paddingLength = normalized.length % 4 === 0 ? 0 : 4 - (normalized.length % 4);
  return decodeBase64(normalized + '='.repeat(paddingLength));
};

const formatTimestampAsIso = (input: string) => {
  const numericValue = Number(String(input).trim());
  if (!Number.isFinite(numericValue)) {
    throw new Error('Timestamp must be a finite number');
  }

  const milliseconds = Math.abs(numericValue) < 1e12 ? numericValue * 1000 : numericValue;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Timestamp is not a valid date');
  }

  return date.toISOString();
};

const formatIsoAsTimestamp = (input: string) => {
  const milliseconds = Date.parse(String(input).trim());
  if (Number.isNaN(milliseconds)) {
    throw new Error('Date text must be a valid ISO time string');
  }

  return String(milliseconds);
};

const toggleBooleanText = (input: string) => {
  const normalized = String(input).trim().toLowerCase();
  if (normalized === 'true') {
    return 'false';
  }
  if (normalized === 'false') {
    return 'true';
  }
  throw new Error('Value must be true or false');
};

const looseJsonParse = (input: string) => JSON5.parse(input);

export const toolkitTools: ToolkitTool[] = [
  {
    id: 'tran_uri',
    title: 'URL Component',
    summary: 'Encode or decode a URL component with percent-encoding.',
    exampleInput: 'http://www.web.com/page?q=word',
    exampleOutput: 'http%3A%2F%2Fwww.web.com%2Fpage%3Fq%3Dword',
    encode: encodeURIComponent,
    decode: decodeURIComponent
  },
  {
    id: 'tran_xml10',
    title: 'XML Entity Decimal',
    summary: 'Convert plain text to decimal XML entities and back.',
    exampleInput: 'XML Char 10 decimal',
    exampleOutput: '&#88;&#77;&#76;&#160;&#67;&#104;&#97;&#114;&#160;&#49;&#48;&#160;&#100;&#101;&#99;&#105;&#109;&#97;&#108;',
    encode: (input) => ecXmlNumber(input, 10),
    decode: (input) => decodeXmlNumbers(input, 10, /&#(\d+);/g)
  },
  {
    id: 'tran_xml16',
    title: 'XML Entity Hex',
    summary: 'Convert plain text to hexadecimal XML entities and back.',
    exampleInput: 'XML Char 16 HEX',
    exampleOutput: '&#x58;&#x4d;&#x4c;&#xa0;&#x43;&#x68;&#x61;&#x72;&#xa0;&#x31;&#x36;&#xa0;&#x48;&#x45;&#x58;',
    encode: (input) => ecXmlNumber(input, 16),
    decode: (input) => decodeXmlNumbers(input, 16, /&#x([a-fA-F0-9]+);/g)
  },
  {
    id: 'tran_xmlsc',
    title: 'HTML Escape',
    summary: 'Escape or unescape HTML-sensitive characters.',
    exampleInput: '<p>"123\'</p>',
    exampleOutput: '&lt;p&gt;&quot;123\'&lt;/p&gt;',
    encode: escapeXml,
    decode: unescapeXml
  },
  {
    id: 'tran_base64',
    title: 'Base64',
    summary: 'Encode or decode Unicode text with standard Base64.',
    exampleInput: 'abcdefg12345',
    exampleOutput: 'YWJjZGVmZzEyMzQ1',
    encode: encodeBase64,
    decode: decodeBase64
  },
  {
    id: 'tran_base64url',
    title: 'Base64URL',
    summary: 'Encode or decode URL-safe Base64 text.',
    exampleInput: 'json mate',
    exampleOutput: 'anNvbiBtYXRl',
    encode: encodeBase64Url,
    decode: decodeBase64Url
  },
  {
    id: 'tran_sqe',
    title: 'JavaScript String Escape',
    summary: 'Escape or unescape quotes for JavaScript string literals.',
    exampleInput: `"ab'1234'cd"`,
    exampleOutput: `\\"ab\\'1234\\'cd\\"`,
    encode: (input) => JSON.stringify(String(input)).slice(1, -1).replace(/'/g, "\\'"),
    decode: (input) => JSON.parse(`"${String(input).replace(/\\'/g, "'").replace(/"/g, '\\"')}"`)
  },
  {
    id: 'tran_jshex',
    title: 'Unicode Escape',
    summary: 'Convert characters to JavaScript \\uXXXX escapes and back.',
    exampleInput: 'JS string HEX',
    exampleOutput: '\\u004a\\u0053\\u0020\\u0073\\u0074\\u0072\\u0069\\u006e\\u0067\\u0020\\u0048\\u0045\\u0058',
    encode: (input) => [...String(input)].map((char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''),
    decode: (input) => String(input).replace(/\\u([a-fA-F0-9]{4})/g, (_, value) => String.fromCharCode(parseInt(value, 16)))
  },
  {
    id: 'tran_uth',
    title: 'Camel Case',
    summary: 'Convert snake_case or kebab-case text to camelCase and back.',
    exampleInput: 'THE_VAR_NAME_IN_CODE',
    exampleOutput: 'theVarNameInCode',
    encode: (input) => {
      const separator = input.includes('-') ? '-' : '_';
      return String(input).split(separator).map((segment, index) => {
        const lower = segment.toLowerCase();
        return index === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
      }).join('');
    },
    decode: (input) => String(input).replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`)
  },
  {
    id: 'tran_ltu',
    title: 'Letter Case',
    summary: 'Switch between uppercase and lowercase text.',
    exampleInput: 'abcdefghijklmn',
    exampleOutput: 'ABCDEFGHIJKLMN',
    encode: (input) => String(input).toUpperCase(),
    decode: (input) => String(input).toLowerCase()
  },
  {
    id: 'tran_jsonfmt',
    title: 'JSON Format',
    summary: 'Pretty-print JSON on encode and minify it on decode.',
    exampleInput: '{"a":1,"b":[2,3]}',
    exampleOutput: '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    encode: (input) => JSON.stringify(looseJsonParse(input), null, 2),
    decode: (input) => JSON.stringify(looseJsonParse(input)),
    preferEncode: true
  },
  {
    id: 'tran_time_epoch',
    title: 'Time and Timestamp',
    summary: 'Convert ISO time text to a timestamp, or turn a timestamp back into ISO time.',
    exampleInput: '2026-03-21T18:48:00Z',
    exampleOutput: '1774118880000',
    encode: formatIsoAsTimestamp,
    decode: formatTimestampAsIso
  },
  {
    id: 'tran_boolean_toggle',
    title: 'Boolean Toggle',
    summary: 'Flip true and false text values in either direction.',
    exampleInput: 'true',
    exampleOutput: 'false',
    encode: toggleBooleanText,
    decode: toggleBooleanText
  },
  {
    id: 'tran_queryjson',
    title: 'Query String JSON',
    summary: 'Expand a query string into JSON or rebuild the query string from JSON.',
    exampleInput: 'tab=viewer&tag=json&tag=mate',
    exampleOutput: '{\n  "tab": "viewer",\n  "tag": [\n    "json",\n    "mate"\n  ]\n}',
    encode: (input) => JSON.stringify(collectSearchParams(new URLSearchParams(String(input).replace(/^\?/, ''))), null, 2),
    decode: (input) => {
      const config = looseJsonParse(input) as Record<string, unknown>;
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(config || {})) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          searchParams.append(key, item == null ? '' : String(item));
        }
      }
      return searchParams.toString();
    },
    preferEncode: true
  },
  {
    id: 'tran_uto',
    title: 'URL Parts JSON',
    summary: 'Expand a URL into structured JSON or rebuild the URL from that JSON.',
    exampleInput: 'https://root:123@w.a.cn:81/d/p?a=3&b=d&c=1&c=2#i',
    exampleOutput: '{ "protocol": "https", "hostname": "w.a.cn" }',
    preferEncode: true,
    encode: (input) => {
      const url = new URL(input);
      return JSON.stringify({
        href: url.href,
        protocol: url.protocol.replace(/:$/, ''),
        username: url.username,
        password: url.password,
        hostname: url.hostname,
        port: url.port,
        pathname: url.pathname,
        searchParams: collectSearchParams(url.searchParams),
        hash: url.hash.replace(/^#/, '')
      }, null, 2);
    },
    decode: (input) => {
      const config = looseJsonParse(input) as Record<string, any>;
      const allowed = ['ftp', 'file', 'http', 'https', 'ws', 'wss'];
      if (!allowed.includes(config.protocol)) {
        throw new Error(`Protocol must be one of: ${allowed.join(', ')}`);
      }

      const url = config.protocol === 'file'
        ? new URL('file:///')
        : new URL(`${config.protocol}://json-mate.local`);

      if (config.protocol !== 'file') {
        url.username = config.username || '';
        url.password = config.password || '';
        url.hostname = config.hostname || '';
        url.port = config.port || '';
      }

      url.protocol = `${config.protocol}:`;
      url.pathname = config.pathname || '/';
      url.hash = config.hash ? `#${config.hash}` : '';
      url.search = '';

      for (const [key, value] of Object.entries(config.searchParams || {})) {
        const values = Array.isArray(value) ? value : [value];
        for (const item of values) {
          url.searchParams.append(key, item == null ? '' : String(item));
        }
      }

      return url.toString();
    }
  }
];

const localizedToolCopy = {
  'zh-cn': {
    tran_uri: { title: 'URL 组件', summary: '对 URL 组件进行编码或解码。', exampleInput: 'https://example.com/search?q=json mate', exampleOutput: 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Djson%20mate' },
    tran_xml10: { title: 'XML 十进制实体', summary: '在普通文本和十进制 XML 实体之间转换。', exampleInput: 'XML 十进制实体', exampleOutput: '&#88;&#77;&#76;&#160;&#21313;&#36827;&#21046;&#23454;&#20307;' },
    tran_xml16: { title: 'XML 十六进制实体', summary: '在普通文本和十六进制 XML 实体之间转换。', exampleInput: 'XML 十六进制实体', exampleOutput: '&#x58;&#x4d;&#x4c;&#xa0;&#x5341;&#x516d;&#x8fdb;&#x5236;&#x5b9e;&#x4f53;' },
    tran_xmlsc: { title: 'HTML 转义', summary: '转义或还原 HTML 敏感字符。', exampleInput: '<p>"123\'</p>', exampleOutput: '&lt;p&gt;&quot;123\'&lt;/p&gt;' },
    tran_base64: { title: 'Base64', summary: '对 Unicode 文本进行标准 Base64 编解码。' },
    tran_base64url: { title: 'Base64URL', summary: '对 URL 安全的 Base64 文本进行编解码。' },
    tran_sqe: { title: 'JavaScript 字符串转义', summary: '为 JavaScript 字符串字面量转义或还原引号。', exampleInput: '"ab\'1234\'cd"', exampleOutput: '\\"ab\\\'1234\\\'cd\\"' },
    tran_jshex: { title: 'Unicode 转义', summary: '在字符和 JavaScript \\uXXXX 转义之间转换。', exampleInput: 'Unicode 转义', exampleOutput: '\\u0055\\u006e\\u0069\\u0063\\u006f\\u0064\\u0065\\u0020\\u8f6c\\u4e49' },
    tran_uth: { title: '驼峰命名', summary: '在 snake_case、kebab-case 和 camelCase 之间转换。' },
    tran_ltu: { title: '字母大小写', summary: '在大写文本和小写文本之间切换。' },
    tran_jsonfmt: { title: 'JSON 格式化', summary: '编码时格式化 JSON，解码时压缩 JSON。' },
    tran_time_epoch: { title: '时间与时间戳', summary: '在 ISO 时间文本和时间戳之间互转。' },
    tran_boolean_toggle: { title: '布尔切换', summary: '在 true 和 false 之间快速切换。' },
    tran_queryjson: { title: 'Query String 转 JSON', summary: '把查询字符串展开为 JSON，或从 JSON 重新生成查询字符串。' },
    tran_uto: { title: 'URL 拆解 JSON', summary: '把 URL 拆成结构化 JSON，或从该 JSON 重建 URL。' }
  },
  'zh-tw': {
    tran_uri: { title: 'URL 元件', summary: '對 URL 元件進行編碼或解碼。', exampleInput: 'https://example.com/search?q=json mate', exampleOutput: 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Djson%20mate' },
    tran_xml10: { title: 'XML 十進位實體', summary: '在一般文字與十進位 XML 實體之間轉換。', exampleInput: 'XML 十進位實體', exampleOutput: '&#88;&#77;&#76;&#160;&#21313;&#36914;&#20301;&#23526;&#39636;' },
    tran_xml16: { title: 'XML 十六進位實體', summary: '在一般文字與十六進位 XML 實體之間轉換。', exampleInput: 'XML 十六進位實體', exampleOutput: '&#x58;&#x4d;&#x4c;&#xa0;&#x5341;&#x516d;&#x9032;&#x4f4d;&#x5be6;&#x9ad4;' },
    tran_xmlsc: { title: 'HTML 跳脫', summary: '跳脫或還原 HTML 敏感字元。', exampleInput: '<p>"123\'</p>', exampleOutput: '&lt;p&gt;&quot;123\'&lt;/p&gt;' },
    tran_base64: { title: 'Base64', summary: '對 Unicode 文字進行標準 Base64 編解碼。' },
    tran_base64url: { title: 'Base64URL', summary: '對 URL 安全的 Base64 文字進行編解碼。' },
    tran_sqe: { title: 'JavaScript 字串跳脫', summary: '為 JavaScript 字串常值跳脫或還原引號。', exampleInput: '"ab\'1234\'cd"', exampleOutput: '\\"ab\\\'1234\\\'cd\\"' },
    tran_jshex: { title: 'Unicode 跳脫', summary: '在字元與 JavaScript \\uXXXX 跳脫之間轉換。', exampleInput: 'Unicode 跳脫', exampleOutput: '\\u0055\\u006e\\u0069\\u0063\\u006f\\u0064\\u0065\\u0020\\u8df3\\u812b' },
    tran_uth: { title: '駝峰命名', summary: '在 snake_case、kebab-case 與 camelCase 之間轉換。' },
    tran_ltu: { title: '字母大小寫', summary: '在大寫文字與小寫文字之間切換。' },
    tran_jsonfmt: { title: 'JSON 格式化', summary: '編碼時格式化 JSON，解碼時壓縮 JSON。' },
    tran_time_epoch: { title: '時間與時間戳', summary: '在 ISO 時間文字與時間戳之間互轉。' },
    tran_boolean_toggle: { title: '布林切換', summary: '在 true 與 false 之間快速切換。' },
    tran_queryjson: { title: 'Query String 轉 JSON', summary: '把查詢字串展開為 JSON，或從 JSON 重新產生查詢字串。' },
    tran_uto: { title: 'URL 拆解 JSON', summary: '把 URL 拆成結構化 JSON，或從該 JSON 重建 URL。' }
  },
  ja: {
    tran_uri: { title: 'URL コンポーネント', summary: 'URL コンポーネントをパーセントエンコード形式で変換します。', exampleInput: 'https://example.com/search?q=json mate', exampleOutput: 'https%3A%2F%2Fexample.com%2Fsearch%3Fq%3Djson%20mate' },
    tran_xml10: { title: 'XML 10進実体', summary: '通常テキストと 10 進 XML 実体の間で変換します。' },
    tran_xml16: { title: 'XML 16進実体', summary: '通常テキストと 16 進 XML 実体の間で変換します。' },
    tran_xmlsc: { title: 'HTML エスケープ', summary: 'HTML の特殊文字をエスケープまたは復元します。' },
    tran_base64: { title: 'Base64', summary: 'Unicode テキストを標準 Base64 で変換します。' },
    tran_base64url: { title: 'Base64URL', summary: 'URL 安全な Base64 テキストを変換します。' },
    tran_sqe: { title: 'JavaScript 文字列エスケープ', summary: 'JavaScript 文字列リテラル用に引用符をエスケープまたは復元します。' },
    tran_jshex: { title: 'Unicode エスケープ', summary: '文字列と JavaScript の \\uXXXX エスケープ表現を相互変換します。' },
    tran_uth: { title: 'キャメルケース', summary: 'snake_case、kebab-case、camelCase の間で変換します。' },
    tran_ltu: { title: '文字の大文字小文字', summary: '大文字と小文字を切り替えます。' },
    tran_jsonfmt: { title: 'JSON 整形', summary: 'エンコード時は整形、デコード時は圧縮した JSON にします。' },
    tran_time_epoch: { title: '時刻とタイムスタンプ', summary: 'ISO 時刻文字列とタイムスタンプを相互変換します。' },
    tran_boolean_toggle: { title: '真偽値トグル', summary: 'true と false をすばやく切り替えます。' },
    tran_queryjson: { title: 'Query String から JSON', summary: 'クエリ文字列を JSON に展開し、JSON からクエリ文字列を再構築します。' },
    tran_uto: { title: 'URL パーツ JSON', summary: 'URL を構造化 JSON に分解し、その JSON から URL を再構築します。' }
  }
} as const;

export const toolkitToolMap = Object.fromEntries(
  toolkitTools.map((tool) => [tool.id, tool])
) as Record<string, ToolkitTool>;

export const getLocalizedTool = (
  tool: ToolkitTool,
  lang: JsonMateSettings['lang']
): ToolkitTool => ({
  ...tool,
  ...((localizedToolCopy[lang as keyof typeof localizedToolCopy]?.[tool.id as keyof typeof localizedToolCopy['zh-cn']]) || {})
});

export const toolMatchesQuery = (
  tool: ToolkitTool,
  lang: JsonMateSettings['lang'],
  query: string
) => {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  const localizedTool = getLocalizedTool(tool, lang);
  const fallbackTool = lang === 'en' ? null : getLocalizedTool(tool, 'en');

  return [
    tool.id,
    localizedTool.title,
    localizedTool.summary,
    localizedTool.exampleInput,
    localizedTool.exampleOutput,
    fallbackTool?.title,
    fallbackTool?.summary,
    fallbackTool?.exampleInput,
    fallbackTool?.exampleOutput
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
};

export const dedupeToolIds = (items: Array<string | null | undefined>) => [...new Set(items.filter(Boolean))] as string[];
