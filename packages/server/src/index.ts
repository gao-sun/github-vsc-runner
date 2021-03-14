#!/usr/bin/env node

import { createServer } from 'https';
import dotenv from 'dotenv';
import { Server, Socket } from 'socket.io';
import {
  Client,
  ClientType,
  FulfilledClient,
  isRunnerClientEvent,
  isRunnerServerEvent,
  isVscClientEvent,
  RunnerClientEvent,
  RunnerClientStatus,
  RunnerServerEvent,
  VscClientEvent,
  Dictionary,
  RunnerClientOS,
  RunnerClientHttpStreamType,
  RunnerClientHttpRequest,
  RunnerClientHttpResponse,
} from '@github-vsc-runner/core';

import logger from './logger';
import { customAlphabet } from 'nanoid';
import { readFileSync } from 'fs';
import { IncomingMessage, ServerResponse } from 'http';
import { send404, send503 } from './httpProxy';
import { deleteSession, getSession, loadSessionDict, setSession } from './sessionDict';

dotenv.config();
loadSessionDict();

const { SERVER_PORT, SSL_KEY_PATH, SSL_CERT_PATH } = process.env;

const pairedClientType: Record<ClientType, ClientType> = Object.freeze({
  [ClientType.Runner]: ClientType.VSC,
  [ClientType.VSC]: ClientType.Runner,
});

const clientDict: Dictionary<string, Client> = {};
const httpDict: Dictionary<string, [IncomingMessage, ServerResponse]> = {};

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 24);
const server = createServer(
  {
    key: readFileSync(SSL_KEY_PATH || './cert/runner.github-vsc.localhost-key.pem'),
    cert: readFileSync(SSL_CERT_PATH || './cert/runner.github-vsc.localhost.pem'),
  },
  async (req, res) => {
    const domains = req.headers.host?.split('.') ?? [];

    logger.verbose('request from %s', req.socket.remoteAddress);
    logger.verbose('[%s] %s', req.method, req.url);
    logger.verbose('domains=%s', JSON.stringify(domains));

    if (!(domains.length >= 2 && domains[1].startsWith('runner'))) {
      logger.verbose('domains not valid');
      send404(res);
      return;
    }

    const sessionId = domains[0];
    const session = getSession(sessionId);
    const runnerClient = session?.clientDict[ClientType.Runner];

    if (!session) {
      logger.verbose('session not found');
      send404(res);
      return;
    }

    if (!runnerClient) {
      logger.verbose('runner client not found');
      send503(res);
      return;
    }

    const requestUUID = nanoid();

    httpDict[requestUUID] = [req, res];

    const payload: RunnerClientHttpRequest = {
      path: req.url,
      method: req.method,
      headers: req.headers,
    };
    runnerClient.emit(
      RunnerServerEvent.HttpRequest,
      requestUUID,
      RunnerClientHttpStreamType.Start,
      payload,
    );
  },
);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:8080',
      'https://localhost:8080',
      'https://github-vsc.com',
      'https://*.github-vsc.com',
    ],
  },
  transports: ['websocket', 'polling'],
});

const isClientAndEventTypeMatching = (
  clientType: ClientType,
  event: RunnerClientEvent | VscClientEvent | RunnerServerEvent,
): boolean => {
  if (isRunnerClientEvent(event)) {
    return clientType === ClientType.Runner;
  }

  if (isVscClientEvent(event)) {
    return clientType === ClientType.VSC;
  }

  if (isRunnerServerEvent(event)) {
    return true;
  }

  return false;
};

const isEventValid = (
  client: Client,
  event: RunnerClientEvent | VscClientEvent | RunnerServerEvent,
): client is FulfilledClient => {
  if (!client.type) {
    logger.warn('client type not found, skipping');
    return false;
  }

  if (!client.sessionId) {
    logger.warn('session id not found, skipping');
    return false;
  }

  if (!isClientAndEventTypeMatching(client.type, event)) {
    logger.warn("client type doesn't match event type, skipping");
    return false;
  }

  return true;
};

io.on('connection', (socket: Socket) => {
  logger.info('client connected %s', socket.id);

  const client: Client = { socket };
  clientDict[socket.id] = client;

  const setClientType = (sessionId: string, clientType: ClientType, clientOS?: RunnerClientOS) => {
    if (client.type) {
      logger.warn('type for client %s already exists, skipping', client.socket.id);
      return;
    }

    const session = getSession(sessionId);
    if (!session) {
      logger.warn('session %s does not exist or has been terminated, skipping', sessionId);

      if (clientType === ClientType.Runner) {
        socket.emit(VscClientEvent.TerminateSession);
      }

      if (clientType === ClientType.VSC) {
        socket.emit(RunnerServerEvent.SessionTerminated);
      }
      return;
    }

    if (session.clientDict[clientType]) {
      logger.warn('%s for session %s alreays exists, skipping', clientType, sessionId);
      return;
    }

    client.sessionId = sessionId;
    client.type = clientType;
    session.clientDict[clientType] = socket;
    session.clientOSDict[clientType] = clientOS;

    if (clientType === ClientType.VSC) {
      socket.emit(RunnerServerEvent.SessionStarted, sessionId);
    }
  };

  const emitEventToPairedClient = <T extends unknown[]>(
    event: RunnerClientEvent | VscClientEvent,
    ...data: T
  ) => {
    if (!isEventValid(client, event)) {
      logger.warn('%s is invalid for %s client %s, skipping', event, client.type, socket.id);
      return;
    }

    if (!client.sessionId) {
      logger.warn('session id for client %s not found, skipping', socket.id);
      return;
    }

    const session = getSession(client.sessionId);

    if (!session) {
      logger.warn('session %s is not active, skipping', client.sessionId);
      return;
    }

    const pairedType = pairedClientType[client.type];
    const pairedClient = session.clientDict[pairedType];

    if (!pairedClient) {
      logger.warn(
        'paired %s client for session %s not found, skipping',
        pairedType,
        client.sessionId,
      );
      return;
    }

    logger.verbose(
      '[session %s] emit event %s from %s to %s',
      session.id,
      event,
      client.type,
      pairedType,
    );
    pairedClient.emit(event, ...data);
  };

  const emitRunnerClientStatus = (sessionId: string) => {
    const session = getSession(sessionId);

    if (!session) {
      return;
    }

    session.clientDict[ClientType.VSC]?.emit(
      RunnerServerEvent.RunnerStatus,
      session.clientDict[ClientType.Runner]
        ? RunnerClientStatus.Online
        : RunnerClientStatus.Offline,
      session.clientOSDict[ClientType.Runner],
    );
  };

  socket.on(RunnerClientEvent.SetType, (sessionId: string, clientOS: RunnerClientOS) => {
    logger.info('received runner client for session %s', sessionId);
    setClientType(sessionId, ClientType.Runner, clientOS);
    emitRunnerClientStatus(sessionId);
  });

  socket.on(VscClientEvent.SetType, (sessionId?: string) => {
    if (!sessionId) {
      if (client.sessionId) {
        logger.info('session already started for %s, skipping', socket.id);
        return;
      }

      logger.info('received vsc client %s with new session request', socket.id);

      const id = nanoid();
      setSession(id, {
        id,
        clientDict: {} as Dictionary<ClientType, Socket>,
        clientOSDict: {} as Dictionary<ClientType, RunnerClientOS>,
      });

      setClientType(id, ClientType.VSC);
      logger.info('created new session %s', id);

      return;
    }

    logger.info('received vsc client for session %s', sessionId);
    setClientType(sessionId, ClientType.VSC);
  });

  [
    VscClientEvent.Cmd,
    VscClientEvent.ActivateTerminal,
    VscClientEvent.CloseTerminal,
    VscClientEvent.FetchCurrentTerminals,
    VscClientEvent.SetTerminalDimensions,
    VscClientEvent.FSEvent,
    VscClientEvent.FetchCurrentPortForwarding,
    VscClientEvent.SetPortForwarding,
    RunnerClientEvent.Stdout,
    RunnerClientEvent.CurrentTerminals,
    RunnerClientEvent.TerminalClosed,
    RunnerClientEvent.FSEvent,
    RunnerClientEvent.FSEventError,
    RunnerClientEvent.FSTextSearchMatch,
    RunnerClientEvent.CurrentPortForwarding,
  ].forEach((event) => {
    socket.on(event, (...data: unknown[]) => {
      emitEventToPairedClient(event, ...data);
    });
  });

  socket.on(VscClientEvent.CheckRunnerStatus, () => {
    if (!isEventValid(client, VscClientEvent.CheckRunnerStatus)) {
      return;
    }

    emitRunnerClientStatus(client.sessionId);
  });

  socket.on(
    RunnerClientEvent.HttpStream,
    (uuid: string, type: RunnerClientHttpStreamType, data: unknown) => {
      const [req, res] = httpDict[uuid] ?? [];

      logger.debug('http stream [%s], uuid=%s', type, uuid);

      if (!req || !res) {
        logger.warn('no req/res found');
        return;
      }

      // ok for request transportation
      if (type === RunnerClientHttpStreamType.Start) {
        req.on('data', (chunk) =>
          socket.emit(RunnerServerEvent.HttpRequest, uuid, RunnerClientHttpStreamType.Data, chunk),
        );
        req.once('end', () =>
          socket.emit(RunnerServerEvent.HttpRequest, uuid, RunnerClientHttpStreamType.End),
        );
        return;
      }

      if (type === RunnerClientHttpStreamType.Response) {
        const { status, headers } = data as RunnerClientHttpResponse;
        res.statusCode = status ?? 200;
        Object.entries(headers).forEach(([key, value]) => value && res.setHeader(key, value));
        return;
      }

      if (type === RunnerClientHttpStreamType.Data) {
        res.write(data);
        return;
      }

      if (type === RunnerClientHttpStreamType.End) {
        res.end();
      }

      if (type === RunnerClientHttpStreamType.Error) {
        send503(res, data);
      }

      delete httpDict[uuid];
    },
  );

  socket.on(VscClientEvent.TerminateSession, () => {
    if (!isEventValid(client, VscClientEvent.TerminateSession)) {
      return;
    }

    logger.warn('vsc client requested to terminate session', client.sessionId);
    emitEventToPairedClient(VscClientEvent.TerminateSession);
    deleteSession(client.sessionId);
  });

  socket.on('disconnect', () => {
    logger.warn('client disconnected %s', client.socket.id);

    if (client.type && client.sessionId) {
      logger.info('removing session %s to client %s id mapping', client.sessionId, client.type);

      const session = getSession(client.sessionId);

      if (session) {
        delete session.clientDict[client.type];

        if (client.type === ClientType.Runner) {
          logger.warn('runner client disconnected, terminating session');
          const pairedClient = session.clientDict[pairedClientType[ClientType.Runner]];
          pairedClient?.emit(RunnerServerEvent.RunnerStatus, RunnerClientStatus.Offline);
          pairedClient?.emit(RunnerServerEvent.SessionTerminated);
          deleteSession(client.sessionId);
        }
      }
    }

    delete clientDict[client.socket.id];
  });
});

const port = SERVER_PORT || 3000;
server.listen(port);
logger.log('info', 'server is listening %d', port);
