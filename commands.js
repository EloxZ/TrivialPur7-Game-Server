function startCommandsListener() {
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (input) => {
        const command = input.trim();
        const parts = command.split(' ');
        const commandName = parts[0];
        const argument = parts[1];
        if (commandName === 'rooms') {
            getRoomsInfo();
        } else if (commandName === 'room') {
            getRoomInfo(argument);
        } else if (commandName === 'tokens') {
            getTokensList();
        } else if (commandName === 'sockets') {
            getSocketsList();
        } else if (commandName === 'help') {
            getHelpInfo();
        } else if (commandName === 'exit') {
            console.log('Closing server...');
            process.exit(0);
        } else {
            console.log(`Command not recognized: ${command}`);
        }
    });
    console.log('Enter a command (type "exit" to quit):');
}

function getRoomsInfo() {
    Object.entries(trivia.rooms).forEach(([key, value]) => {
        console.log('---------------------------');
        console.log(`Game ID: ${key}`);
        console.log(`Number of Players: ${Object.keys(value.players).length}`);
        console.log(`Playing?: ${value.playing}`);
        console.log('---------------------------');
    });
}

function getTokensList() {
    for (const [token, [id, userName]] of activeTokens) {
        console.log('---------------------------');
        console.log(`Siette Token: ${token}`);
        console.log(`Socket ID: ${id}`);
        console.log(`userName: ${userName}`);
        console.log('---------------------------');
    }
}

function getSocketsList() {
    [...io.sockets.sockets.values()].forEach(function(socket) {
        const socketId = socket.id; // Get the ID of the socket
        const socketIp = socket.handshake.address; // Get the IP address of the socket
        
        console.log('---------------------------');
        console.log('Socket ID:', socketId);
        console.log('Socket IP:', socketIp);
        console.log('---------------------------');
    });
}

function getHelpInfo() {
    const commandInfo = `
        rooms - Gets list of available rooms
        room [id] - Get info of room
        tokens - Get list of tokens of sockets assigned to each token
        sockets - Get list of socket connections
        exit - Closes server
    `;

    console.log(commandInfo);
}

function getRoomInfo(roomId) {
    let res;
    try {
        res = trivia.rooms[roomId];
    } catch (error) {

    }
    console.log((res)? res : "Invalid room ID");
}

module.exports = {
    startCommandsListener
}