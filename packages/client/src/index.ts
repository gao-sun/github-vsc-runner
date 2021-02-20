import { io } from 'socket.io-client';
import pty from 'node-pty';

const socket = io('ws://runner.github-vsc.com:3000');

socket.on('connect', () => {
  console.log('connected', socket.id);
  socket.emit('client');
});

const ptyProcess = pty.spawn('bash', [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env as Record<string, string>,
});

ptyProcess.onData((data) => {
  console.log('send', data);
  socket.emit('stdout', data);
});

socket.on('cmd', (data: any) => {
  console.log('on cmd', data);

  ptyProcess.write(data);
});
