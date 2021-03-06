import {
  FSEventType,
  RunnerClientEvent,
  VscClientEvent,
  FSDeleteFilePayload,
  FSWriteFilePayload,
  FSRenameOrCopyPayload,
  FSFileSearchPayload,
  FSTextSearchPayload,
} from '@github-vsc-runner/core';
import { Socket } from 'socket.io-client';
import { promises, existsSync } from 'fs';
import dayjs from 'dayjs';
import path from 'path';
import { FileStat, FileType } from '../vscode';
import logger from '../logger';
import { resolveUri, getFileType, SystemError, SystemErrorNo } from './foundation';
import { fileSearch, textSearch } from './search';

const stat = async (path: string, cwd?: string): Promise<FileStat> => {
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

const readDirectory = async (dir: string, cwd?: string): Promise<[string, FileType][]> => {
  const dirPath = resolveUri(dir, cwd);
  const files = await promises.readdir(dirPath);
  return await Promise.all(
    files.map<Promise<[string, FileType]>>(async (file) => {
      const stats = await promises.stat(path.join(dirPath, file));
      return [file, getFileType(stats)];
    }),
  );
};

const readFile = async (path: string, cwd?: string): Promise<string> => {
  const filePath = resolveUri(path, cwd);
  return promises.readFile(filePath, 'utf-8');
};

const createDirectory = async (path: string, cwd?: string): Promise<void> => {
  const filePath = resolveUri(path, cwd);
  return promises.mkdir(filePath);
};

const writeFile = (
  { uri, base64Content, options: { create, overwrite } }: FSWriteFilePayload,
  cwd?: string,
): Promise<void> => {
  const filePath = resolveUri(uri, cwd);
  if ((!existsSync(filePath) && !create) || !existsSync(path.dirname(filePath))) {
    throw new SystemError(SystemErrorNo.ENOENT);
  }

  if (existsSync(filePath) && !overwrite) {
    throw new SystemError(SystemErrorNo.EEXIST);
  }

  return promises.writeFile(filePath, base64Content, 'base64');
};

const deleteFile = async (
  { uri, options: { recursive } }: FSDeleteFilePayload,
  cwd?: string,
): Promise<void> => {
  const filePath = resolveUri(uri, cwd);

  if (!recursive) {
    const stats = await promises.stat(filePath);
    if (stats.isDirectory()) {
      throw new SystemError(SystemErrorNo.EISDIR);
    }
  }

  return promises.rm(filePath, { recursive });
};

const renameOrCopy = async (
  type: FSEventType.Rename | FSEventType.Copy,
  { oldUri, newUri, options: { overwrite } }: FSRenameOrCopyPayload,
  cwd?: string,
): Promise<void> => {
  const oldPath = resolveUri(oldUri, cwd);
  const newPath = resolveUri(newUri, cwd);

  if (!existsSync(oldPath) || !existsSync(path.dirname(newPath))) {
    throw new SystemError(SystemErrorNo.ENOENT);
  }

  if (existsSync(newPath)) {
    if (!overwrite) {
      throw new SystemError(SystemErrorNo.EEXIST);
    }
    await promises.rm(newPath, { recursive: true });
  }

  return type === FSEventType.Copy
    ? promises.copyFile(oldPath, newPath)
    : promises.rename(oldPath, newPath);
};

export const registerFSEventHandlers = (socket: Socket, cwd?: string): void => {
  socket.on(VscClientEvent.FSEvent, async (uuid: string, type: FSEventType, payload: unknown) => {
    // TO-DO: add error handling

    const emitResult = (data: unknown) => socket.emit(RunnerClientEvent.FSEvent, uuid, data);
    const emitError = (data: unknown) => socket.emit(RunnerClientEvent.FSEventError, uuid, data);

    try {
      if (type === FSEventType.Stat) {
        emitResult(await stat(payload as string, cwd));
      }

      if (type === FSEventType.ReadDirectory) {
        emitResult(await readDirectory(payload as string, cwd));
      }

      if (type === FSEventType.ReadFile) {
        emitResult(await readFile(payload as string, cwd));
      }

      if (type === FSEventType.CreateDirectory) {
        emitResult(await createDirectory(payload as string, cwd));
      }

      if (type === FSEventType.WriteFile) {
        emitResult(await writeFile(payload as FSWriteFilePayload, cwd));
      }

      if (type === FSEventType.Delete) {
        emitResult(await deleteFile(payload as FSDeleteFilePayload, cwd));
      }

      if (type === FSEventType.Rename || type === FSEventType.Copy) {
        emitResult(await renameOrCopy(type, payload as FSRenameOrCopyPayload, cwd));
      }

      if (type === FSEventType.FileSearch) {
        emitResult(await fileSearch(payload as FSFileSearchPayload, cwd));
      }

      if (type === FSEventType.TextSearch) {
        emitResult(
          await textSearch(payload as FSTextSearchPayload, cwd, (match) =>
            socket.emit(RunnerClientEvent.FSTextSearchMatch, uuid, match),
          ),
        );
      }
    } catch (error) {
      logger.verbose('FS error');
      logger.verbose(JSON.stringify(error));
      emitError(error);
    }
  });
};
