import { Socket } from 'socket.io';

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
}

export enum RunnerServerEvent {
  RunnerStatus = 'server-runner-status',
}

export enum VscClientEvent {
  SetType = 'vsc-client',
  ActivateTerminal = 'vsc-activate-terminal',
  Cmd = 'vsc-cmd',
  CheckRunnerStatus = 'vsc-check-runner-status',
  TerminateRunner = 'vsc-terminate-runner',
  ClientDisconnected = 'vsc-client-disconnected',
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
  file: string;
};
