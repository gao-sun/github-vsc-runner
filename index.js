const server = require('http').createServer();
const io = require('socket.io')(server);

let runnerClient;
let debugClient;

io.on('connection', client => {
  console.log('client connected', client.id);

  client.on('client', () => {
    console.log('received client');
    runnerClient = client;
  });

  client.on('debug', () => {
    console.log('received client');
    debugClient = client;
  });

  client.on('cmd', data => {
    console.log('received cmd', data);
    runnerClient.emit('cmd', data);
  });
  client.on('stdout', data => {
    console.log('received stdout', data);
    debugClient && debugClient.emit('stdout', data)
  });
  client.on('disconnect', () => {
    console.log('client disconnected', client.id);
  });
});

server.listen(3000);
