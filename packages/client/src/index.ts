#!/usr/bin/env node

import { io, Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import dotenv from 'dotenv';
import {
  Optional,
  RunnerClientEvent,
  TerminalDimensions,
  TerminalOptions,
  VscClientEvent,
} from '@github-vsc-runner/core';

import logger from './logger';

dotenv.config();

const { SERVER_ADDRESS, SESSION_ID, SESSION_OS, HOME, GITHUB_WORKSPACE } = process.env;
const cwd = GITHUB_WORKSPACE || HOME;

if (!SESSION_ID) {
  console.error('missing SESSION_ID from env');
  process.exit(1);
}

console.log(
  `client started with env: SERVER_ADDRESS=${SERVER_ADDRESS} SESSION_ID=${SESSION_ID} SESSION_OS=${SESSION_OS}`,
);

type Terminal = TerminalOptions & {
  ptyProcess: pty.IPty;
};

type Runner = {
  socket: Socket;
  terminals: Terminal[];
};

const socket = io(SERVER_ADDRESS || 'wss://localhost:3000', {
  rejectUnauthorized: process.env.NODE_ENV !== 'development',
});
const runner: Runner = {
  socket,
  terminals: [],
};

const getTerminalById = (terminalId: string): Optional<Terminal> => {
  const terminal = runner.terminals.find(({ id }) => id === terminalId);
  if (!terminal) {
    logger.warn('cannot find terminal %s, skipping', terminalId);
  }
  return terminal;
};

const getTerminalPtyProcessById = (terminalId: string): Optional<pty.IPty> => {
  const terminal = getTerminalById(terminalId);
  if (!terminal) {
    return;
  }

  if (!terminal.ptyProcess) {
    logger.warn('no active pty process for terminal id %s, skipping', terminalId);
    return;
  }
  return terminal.ptyProcess;
};

const closeTerminal = (terminal: Terminal) => {
  terminal.ptyProcess.kill();
};

logger.info('runner client started');

const timeoutHandle = setTimeout(() => {
  logger.warn('cannot connect to runner server in reasonable time');
  socket.disconnect();
  process.exit(1);
}, 20000);

socket.on('connect', () => {
  clearTimeout(timeoutHandle);
  logger.info('connected to runner server with id: %s', socket.id);
  socket.emit(RunnerClientEvent.SetType, SESSION_ID, SESSION_OS);
});

socket.on('disconnect', () => {
  logger.warn('disconnected');
  runner.terminals.forEach((terminal) => closeTerminal(terminal));
});

socket.on(VscClientEvent.ActivateTerminal, (options: TerminalOptions) => {
  logger.info('activating terminal with options:');
  logger.info(JSON.stringify(options, undefined, 2));

  const { id, file, rows, cols } = options;
  const ptyProcess = pty.spawn(file || 'zsh', [], {
    name: 'runner-terminal',
    cols: cols || 80,
    rows: rows || 30,
    cwd,
    env: process.env as Record<string, string>,
  });
  const terminal: Terminal = { ...options, ptyProcess };

  ptyProcess.onData((data) => {
    logger.verbose('pty received data', data);
    socket.emit(RunnerClientEvent.Stdout, id, data);
  });

  ptyProcess.onExit(() => {
    logger.warn('pty for terminal %s on exit', id);
    runner.terminals = runner.terminals.filter(({ id }) => id !== terminal.id);
    socket.emit(RunnerClientEvent.TerminalClosed, id);
  });

  runner.terminals.push(terminal);
});

socket.on(VscClientEvent.FetchCurrentTerminals, () => {
  socket.emit(
    RunnerClientEvent.CurrentTerminals,
    runner.terminals.map(({ ptyProcess, ...rest }) => rest),
  );
});

socket.on(VscClientEvent.Cmd, (terminalId: string, data: unknown) => {
  logger.verbose('on vsc client command %s', String(data));

  const ptyProcess = getTerminalPtyProcessById(terminalId);
  if (!ptyProcess) {
    return;
  }

  ptyProcess.write(String(data));
});

socket.on(
  VscClientEvent.SetTerminalDimensions,
  (terminalId: string, { cols, rows }: TerminalDimensions) => {
    const ptyProcess = getTerminalPtyProcessById(terminalId);
    if (!ptyProcess) {
      return;
    }

    logger.info('setting terminal %s dimensions', terminalId);
    ptyProcess.resize(cols, rows);
  },
);

socket.on(VscClientEvent.CloseTerminal, (terminalId: string) => {
  const terminal = getTerminalById(terminalId);

  if (!terminal) {
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
