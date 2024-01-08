const express = require('express');
const app = express();
const trivia = require('./trivia');
const utils = require("./trivia-utils");
const siette = require("./siette-requests");
const commands = require("./commands")

// Create a Node.js based http server on port 3000
const port = process.env.PORT || 3000;
const server = require('http').createServer(app).listen(port, '0.0.0.0');

// Create a Socket.IO server and attach it to the http server
const socketio = require('socket.io');
const io = socketio(server);

utils.serverStartMessage(port);

const activeTokens = new Map();
const fs = require('fs');

// Specify the path to the directory you want to list files from
const directoryPath = '.';

// Use fs.readdir to read the contents of the directory
fs.readdir(directoryPath, (err, files) => {
  if (err) {
    console.error('Error reading directory:', err);
    return;
  }

  // Log the list of files in the directory
  console.log('Files in the directory:');
  files.forEach(file => {
    console.log(file);
  });
});

// Authenticate
io.use(async function(socket, next) {
    try {
        console.log("Trying to connect " + socket.id);
        const joinServerParameters = JSON.parse(socket.handshake.query.joinServerParameters);
        console.log("Token: " + joinServerParameters.token);
        let { response, result } = await siette.hasExpiredSession(joinServerParameters.token, 1000);
        let user;
        // To bypass siette auth
        // result = false;
        if (!result) {
            user = await utils.searchUserByToken(joinServerParameters.token);
        }

        if (user && !result && !activeTokens.has(joinServerParameters.token)) {
            activeTokens.set(joinServerParameters.token, [socket.id, user.nick]);
            next();
        } else {
            console.log("Incorrect client auth, token expired or invalid", joinServerParameters.token);
            next(new Error('Authentication error'));
        }
    } catch (error) {
        console.log("Error when trying to auth", error);
        next(new Error('Authentication error'));        
    }
});

// Listen for Socket.IO Connections. Once connected, start the game logic.
io.sockets.on('connection', function (socket) {
    console.log('Client connected: ' + socket.id);
    trivia.initGame(io, socket, activeTokens);
});

// Listen for commands from the console
commands.startCommandsListener();

/* Test code
siette.createTestSession(764698, "prueba", 1000).then(async output => {
    // Handle the resolved result
    console.log(output);
    
}).catch(error => {
    // Handle the rejected promise
    console.error('An error occurred:', error);
});
*/