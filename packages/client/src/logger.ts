import { createLogger, transports, format } from 'winston';

export default createLogger({
  level: 'info',
  format: format.combine(
    format.splat(),
    format.timestamp({
      format: 'HH:mm:ss',
    }),
    format.colorize(),
    format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`),
  ),
  transports: [new transports.Console()],
});
