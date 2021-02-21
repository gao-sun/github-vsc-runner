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
  Stdout = 'runner-stdout',
}

export enum RunnerServerEvent {
  RunnerStatus = 'runner-status',
}

export enum VscClientEvent {
  SetType = 'vsc-client',
  Cmd = 'vsc-cmd',
  CheckRunnerStatus = 'vsc-check-runner-status',
}

export type Client = {
  socket: Socket;
  sessionId?: string;
  type?: ClientType;
};

export type FulfilledClient = Required<Client>;
