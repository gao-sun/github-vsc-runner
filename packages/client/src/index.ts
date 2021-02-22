import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import dotenv from 'dotenv';
import { RunnerClientEvent, TerminalOptions, VscClientEvent } from '@github-vsc-runner/core';

import logger from './logger';

dotenv.config();

type Terminal = TerminalOptions & {
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

const closeTerminal = (terminal: Terminal, removeFromRunner = true) => {
  terminal.ptyProcess.kill();
  if (removeFromRunner) {
    runner.terminals = runner.terminals.filter(({ id }) => id === terminal.id);
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

socket.on(VscClientEvent.ActivateTerminal, (options: TerminalOptions) => {
  logger.info('activating terminal with options:');
  logger.info(JSON.stringify(options, undefined, 2));

  const { id, file, rows, cols } = options;
  const ptyProcess = pty.spawn(file || 'zsh', [], {
    name: 'runner-terminal',
    cols: cols || 80,
    rows: rows || 30,
    cwd: process.env.HOME,
    env: process.env as Record<string, string>,
  });
  const terminal: Terminal = { ...options, ptyProcess };

  ptyProcess.onData((data) => {
    logger.verbose('pty received data');
    socket.emit(RunnerClientEvent.Stdout, id, data);
  });

  ptyProcess.onExit(() => {
    socket.emit(RunnerClientEvent.TerminalClosed, id);
  });

  runner.terminals.push(terminal);
});

socket.on(VscClientEvent.Cmd, (terminalId: string, data: unknown) => {
  logger.verbose('on vsc client command %s', String(data));
  const terminal = runner.terminals.find(({ id }) => id === terminalId);

  if (!terminal) {
    logger.warn('no active pty process for terminal id %s, skipping', terminalId);
    return;
  }

  terminal.ptyProcess.write(String(data));
});

socket.on(VscClientEvent.CloseTerminal, (terminalId: string) => {
  const terminal = runner.terminals.find(({ id }) => id === terminalId);

  if (!terminal) {
    logger.warn('cannot find terminal %s, skipping', terminalId);
    return;
  }

  logger.warn('closing terminal %s', terminalId);
  closeTerminal(terminal);
});

socket.on(VscClientEvent.TerminateSession, () => {
  logger.warn('received termination request');
  socket.disconnect();
  process.exit(0);
});
