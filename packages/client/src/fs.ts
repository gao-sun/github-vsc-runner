import { FSEventType, RunnerClientEvent, VscClientEvent } from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import { URI } from 'vscode-uri';
import { promises, Stats } from 'fs';
import dayjs from 'dayjs';
import path from 'path';
import { FileStat, FileType } from './vscode';

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

const handleStat = async (path: string, cwd?: string): Promise<FileStat> => {
  const filePath = resolveUri(path, cwd);
  const stats = await promises.stat(filePath);
  const { ctime, mtime, size } = stats;
  const data: FileStat = {
    type: getFileType(stats),
    ctime: dayjs(ctime).unix(),
    mtime: dayjs(mtime).unix(),
    size,
  };
  return data;
};

const handleReadDirectory = async (dir: string, cwd?: string): Promise<[string, FileType][]> => {
  const dirPath = resolveUri(dir, cwd);
  const files = await promises.readdir(dirPath);
  return await Promise.all(
    files.map<Promise<[string, FileType]>>(async (file) => {
      const stats = await promises.stat(path.join(dirPath, file));
      return [file, getFileType(stats)];
    }),
  );
};

const readFile = async (path: string, cwd?: string): Promise<Uint8Array> => {
  const filePath = resolveUri(path, cwd);
  return promises.readFile(filePath);
};

export const registerFSEventHandlers = (socket: Socket, cwd?: string): void => {
  socket.on(VscClientEvent.FSEvent, async (type: FSEventType, uuid: string, payload: unknown) => {
    // TO-DO: add error handling

    const emitResult = (data: unknown) => socket.emit(RunnerClientEvent.FSEvent, uuid, data);
    const emitError = (data: unknown) => socket.emit(RunnerClientEvent.FSEventError, uuid, data);

    try {
      if (type === FSEventType.Stat) {
        emitResult(await handleStat(payload as string, cwd));
      }

      if (type === FSEventType.ReadDirectory) {
        emitResult(await handleReadDirectory(payload as string, cwd));
      }

      if (type === FSEventType.ReadFile) {
        emitResult(await readFile(payload as string, cwd));
      }
    } catch (error) {
      emitError(error);
    }
  });
};
