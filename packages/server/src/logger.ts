import { createLogger, transports, format } from 'winston';

const isProduction = process.env.NODE_ENV === 'production';

export default createLogger({
  level: process.env.NODE_ENV === 'development' ? 'verbose' : 'info',
  format: format.combine(
    format.splat(),
    format.timestamp({
      format: isProduction ? 'YYYY-MM-DD HH:mm:ss' : 'HH:mm:ss',
    }),
    format.colorize(),
    format.printf(({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`),
  ),
  transports: [new transports.Console()],
});
