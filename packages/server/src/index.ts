import { createServer } from 'http';
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
  Session,
  Dictionary,
} from '@github-vsc-runner/core';

import logger from './logger';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 21);
const server = createServer();
const io = new Server(server, { cors: { origin: ['http://localhost:8080'] } });

const pairedClientType: Record<ClientType, ClientType> = Object.freeze({
  [ClientType.Runner]: ClientType.VSC,
  [ClientType.VSC]: ClientType.Runner,
});

const clientDict: Dictionary<string, Client> = {};
const sessionDict: Dictionary<string, Session> = {};

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

  const setClientType = (sessionId: string, clientType: ClientType) => {
    if (client.type) {
      logger.warn('type for client %s already exists, skipping', client.socket.id);
      return;
    }

    const session = sessionDict[sessionId];
    if (!session) {
      logger.warn('session %s does not exist or has been killed, skipping', sessionId);
      return;
    }

    if (session.clientDict[clientType]) {
      logger.warn('%s for session %s alreays exists, skipping', clientType, sessionId);
      return;
    }

    client.sessionId = sessionId;
    client.type = clientType;
    session.clientDict[clientType] = socket;

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

    const session = sessionDict[client.sessionId];

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

    logger.verbose('[session %s] emit event %s from %s to %s', session.id, client.type, pairedType);
    pairedClient.emit(event, ...data);
  };

  socket.on(RunnerClientEvent.SetType, (sessionId: string) => {
    logger.info('received runner client for session %s', sessionId);
    setClientType(sessionId, ClientType.Runner);
    sessionDict[sessionId]?.clientDict[ClientType.VSC]?.emit(
      RunnerServerEvent.RunnerStatus,
      RunnerClientStatus.Online,
    );
  });

  socket.on(VscClientEvent.SetType, (sessionId?: string) => {
    if (!sessionId) {
      if (client.sessionId) {
        logger.info('session already started for %s, skipping', socket.id);
        return;
      }

      logger.info('received vsc client %s with new session request', socket.id);

      const id = nanoid();
      sessionDict[id] = {
        id,
        clientDict: {} as Dictionary<ClientType, Socket>,
      };

      setClientType(id, ClientType.VSC);
      logger.info('created new session %s', id);
      socket.emit(RunnerServerEvent.SessionStarted, id);

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
    RunnerClientEvent.Stdout,
    RunnerClientEvent.CurrentTerminals,
    RunnerClientEvent.TerminalClosed,
  ].forEach((event) => {
    socket.on(event, (...data: unknown[]) => {
      emitEventToPairedClient(event, ...data);
    });
  });

  socket.on(VscClientEvent.CheckRunnerStatus, () => {
    if (!isEventValid(client, VscClientEvent.CheckRunnerStatus)) {
      return;
    }

    socket.emit(
      RunnerServerEvent.RunnerStatus,
      sessionDict[client.sessionId]?.clientDict[ClientType.Runner]
        ? RunnerClientStatus.Online
        : RunnerClientStatus.Offline,
    );
  });

  socket.on(VscClientEvent.TerminateSession, () => {
    if (!isEventValid(client, VscClientEvent.TerminateSession)) {
      return;
    }

    logger.warn('vsc client requested to terminate session', client.sessionId);
    emitEventToPairedClient(VscClientEvent.TerminateSession);
    delete sessionDict[client.sessionId];
  });

  socket.on('disconnect', () => {
    logger.warn('client disconnected %s', client.socket.id);

    if (client.type && client.sessionId) {
      logger.info('removing session %s to client %s id mapping', client.sessionId, client.type);

      const session = sessionDict[client.sessionId];

      if (session) {
        delete session.clientDict[client.type];

        if (client.type === ClientType.Runner) {
          logger.warn('runner client disconnected, terminating session');
          session.clientDict[pairedClientType[ClientType.Runner]]?.emit(
            RunnerServerEvent.RunnerStatus,
            RunnerClientStatus.Offline,
          );
          delete sessionDict[client.sessionId];
        }
      }
    }

    delete clientDict[client.socket.id];
  });
});

const PORT = 3000;
server.listen(PORT);
logger.log('info', 'server is listening %d', PORT);
