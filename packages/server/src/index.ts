import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import logger from './logger';

const server = createServer();
const io = new Server(server);

let runnerClient: Socket;
let debugClient: Socket;

io.on('connection', (client: Socket) => {
  logger.info('client connected %s', client.id);

  client.on('client', () => {
    console.log('received client');
    runnerClient = client;
  });

  client.on('debug', () => {
    console.log('received client');
    debugClient = client;
  });

  client.on('cmd', (data: any) => {
    console.log('received cmd', data);
    runnerClient.emit('cmd', data);
  });
  client.on('stdout', (data: any) => {
    console.log('received stdout', data);
    debugClient && debugClient.emit('stdout', data);
  });
  client.on('disconnect', () => {
    console.log('client disconnected', client.id);
  });
});

const PORT = 3000;
server.listen(PORT);
logger.log('info', 'server is listening %d', PORT);
