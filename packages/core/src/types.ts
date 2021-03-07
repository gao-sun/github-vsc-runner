import { OutgoingHttpHeaders } from 'http';
import { IncomingHttpHeaders } from 'http2';
import { Socket } from 'socket.io';

export type Optional<T> = T | undefined;
export type Dictionary<K extends string | number | symbol, V> = { [key in K]: Optional<V> };

export enum RunnerClientStatus {
  Online = 'Online',
  Offline = 'Offline',
}

export enum ClientType {
  Runner = 'Runner',
  VSC = 'VSCode',
}

export enum RunnerClientEvent {
  SetType = 'runner-client',
  Stdout = 'runner-client-stdout',
  TerminalClosed = 'runner-client-terminal-closed',
  CurrentTerminals = 'runner-client-current-terminals',
  FSEvent = 'runner-client-fs-event',
  FSEventError = 'runner-client-fs-event-error',
  FSTextSearchMatch = 'runner-client-fs-text-search-match',
  HttpStream = 'runner-client-http-stream',
  CurrentPortForwarding = 'runner-client-current-port-forwarding',
}

export enum RunnerClientHttpStreamType {
  Start = 'start',
  Response = 'response',
  Data = 'data',
  Error = 'error',
  End = 'end',
}

export type RunnerClientHttpRequest = {
  path?: string;
  method?: string;
  headers?: OutgoingHttpHeaders;
};

export type RunnerClientHttpResponse = {
  status?: number;
  headers: IncomingHttpHeaders;
};

export enum RunnerClientOS {
  Ubuntu_20_04 = 'ubuntu-20.04',
  Ubuntu_18_04 = 'ubuntu-18.04',
  macOS_10_15 = 'macos-10.15',
  Windows_2019 = 'windows-2019',
}

export enum RunnerServerEvent {
  RunnerStatus = 'server-runner-status',
  SessionStarted = 'server-session-started',
  SessionTerminated = 'server-session-terminated',
  HttpRequest = 'server-http-request',
}

export enum VscClientEvent {
  SetType = 'vsc-client',
  TerminateSession = 'vsc-terminate-session',
  ActivateTerminal = 'vsc-activate-terminal',
  FetchCurrentTerminals = 'vsc-fetch-current-terminals',
  SetTerminalDimensions = 'vsc-set-terminal-dimensions',
  CloseTerminal = 'vsc-close-terminal',
  Cmd = 'vsc-cmd',
  CheckRunnerStatus = 'vsc-check-runner-status',
  FSEvent = 'vsc-fs-event',
  FetchCurrentPortForwarding = 'vsc-fetch-current-port-forwarding',
  SetPortForwarding = 'vsc-set-port-forwarding',
}

export type Client = {
  socket: Socket;
  sessionId?: string;
  type?: ClientType;
};

export type FulfilledClient = Required<Client>;

export type TerminalDimensions = {
  rows: number;
  cols: number;
};

export type TerminalOptions = TerminalDimensions & {
  id: string;
  file: string;
};

export type Session = {
  id: string;
  clientDict: Dictionary<ClientType, Socket>;
  clientOSDict: Dictionary<ClientType, RunnerClientOS>;
};

export enum FSEventType {
  Stat = 'Stat',
  ReadDirectory = 'ReadDirectory',
  CreateDirectory = 'CreateDirectory',
  ReadFile = 'ReadFile',
  WriteFile = 'WriteFile',
  Delete = 'Delete',
  Rename = 'Rename',
  Copy = 'Copy',
  FileSearch = 'FileSearch',
  TextSearch = 'TextSearch',
}

export type FSWriteFilePayload = {
  uri: string;
  base64Content: string;
  options: {
    create: boolean;
    overwrite: boolean;
  };
};

export type FSDeleteFilePayload = {
  uri: string;
  options: {
    recursive: boolean;
  };
};

export type FSRenameOrCopyPayload = {
  oldUri: string;
  newUri: string;
  options: { overwrite: boolean };
};

// edited from vscode
export interface SearchOptions {
  folder: string;
  includes: string[];
  excludes: string[];
}

export type FSFileSearchPayload = {
  pattern: string;
  options: { maxResults?: number } & SearchOptions;
};

// exported from vscode
export interface TextSearchQuery {
  pattern: string;
  isMultiline?: boolean;
  isRegExp?: boolean;
  isCaseSensitive?: boolean;
  isWordMatch?: boolean;
}

export interface TextSearchPreviewOptions {
  /**
   * The maximum number of lines in the preview.
   * Only search providers that support multiline search will ever return more than one line in the match.
   */
  matchLines: number;

  /**
   * The maximum number of characters included per line.
   */
  charsPerLine: number;
}

export interface TextSearchOptions extends SearchOptions {
  /**
   * The maximum number of results to be returned.
   */
  maxResults: number;

  /**
   * Options to specify the size of the result text preview.
   */
  previewOptions?: TextSearchPreviewOptions;

  /**
   * Exclude files larger than `maxFileSize` in bytes.
   */
  maxFileSize?: number;

  /**
   * Interpret files using this encoding.
   * See the vscode setting `"files.encoding"`
   */
  encoding?: string;

  /**
   * Number of lines of context to include before each match.
   */
  beforeContext?: number;

  /**
   * Number of lines of context to include after each match.
   */
  afterContext?: number;
}

export type FSTextSearchPayload = {
  query: TextSearchQuery;
  options: TextSearchOptions;
};

export type FSRange = {
  startLine: number;
  startPosition: number;
  endLine: number;
  endPosition: number;
};

export interface FSTextSearchMatchPreview {
  /**
   * The matching lines of text, or a portion of the matching line that contains the match.
   */
  text: string;

  /**
   * The Range within `text` corresponding to the text of the match.
   * The number of matches must match the TextSearchMatch's range property.
   */
  matches: FSRange[];
}

export interface FSTextSearchMatch {
  path: string;
  /**
   * The range of the match within the document, or multiple ranges for multiple matches.
   */
  ranges: FSRange[];
  preview: FSTextSearchMatchPreview;
}

/**
 * Information collected when text search is complete.
 */
export interface TextSearchComplete {
  /**
   * Whether the search hit the limit on the maximum number of search results.
   * `maxResults` on [`TextSearchOptions`](#TextSearchOptions) specifies the max number of results.
   * - If exactly that number of matches exist, this should be false.
   * - If `maxResults` matches are returned and more exist, this should be true.
   * - If search hits an internal limit which is less than `maxResults`, this should be true.
   */
  limitHit?: boolean;
}
