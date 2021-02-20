import { createServer } from 'http';
import { Server, Socket } from 'socket.io';

const server = createServer();
const io = new Server(server);

let runnerClient: Socket;
let debugClient: Socket;

io.on('connection', (client: Socket) => {
  console.log('client connected', client.id);

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

server.listen(3000);
