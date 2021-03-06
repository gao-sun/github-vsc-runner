import {
  FSFileSearchPayload,
  SearchOptions,
  FSTextSearchPayload,
  FSTextSearchMatch,
  TextSearchComplete,
  FSRange,
} from '@github-vsc-runner/core';
import { promises } from 'fs';
import path from 'path';
import minimatch from 'minimatch';
import logger from '../logger';
import { resolveUri } from './foundation';

const _fileSearch = async (
  root: string,
  pattern: string,
  options: SearchOptions,
  maxResults?: number,
  cwd?: string,
) => {
  const { includes, excludes } = options;
  const files = await promises.readdir(resolveUri(root, cwd));
  const result: string[] = [];

  for (const file of files) {
    const filePath = path.join(root, file);

    if (
      (includes.length && !includes.some((include) => minimatch(filePath, include))) ||
      excludes.some((exclude) => minimatch(filePath, exclude))
    ) {
      continue;
    }

    const stats = await promises.stat(resolveUri(filePath, cwd));
    if (stats.isDirectory()) {
      result.push(
        ...(await _fileSearch(
          filePath,
          pattern,
          options,
          maxResults && maxResults - result.length,
          cwd,
        )),
      );
    }
    if (maxResults && result.length >= maxResults) {
      break;
    }
    if (stats.isFile() && filePath.includes(pattern)) {
      result.push(filePath);
    }
    if (maxResults && result.length >= maxResults) {
      break;
    }
  }

  return result;
};

export const fileSearch = async (
  { pattern, options: { maxResults, ...options } }: FSFileSearchPayload,
  cwd?: string,
): Promise<string[]> => {
  try {
    return await _fileSearch(options.folder, pattern, options, maxResults, cwd);
  } catch (error) {
    logger.warn('error when searching file: %s', error);
  }
  return [];
};

const previewMaxPrefix = 20;
const previewMaxLength = 200;

const _textSearch = async (
  root: string,
  config: FSTextSearchPayload,
  cwd?: string,
  emitMatch?: (match: FSTextSearchMatch) => void,
): Promise<[FSTextSearchMatch[], boolean, number]> => {
  const {
    query,
    options: { includes, excludes, maxResults, maxFileSize, encoding },
  } = config;
  const files = await promises.readdir(resolveUri(root, cwd));
  const result: FSTextSearchMatch[] = [];
  let totalResult = 0;

  for (const file of files) {
    const filePath = path.join(root, file);

    if (
      (includes.length && !includes.some((include) => minimatch(filePath, include))) ||
      excludes.some((exclude) => minimatch(filePath, exclude))
    ) {
      continue;
    }

    const resolvedPath = resolveUri(filePath, cwd);
    const stats = await promises.stat(resolvedPath);

    if (stats.isDirectory()) {
      result.push(...(await _textSearch(filePath, config, cwd, emitMatch))[0]);
    }
    if (maxResults && totalResult > maxResults) {
      break;
    }

    if (stats.isFile()) {
      if (maxFileSize && stats.size > maxFileSize) {
        continue;
      }
      const content = await promises.readFile(
        resolvedPath,
        (encoding ?? 'utf-8') as BufferEncoding,
      );
      const lines = content.split('\n');
      const regExp = new RegExp(getPattern(query), getFlags(query));
      const matchResult: FSTextSearchMatch = {
        path: filePath,
        ranges: [],
        preview: {
          text: '',
          matches: [],
        },
      };

      let previewTextLines = 0;
      let startLineIndex = 0;
      let startCharIndex = 0;
      let endLineIndex = 0;
      let endCharIndex = 0;
      let match;
      do {
        match = regExp.exec(content);
        if (match) {
          totalResult += 1;
          if (maxResults && totalResult > maxResults) {
            break;
          }

          while (startCharIndex + lines[startLineIndex].length < match.index) {
            startCharIndex += lines[startLineIndex].length + 1;
            startLineIndex += 1;
          }

          const endIndex = match.index + match[0].length;
          while (endCharIndex + lines[endLineIndex].length < endIndex) {
            endCharIndex += lines[endLineIndex].length + 1;
            endLineIndex += 1;
          }

          const startPosition = match.index - startCharIndex;
          const endPosition = endIndex - endCharIndex;
          matchResult.ranges.push({
            startLine: startLineIndex,
            startPosition,
            endLine: endLineIndex,
            endPosition,
          });

          // single line preview only
          let previewText = '';
          const previewMatch: FSRange = {
            startLine: previewTextLines,
            startPosition,
            endLine: previewTextLines,
            endPosition: endLineIndex > startLineIndex ? lines[startLineIndex].length : endPosition,
          };

          if (previewMatch.startPosition > previewMaxPrefix) {
            previewText += lines[startLineIndex].slice(startPosition - previewMaxPrefix) + '\n';
            previewMatch.endPosition -= startPosition - previewMaxPrefix;
            previewMatch.startPosition = previewMaxPrefix;
          } else {
            previewText += lines[startLineIndex] + '\n';
          }

          if (previewText.length > previewMaxLength) {
            previewText = previewText.slice(0, previewMaxLength) + '\n';
            previewMatch.endPosition = Math.min(previewMatch.endPosition, previewText.length);
          }

          matchResult.preview.matches.push(previewMatch);
          matchResult.preview.text += previewText;
          previewTextLines += 1;
        }
      } while (match);

      matchResult.preview.text = matchResult.preview.text.slice(0, -1);

      if (matchResult.ranges.length > 0) {
        result.push(matchResult);
        emitMatch?.(matchResult);
      }
    }
    if (maxResults && totalResult > maxResults) {
      break;
    }
  }

  return [result, !!maxResults && totalResult > maxResults, totalResult];
};

const getFlags = ({ isCaseSensitive, isMultiline }: FSTextSearchPayload['query']): string => {
  let result = 'g';

  if (!isCaseSensitive) {
    result += 'i';
  }

  if (isMultiline) {
    result += 'm';
  }

  return result;
};

const getPattern = ({ pattern, isRegExp, isWordMatch }: FSTextSearchPayload['query']): string => {
  let result = pattern;

  if (!isRegExp) {
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
    result = result.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  if (isWordMatch) {
    result = `\\b${result}\\b`;
  }

  return result;
};

export const textSearch = async (
  config: FSTextSearchPayload,
  cwd?: string,
  emitMatch?: (match: FSTextSearchMatch) => void,
): Promise<TextSearchComplete> => {
  logger.verbose('text search with config');
  logger.verbose(JSON.stringify(config));
  const [, limitHit, totalResult] = await _textSearch(
    config.options.folder,
    config,
    cwd,
    emitMatch,
  );
  logger.verbose('search completed: limitHit=%s totalResult=%s', limitHit, totalResult);
  return { limitHit };
};
