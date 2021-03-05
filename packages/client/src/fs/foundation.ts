import { URI } from 'vscode-uri';
import { Stats } from 'fs';
import path from 'path';
import { FileType } from '../vscode';

export enum SystemErrorNo {
  ENOENT = 'ENOENT',
  EEXIST = 'EEXIST',
  EISDIR = 'EISDIR',
}

export const systemErrorCode: Record<SystemErrorNo, number> = {
  [SystemErrorNo.ENOENT]: -2,
  [SystemErrorNo.EEXIST]: -17,
  [SystemErrorNo.EISDIR]: -21,
};

export class SystemError extends Error {
  errno: number;
  code: string;

  constructor(systemError: SystemErrorNo) {
    super();
    this.code = systemError;
    this.errno = systemErrorCode[systemError];
  }
}

export const getFileType = (stats: Stats): FileType => {
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

export const resolveUri = (uri: string, cwd?: string): string =>
  path.join(cwd || process.cwd(), URI.parse(uri).path);
