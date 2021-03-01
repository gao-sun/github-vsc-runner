import { FSEventType, RunnerClientEvent, VscClientEvent } from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import { URI } from 'vscode-uri';
import { promises, Stats } from 'fs';
import dayjs from 'dayjs';
import path from 'path';
import { FileStat, FileType } from './vscode';

type EventPayload = {
  [FSEventType.Stat]: string;
};

type EventResponse = {
  [FSEventType.Stat]: FileStat;
};

const getFileType = (stats: Stats): FileType => {
  if (stats.isFile()) {
    return FileType.File;
  }
  if (stats.isDirectory()) {
    return FileType.Directory;
  }
  if (stats.isSymbolicLink()) {
    return FileType.SymbolicLink;
  }
  return FileType.Unknown;
};

const resolveUri = (uri: string, cwd?: string): string =>
  path.join(cwd || process.cwd(), URI.parse(uri).path);

const handler = async <T extends keyof EventPayload>(
  type: T,
  payload: EventPayload[T],
  cwd?: string,
): Promise<EventResponse[T]> => {
  if (type === FSEventType.Stat) {
    const filePath = resolveUri(payload, cwd);
    const stats = await promises.stat(filePath);
    const { ctime, mtime, size } = stats;
    const data: FileStat = {
      type: getFileType(stats),
      ctime: dayjs(ctime).unix(),
      mtime: dayjs(mtime).unix(),
      size,
    };
    return data;
  }

  throw new Error('unexpected event type');
};

export const registerFSEventHandlers = (socket: Socket): void => {
  socket.on(
    VscClientEvent.FSEvent,
    async <T extends keyof EventPayload>(type: T, uuid: string, payload: EventPayload[T]) => {
      // TO-DO: add error handling
      socket.emit(RunnerClientEvent.FSEvent, uuid, await handler(type, payload));
    },
  );
};
