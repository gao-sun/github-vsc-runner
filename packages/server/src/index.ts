import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import {
  Client,
  ClientType,
  FulfilledClient,
  RunnerClientEvent,
  RunnerClientStatus,
  RunnerServerEvent,
  VscClientEvent,
} from '@github-vsc-runner/types';

import logger from './logger';

const server = createServer();
const io = new Server(server);

const clientDict: Dictionary<string, Client> = {};
const sessionIdToClientId: Record<ClientType, Dictionary<string, string>> = {
  [ClientType.Runner]: {},
  [ClientType.VSC]: {},
};
const pairedClientType: Record<ClientType, ClientType> = {
  [ClientType.Runner]: ClientType.VSC,
  [ClientType.VSC]: ClientType.Runner,
};

const isClientAndEventTypeMatching = (
  clientType: ClientType,
  event: RunnerClientEvent | VscClientEvent,
): boolean => {
  if (Object.values(RunnerClientEvent).find((value) => value === event)) {
    return clientType === ClientType.Runner;
  }

  if (Object.values(VscClientEvent).find((value) => value === event)) {
    return clientType === ClientType.VSC;
  }

  return false;
};

const isEventValid = (
  client: Client,
  event: RunnerClientEvent | VscClientEvent,
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
  clientDict[socket.id] = { socket };

  const setClientType = (sessionId: string, clientType: ClientType) => {
    if (client.type) {
      logger.warn('client type already exists, skipping');
      return;
    }

    if (sessionIdToClientId[clientType][sessionId]) {
      logger.warn('client type for session alreays exists, skipping');
      return;
    }

    client.type = clientType;
    sessionIdToClientId[clientType][sessionId] = socket.id;
  };
  const emitEventToPairedClient = <T>(event: RunnerClientEvent | VscClientEvent, data: T) => {
    if (!isEventValid(client, event)) {
      return;
    }

    const pairedClientId = sessionIdToClientId[pairedClientType[client.type]][client.sessionId];
    if (!pairedClientId) {
      logger.warn('session id not found, skipping');
      return;
    }

    logger.info(
      '[session: %s] emit event %s to paired client %s',
      client.sessionId,
      event,
      pairedClientId,
    );
    clientDict[pairedClientId]?.socket.emit(event, data);
  };

  socket.on(RunnerClientEvent.SetType, (sessionId: string) => {
    logger.info('received runner client for session %s', sessionId);
    setClientType(sessionId, ClientType.Runner);
  });

  socket.on(VscClientEvent.SetType, (sessionId: string) => {
    logger.info('received vsc client for session %s', sessionId);
    setClientType(sessionId, ClientType.VSC);
  });

  socket.on(VscClientEvent.Cmd, (command: unknown) => {
    emitEventToPairedClient(VscClientEvent.Cmd, command);
  });

  socket.on(RunnerClientEvent.Stdout, (data: unknown) => {
    emitEventToPairedClient(RunnerClientEvent.Stdout, data);
  });

  socket.on(VscClientEvent.CheckRunnerStatus, () => {
    if (!isEventValid(client, VscClientEvent.CheckRunnerStatus)) {
      return;
    }

    socket.emit(
      RunnerServerEvent.RunnerStatus,
      sessionIdToClientId[ClientType.Runner][client.sessionId]
        ? RunnerClientStatus.Online
        : RunnerClientStatus.Offline,
    );
  });

  socket.on('disconnect', () => {
    if (client.type && client.sessionId) {
      delete sessionIdToClientId[client.type][client.sessionId];
    }
    delete clientDict[client.socket.id];
  });
});

const PORT = 3000;
server.listen(PORT);
logger.log('info', 'server is listening %d', PORT);
