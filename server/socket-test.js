const { io } = require('socket.io-client');
const socket = io('http://localhost:5001');

socket.on('connect', () => {
  console.log('Connected to server!');
});

socket.on('ping-result', (data) => {
  console.log('Received live ping:', data);
});