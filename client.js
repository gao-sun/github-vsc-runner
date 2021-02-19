const io = require("socket.io-client");
const pty = require('node-pty');
const socket = io('ws://runner.github-vsc.com');

socket.on("connect", () => {
  console.log(socket.id);
  socket.emit('client')
});

var ptyProcess = pty.spawn('bash', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

ptyProcess.onData((data) => {
  console.log('send', data);
  socket.emit('stdout', data);
});

socket.on('cmd',(data) => {
  console.log('on cmd', data);

  ptyProcess.write(data);
});
