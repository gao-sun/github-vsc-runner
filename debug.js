const io = require("socket.io-client");
const socket = io('ws://runner.github-vsc.com:3000');

socket.on("connect", () => {
  socket.emit('debug')
  socket.emit('cmd', 'source /etc/profile\nls\npwd\n');
});

socket.on('stdout', (data) => {
  console.log(data.toString());
});
