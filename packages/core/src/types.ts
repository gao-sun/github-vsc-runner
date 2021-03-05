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
}

export enum RunnerClientOS {
  Ubuntu_20_04 = 'ubuntu-20.04',
  Ubuntu_18_04 = 'ubuntu-18.04',
  macOS_11_0 = 'macOS-11.0',
  macOS_10_15 = 'macOS-10.15',
}

export enum RunnerServerEvent {
  RunnerStatus = 'server-runner-status',
  SessionStarted = 'server-session-started',
  SessionTerminated = 'server-session-terminated',
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
  useIgnoreFiles: boolean;
  followSymlinks: boolean;
  useGlobalIgnoreFiles: boolean;
}

export type FSFileSearchPayload = {
  pattern: string;
  options: { maxResults?: number } & SearchOptions;
};
