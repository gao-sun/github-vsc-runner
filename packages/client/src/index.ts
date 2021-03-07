#!/usr/bin/env node

import { io } from 'socket.io-client';
import dotenv from 'dotenv';
import { RunnerClientEvent, VscClientEvent } from '@github-vsc-runner/core';

import logger from './logger';
import { RunnerSession } from './types';
import { closeTerminal, registerTerminalEventHandlers } from './terminal';
import { registerFSEventHandlers } from './fs';
import { registerHttpRequestHandlers } from './httpProxy';

dotenv.config();

const { SERVER_ADDRESS, SESSION_ID, SESSION_OS, GITHUB_WORKSPACE } = process.env;
const cwd = GITHUB_WORKSPACE || process.cwd();

if (!SESSION_ID) {
  logger.error('missing SESSION_ID from env');
  process.exit(1);
}

logger.info(
  `client started with env: SERVER_ADDRESS=${SERVER_ADDRESS} SESSION_ID=***${SESSION_ID.slice(
    -4,
  )} SESSION_OS=${SESSION_OS}`,
);

const socket = io(SERVER_ADDRESS || 'wss://localhost:3000', {
  rejectUnauthorized: process.env.NODE_ENV !== 'development',
  transports: ['websocket'],
});
const runner: RunnerSession = {
  socket,
  terminals: [],
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

socket.on(VscClientEvent.TerminateSession, () => {
  logger.warn('received termination request');
  socket.disconnect();
  process.exit(0);
});

registerTerminalEventHandlers(socket, runner, cwd);
registerFSEventHandlers(socket, cwd);
registerHttpRequestHandlers(socket, runner);
