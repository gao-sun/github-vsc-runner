const server = require('http').createServer();
const io = require('socket.io')(server);

io.on('connection', client => {
  console.log('client connected', client.id)
  client.on('event', data => {
    console.log('received event', data)
  });
  client.on('disconnect', () => {
    console.log('client disconnected', client.id);
  });
});

server.listen(3000);
