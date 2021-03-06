import {
  Dictionary,
  RunnerClientEvent,
  RunnerClientHttpStreamType,
  RunnerServerEvent,
} from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import net from 'net';
import logger from './logger';

const requestDict: Dictionary<string, net.Socket> = {};

export const registerHttpRequestHandlers = (socket: Socket): void => {
  socket.on(
    RunnerServerEvent.HttpRequest,
    (uuid: string, type: RunnerClientHttpStreamType, data: any) => {
      logger.warn('request [%s], uuid=%s', type, uuid);
      logger.verbose(JSON.stringify(data));

      if (type === RunnerClientHttpStreamType.Start) {
        const netSocket = net.connect(8081, 'localhost', () => {
          // notify connection is ready
          socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Start);
          netSocket.on('data', (data) => {
            logger.verbose('net socket [data], uuid=%s, length=%s', uuid, data.byteLength);
            socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Data, data);
          });
        });
        netSocket.setNoDelay(true);
        netSocket.setTimeout(30000);
        netSocket.on('timeout', () => {
          netSocket.end();
        });
        netSocket.on('error', (error) => {
          logger.verbose('net socket [error], uuid=%s', uuid);
          logger.verbose(JSON.stringify(error));
          socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Error, error);
        });
        netSocket.on('end', () => {
          logger.verbose('net socket [end], uuid=%s', uuid);
          socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.End);
          netSocket.destroy();
          delete requestDict[uuid];
        });
        requestDict[uuid] = netSocket;
      }

      if (type === RunnerClientHttpStreamType.Data) {
        requestDict[uuid]?.write(data);
      }
    },
  );
};
