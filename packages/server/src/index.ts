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
} from '@github-vsc-runner/core';

import logger from './logger';

const server = createServer();
const io = new Server(server, { cors: { origin: ['http://localhost:8080'] } });

const clientDict: Dictionary<string, Client> = {};
const sessionIdToRunnerClientId: Dictionary<string, string> = {};
const sessionIdToVscClientIds: Dictionary<string, string[]> = {};

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

    if (clientType === ClientType.Runner) {
      if (sessionIdToRunnerClientId[sessionId]) {
        logger.warn('%s for session %s alreays exists, skipping', clientType, sessionId);
        return;
      }
      client.sessionId = sessionId;
      client.type = clientType;
      sessionIdToRunnerClientId[sessionId] = socket.id;
      return;
    }

    if (clientType === ClientType.VSC) {
      client.sessionId = sessionId;
      client.type = clientType;
      sessionIdToVscClientIds[sessionId] = (sessionIdToVscClientIds[sessionId] ?? []).concat(
        socket.id,
      );
      return;
    }

    logger.warn('%s is invalid for session %s, skipping', clientType, sessionId);
  };

  const emitEventToVscClient = <T extends unknown[]>(
    event: RunnerClientEvent | RunnerServerEvent,
    targetId?: string,
    ...data: T
  ) => {
    if (!isEventValid(client, event)) {
      logger.warn('%s is invalid for %s client %s, skipping', event, client.type, socket.id);
      return;
    }

    sessionIdToVscClientIds[client.sessionId]?.forEach((clientId) => {
      if (!targetId || targetId === clientId) {
        logger.verbose(
          '[session: %s] emit event %s to paired client %s',
          client.sessionId,
          event,
          clientId,
        );
        clientDict[clientId]?.socket.emit(event, ...data);
      }
    });
  };

  const emitEventToRunnerClient = <T extends unknown[]>(
    event: VscClientEvent | RunnerServerEvent,
    ...data: T
  ) => {
    if (!isEventValid(client, event)) {
      logger.warn('%s is invalid for %s client %s, skipping', event, client.type, socket.id);
      return;
    }

    const pairedClientId = sessionIdToRunnerClientId[client.sessionId];
    if (!pairedClientId) {
      logger.warn('session id not found, skipping');
      return;
    }
    clientDict[pairedClientId]?.socket.emit(event, socket.id, ...data);
  };

  socket.on(RunnerClientEvent.SetType, (sessionId: string) => {
    logger.info('received runner client for session %s', sessionId);
    setClientType(sessionId, ClientType.Runner);
  });

  socket.on(VscClientEvent.SetType, (sessionId: string) => {
    logger.info('received vsc client for session %s', sessionId);
    setClientType(sessionId, ClientType.VSC);
  });

  [VscClientEvent.Cmd, VscClientEvent.ActivateTerminal].forEach((event) => {
    socket.on(event, (...data: unknown[]) => {
      emitEventToRunnerClient(event, ...data);
    });
  });

  [RunnerClientEvent.Stdout, RunnerClientEvent.TerminalClosed].forEach((event) => {
    socket.on(event, (targetId?: string, ...data: unknown[]) => {
      emitEventToVscClient(event, targetId, ...data);
    });
  });

  socket.on(VscClientEvent.CheckRunnerStatus, () => {
    if (!isEventValid(client, VscClientEvent.CheckRunnerStatus)) {
      return;
    }

    socket.emit(
      RunnerServerEvent.RunnerStatus,
      sessionIdToRunnerClientId[client.sessionId]
        ? RunnerClientStatus.Online
        : RunnerClientStatus.Offline,
    );
  });

  socket.on('disconnect', () => {
    logger.warn('client disconnected %s', client.socket.id);

    if (client.type && client.sessionId) {
      logger.info('removing session %s to client %s id mapping', client.sessionId, client.type);

      if (client.type === ClientType.Runner) {
        delete sessionIdToRunnerClientId[client.sessionId];
        delete sessionIdToVscClientIds[client.sessionId];
        emitEventToVscClient(RunnerClientEvent.TerminalClosed);
      }

      if (client.type === ClientType.VSC) {
        if (sessionIdToVscClientIds[client.sessionId]) {
          sessionIdToVscClientIds[client.sessionId] = sessionIdToVscClientIds[
            client.sessionId
          ]?.filter((clientId) => clientId === socket.id);
        }
        emitEventToRunnerClient(VscClientEvent.ClientDisconnected, socket.id);
      }
    }

    delete clientDict[client.socket.id];
  });
});

const PORT = 3000;
server.listen(PORT);
logger.log('info', 'server is listening %d', PORT);
