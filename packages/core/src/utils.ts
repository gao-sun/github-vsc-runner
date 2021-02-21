import { RunnerClientEvent, RunnerServerEvent, VscClientEvent } from './types';

export const isRunnerClientEvent = (
  event: RunnerClientEvent | VscClientEvent | RunnerServerEvent,
): event is RunnerClientEvent =>
  !!Object.values(RunnerClientEvent).find((value) => value === event);

export const isRunnerServerEvent = (
  event: RunnerClientEvent | VscClientEvent | RunnerServerEvent,
): event is RunnerServerEvent =>
  !!Object.values(RunnerServerEvent).find((value) => value === event);

export const isVscClientEvent = (
  event: RunnerClientEvent | VscClientEvent | RunnerServerEvent,
): event is VscClientEvent => !!Object.values(VscClientEvent).find((value) => value === event);
