import { IncomingMessage, ServerResponse } from 'http';

export const httpNewLine = '\r\n';

export const getHeaders = ({ rawHeaders }: IncomingMessage): string[] => {
  const headers: string[] = [];
  for (let i = 0; i < rawHeaders.length - 1; i += 2) {
    headers.push(`${rawHeaders[i]}: ${rawHeaders[i + 1]}`);
  }
  return headers;
};

export const send404 = (res: ServerResponse): void => {
  res.statusCode = 404;
  res.write('404 not found');
  res.end();
};

export const send503 = (res: ServerResponse, error?: unknown): void => {
  res.statusCode = 503;
  res.write('503 service unavailable');
  if (error) {
    res.write('\r\n');
    res.write(JSON.stringify(error));
  }
  res.end();
};
