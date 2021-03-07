import {
  Dictionary,
  RunnerClientEvent,
  RunnerClientHttpRequest,
  RunnerClientHttpResponse,
  RunnerClientHttpStreamType,
  RunnerServerEvent,
  VscClientEvent,
} from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import http from 'http';
import logger from './logger';
import { RunnerSession } from './types';

const requestDict: Dictionary<string, http.ClientRequest> = {};

export const registerHttpRequestHandlers = (socket: Socket, runner: RunnerSession): void => {
  socket.on(VscClientEvent.FetchCurrentPortForwarding, () => {
    socket.emit(RunnerClientEvent.CurrentPortForwarding, runner.portForwarding);
  });

  socket.on(VscClientEvent.SetPortForwarding, (port?: number) => {
    logger.info('port forwarding to %s', port);
    runner.portForwarding = port;
  });

  socket.on(
    RunnerServerEvent.HttpRequest,
    (uuid: string, type: RunnerClientHttpStreamType, data: unknown) => {
      if (!runner.portForwarding) {
        socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Error);
        return;
      }

      logger.verbose('request [%s], uuid=%s', type, uuid);
      logger.verbose(JSON.stringify(data));

      if (type === RunnerClientHttpStreamType.Start) {
        const { path, method, headers } = data as RunnerClientHttpRequest;
        const clientRequest = http.request(
          { host: 'localhost', port: runner.portForwarding, path, method, headers, timeout: 30000 },
          (res) => {
            const payload: RunnerClientHttpResponse = {
              status: res.statusCode,
              headers: res.headers,
            };
            socket.emit(
              RunnerClientEvent.HttpStream,
              uuid,
              RunnerClientHttpStreamType.Response,
              payload,
            );

            res.on('data', (data) => {
              logger.debug('client response [data], uuid=%s, length=%s', uuid, data.byteLength);
              socket.emit(
                RunnerClientEvent.HttpStream,
                uuid,
                RunnerClientHttpStreamType.Data,
                data,
              );
            });

            res.on('end', () => {
              logger.verbose('client response [end], uuid=%s', uuid);
              socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.End);
              clientRequest.destroy();
              delete requestDict[uuid];
            });
          },
        );

        clientRequest.on('timeout', () => {
          logger.verbose('client request [timeout], uuid=%s', uuid);
          clientRequest.end();
        });

        clientRequest.on('error', (error) => {
          logger.verbose('client request [error], uuid=%s', uuid);
          logger.verbose(JSON.stringify(error));
          socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Error, error);
        });

        requestDict[uuid] = clientRequest;
        socket.emit(RunnerClientEvent.HttpStream, uuid, RunnerClientHttpStreamType.Start);
      }

      if (type === RunnerClientHttpStreamType.Data) {
        requestDict[uuid]?.write(data);
      }

      if (type === RunnerClientHttpStreamType.End) {
        requestDict[uuid]?.end(data);
      }
    },
  );
};
