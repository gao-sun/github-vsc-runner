import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import dotenv from 'dotenv';
import { RunnerClientEvent, TerminalOptions, VscClientEvent } from '@github-vsc-runner/core';

import logger from './logger';

dotenv.config();

type Terminal = {
  forClientId: string;
  ptyProcess: pty.IPty;
};

type Runner = {
  socket: Socket;
  terminals: Terminal[];
};

const socket = io(process.env.SERVER_ADDRESS || 'ws://localhost:3000');
const runner: Runner = {
  socket,
  terminals: [],
};

const closeTerminal = ({ ptyProcess, forClientId }: Terminal, removeFromRunner = true) => {
  ptyProcess.kill();
  if (removeFromRunner) {
    runner.terminals = runner.terminals.filter((terminal) => terminal.forClientId === forClientId);
  }
};

logger.info('runner client started');

socket.on('connect', () => {
  logger.info('connected to runner server with id: %s', socket.id);
  socket.emit(RunnerClientEvent.SetType, process.env.SESSION_ID);
});

socket.on('disconnect', () => {
  logger.warn('disconnected');
  runner.terminals.forEach((terminal) => closeTerminal(terminal, false));
  runner.terminals = [];
});

socket.on(
  VscClientEvent.ActivateTerminal,
  (forClientId: string, options?: Partial<TerminalOptions>) => {
    logger.info('activating terminal for client %s with options:', forClientId);
    logger.info(JSON.stringify(options, undefined, 2));

    const { file, rows, cols } = options ?? {};
    const ptyProcess = pty.spawn(file || 'zsh', [], {
      name: 'runner-terminal',
      cols: cols || 80,
      rows: rows || 30,
      cwd: process.env.HOME,
      env: process.env as Record<string, string>,
    });
    const terminal: Terminal = { forClientId, ptyProcess };

    ptyProcess.onData((data) => {
      logger.verbose('pty received data');
      socket.emit(RunnerClientEvent.Stdout, forClientId, data);
    });

    ptyProcess.onExit(() => {
      socket.emit(RunnerClientEvent.TerminalClosed, forClientId);
    });

    runner.terminals.push(terminal);
  },
);

socket.on(VscClientEvent.Cmd, (forClientId: string, data: unknown) => {
  logger.verbose('on vsc client command %s', String(data));
  const terminal = runner.terminals.find((terminal) => terminal.forClientId === forClientId);

  if (!terminal) {
    logger.warn('no active pty process for client id %s, skipping', forClientId);
    return;
  }

  terminal.ptyProcess.write(String(data));
});

socket.on(VscClientEvent.ClientDisconnected, (forClientId: string) => {
  const terminal = runner.terminals.find((terminal) => terminal.forClientId === forClientId);

  if (!terminal) {
    logger.warn('cannot find terminal for client %s, skipping', forClientId);
    return;
  }

  logger.warn('vsc client %s disconnected, closing terminal', forClientId);
  closeTerminal(terminal);
});

socket.on(VscClientEvent.TerminateRunner, () => {
  logger.warn('received termination request');
  socket.disconnect();
  process.exit(0);
});
