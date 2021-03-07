import { TerminalOptions } from '@github-vsc-runner/core';
import * as pty from 'node-pty';
import { Socket } from 'socket.io-client';

export type Terminal = TerminalOptions & {
  ptyProcess: pty.IPty;
};

export type RunnerSession = {
  socket: Socket;
  terminals: Terminal[];
  portForwarding?: number;
};
