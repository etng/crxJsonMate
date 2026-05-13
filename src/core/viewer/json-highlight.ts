export type JsonHighlightTokenKind = 'plain' | 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';

export interface JsonHighlightToken {
  kind: JsonHighlightTokenKind;
  value: string;
}

const isStructuredKind = (kind: string) => kind === 'array' || kind === 'object';

export const shouldHighlightJsonText = (text: string, kind = '') => {
  const trimmedText = text.trim();
  return (
    isStructuredKind(kind) ||
    kind === 'number' ||
    kind === 'boolean' ||
    kind === 'null' ||
    /^[\s]*[\[{]/.test(text) ||
    /^(?:true|false|null)$/.test(trimmedText) ||
    /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(trimmedText)
  );
};

const getJsonHighlightTokenKind = (
  token: string,
  remainingText: string
): JsonHighlightTokenKind => {
  if (token.startsWith('"') || token.startsWith("'")) {
    return /^\s*:/.test(remainingText) ? 'key' : 'string';
  }

  if (token === 'true' || token === 'false') {
    return 'boolean';
  }

  if (token === 'null') {
    return 'null';
  }

  if (/^[{}\[\]:,]$/.test(token)) {
    return 'punctuation';
  }

  return 'number';
};

const getQuotedTokenEnd = (text: string, startIndex: number) => {
  const quote = text[startIndex];
  let escaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    if (char === '\n' || char === '\r') {
      return index;
    }
  }

  return text.length;
};

const isTokenStartBoundary = (text: string, index: number) => (
  index === 0 || /[\s\[{[:,]/.test(text[index - 1] || '')
);

const isTokenEndBoundary = (text: string, index: number) => (
  index >= text.length || /[\s\]}:,]/.test(text[index] || '')
);

const pushPlainToken = (
  tokens: JsonHighlightToken[],
  value: string
) => {
  if (!value) {
    return;
  }

  const previousToken = tokens[tokens.length - 1];
  if (previousToken?.kind === 'plain') {
    previousToken.value += value;
    return;
  }

  tokens.push({ kind: 'plain', value });
};

export const getJsonHighlightTokens = (
  text: string,
  enabled: boolean
): JsonHighlightToken[] => {
  if (!enabled || !text) {
    return [{ kind: 'plain', value: text || ' ' }];
  }

  const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/;
  const literalPattern = /^(?:true|false|null)\b/;
  const tokens: JsonHighlightToken[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (char === '"' || char === "'") {
      const endIndex = getQuotedTokenEnd(text, index);
      const value = text.slice(index, endIndex);
      tokens.push({
        kind: getJsonHighlightTokenKind(value, text.slice(endIndex)),
        value
      });
      index = endIndex;
      continue;
    }

    const remainingText = text.slice(index);
    const numberMatch = isTokenStartBoundary(text, index)
      ? remainingText.match(numberPattern)
      : null;
    if (numberMatch && isTokenEndBoundary(text, index + numberMatch[0].length)) {
      tokens.push({
        kind: 'number',
        value: numberMatch[0]
      });
      index += numberMatch[0].length;
      continue;
    }

    const literalMatch = isTokenStartBoundary(text, index)
      ? remainingText.match(literalPattern)
      : null;
    if (literalMatch && isTokenEndBoundary(text, index + literalMatch[0].length)) {
      tokens.push({
        kind: literalMatch[0] === 'null' ? 'null' : 'boolean',
        value: literalMatch[0]
      });
      index += literalMatch[0].length;
      continue;
    }

    if (/^[{}\[\]:,]$/.test(char)) {
      tokens.push({
        kind: 'punctuation',
        value: char
      });
      index += 1;
      continue;
    }

    pushPlainToken(tokens, char);
    index += 1;
  }

  return tokens.length > 0 ? tokens : [{ kind: 'plain', value: ' ' }];
};
