import {
  Optional,
  RunnerClientEvent,
  TerminalDimensions,
  TerminalOptions,
  VscClientEvent,
} from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import * as pty from 'node-pty';
import logger from './logger';
import { RunnerSession, Terminal } from './types';

const getTerminalById = (runner: RunnerSession, terminalId: string): Optional<Terminal> => {
  const terminal = runner.terminals.find(({ id }) => id === terminalId);
  if (!terminal) {
    logger.warn('cannot find terminal %s, skipping', terminalId);
  }
  return terminal;
};

const getTerminalPtyProcessById = (
  runner: RunnerSession,
  terminalId: string,
): Optional<pty.IPty> => {
  const terminal = getTerminalById(runner, terminalId);
  if (!terminal) {
    return;
  }

  if (!terminal.ptyProcess) {
    logger.warn('no active pty process for terminal id %s, skipping', terminalId);
    return;
  }
  return terminal.ptyProcess;
};

export const closeTerminal = (terminal: Terminal): void => {
  terminal.ptyProcess.kill();
};

export const registerTerminalEventHandlers = (
  socket: Socket,
  runner: RunnerSession,
  cwd?: string,
): void => {
  socket.on(VscClientEvent.ActivateTerminal, (options: TerminalOptions) => {
    logger.info('activating terminal with options:');
    logger.info(JSON.stringify(options, undefined, 2));

    const { id, file, rows, cols } = options;
    const ptyProcess = pty.spawn(file || 'zsh', [], {
      name: 'xterm-color',
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

    const ptyProcess = getTerminalPtyProcessById(runner, terminalId);
    if (!ptyProcess) {
      return;
    }

    ptyProcess.write(String(data));
  });

  socket.on(
    VscClientEvent.SetTerminalDimensions,
    (terminalId: string, { cols, rows }: TerminalDimensions) => {
      const ptyProcess = getTerminalPtyProcessById(runner, terminalId);
      if (!ptyProcess) {
        return;
      }

      logger.info('setting terminal %s dimensions', terminalId);
      ptyProcess.resize(cols, rows);
    },
  );

  socket.on(VscClientEvent.CloseTerminal, (terminalId: string) => {
    const terminal = getTerminalById(runner, terminalId);

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
};
