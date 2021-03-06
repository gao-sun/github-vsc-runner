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
