import { Dictionary, Optional, Session } from '@github-vsc-runner/core';
import { existsSync, promises, readFileSync } from 'fs';
import logger from './logger';

type SessionDict = Dictionary<string, Session>;
const sessionPath = '.session.json';
let sessionDict: SessionDict = {};

function debounce<T extends unknown[]>(fn: (...args: T) => void | Promise<void>, wait: number) {
  let timeout: ReturnType<typeof setTimeout>;
  return function (...args: T) {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

const save = debounce(async () => {
  logger.verbose('saving session dict');
  return promises.writeFile(sessionPath, JSON.stringify(Object.keys(sessionDict)));
}, 100);

export const getSession = (sessionId: string): Optional<Session> => sessionDict[sessionId];

export const deleteSession = (sessionId: string): void => {
  delete sessionDict[sessionId];
  save();
};

export const setSession = (sessionId: string, data: Session): void => {
  sessionDict[sessionId] = data;
  save();
};

export const loadSessionDict = (): void => {
  if (!existsSync(sessionPath)) {
    return;
  }

  logger.verbose('reading session from json');
  sessionDict = (JSON.parse(readFileSync(sessionPath, 'utf-8')) as string[]).reduce(
    (acc, id) =>
      Object.assign<SessionDict, SessionDict>(acc, {
        [id]: {
          id,
          clientDict: {} as Session['clientDict'],
          clientOSDict: {} as Session['clientOSDict'],
        },
      }),
    {} as SessionDict,
  );
};
