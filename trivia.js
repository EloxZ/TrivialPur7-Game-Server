const utils = require("./trivia-utils");
const siette = require("./siette-requests");
//const express = require('express');
//const xmlParser = require('express-xml-bodyparser');
//const router = express.Router();
//router.use(xmlParser());

const TURN_STATE = {
    rollDice: 0,
    chooseSquare: 1,
    answerQuestion: 2
}
const TIMEOUT = {
    rollDice: 15,
    chooseSquare: 15,
    answerQuestion: 30
}

const GAME_DURATION = 30 * 60 * 1000;

let io;
let gameSocket;
let tokens;
let rooms = {};

function initGame(sio, socket, activeTokens) {
    io = sio;
    gameSocket = socket;
    tokens = activeTokens;
    gameSocket.emit('connected', { message: "You are connected!" });

    // Host events
    gameSocket.on('hostCreateNewGame', hostCreateNewGame);
    gameSocket.on('hostStartGame', hostStartGame);

    // User connection events
    gameSocket.on('playerJoinGame', playerJoinGame);
    gameSocket.on('disconnect', playerDisconnect);

    // Player game events
    gameSocket.on('finishTurnRollDice', finishTurnRollDice);
    gameSocket.on('sendMsg', sendChatMsg);
    gameSocket.on('finishSelection', finishSelection);
    gameSocket.on('answerQuestion', answerQuestion);

    // Reconnection events
    gameSocket.on('checkPlayerInsideRoom', checkPlayerInsideRoom);
    gameSocket.on('tryLeaveRoom', tryLeaveRoom);
}

module.exports = {
    rooms,
    initGame,
    //router
}

// Validations
const roomExists = (gameId) => rooms != undefined && rooms[gameId] != undefined;

function inRoom(playerName) {
    let found = false;
    Object.entries(rooms).forEach(([key, value]) => {
        if (value.hostName === playerName) found = true;
        if (!found) {
            Object.values(value.players).forEach((player) => {
                if(!found && player.name === playerName && !player.left) {
                    found = true;
                }
            });
        }
    });
    return found;
}

function inRoomConnected(socket) {
    return !(socket.rooms.size == 1);
}

function inRoomDisconnected(playerName) {
    let roomId = null;
    let playerId = null;
    let found = false;
    Object.entries(rooms).forEach(([key, value]) => {
        if (!found) {
            Object.values(value.players).forEach((player) => {
                if(!found && player.name === playerName && !player.connected && !player.left) {
                    roomId = key;
                    playerId = player.socketId;
                    found = true;
                }
            });
        }
    });
    return {found, roomId, playerId};
}

function isTurn(playerId, gameId) {
    try {
        var res = false;
        if (rooms[gameId] != undefined && rooms[gameId].playing) {
            res = playerId == Object.keys(rooms[gameId].players)[rooms[gameId].turn]; 
        }
        return res;
    } catch (error) {
        console.log(error);
    }
}

function getAvailableColor(gameId, color) {
    if (rooms[gameId].availableColors != undefined && rooms[gameId].availableColors.length != 0) {
        if (color == undefined || !rooms[gameId].availableColors.includes(color)) {
            let length = rooms[gameId].availableColors.length;
            let index = Math.floor(Math.random()*length);
            selColor = rooms[gameId].availableColors[index];
        } else {
            selColor = color;
        }
        
        rooms[gameId].availableColors = rooms[gameId].availableColors.filter(item => item !== selColor);
    }

    return selColor;
}

// Host events
function hostCreateNewGame(data) {
    try {
        const correctDataFormat = data.tests != undefined
            && data.tests.blue != undefined
            && data.tests.green != undefined
            && data.tests.yellow != undefined
            && data.tests.orange != undefined
            && data.tests.purple != undefined
            && data.tests.pink != undefined
            && new Set([data.tests.blue, data.tests.green, data.tests.yellow, data.tests.orange, data.tests.purple, data.tests.pink]).size == 6;
        
        if (correctDataFormat) {
            const playerName = utils.getNickBySocketId(tokens, this.id);
            if (playerName && !inRoom(playerName)) {
                // Create a unique Socket.IO Room
                let thisGameId = ( Math.random() * 100000 ) | 0;
                console.log("Client", this.id, "is hosting a new game:", thisGameId);
                rooms[thisGameId] = {};
                rooms[thisGameId].id = thisGameId;
                rooms[thisGameId].playing = false;
                rooms[thisGameId].starting = false;
                rooms[thisGameId].players = {};
                rooms[thisGameId].availableColors = ["blue", "yellow", "orange", "pink", "purple", "green"];
                rooms[thisGameId].diceNumber = 1;
                rooms[thisGameId].host = this.id;
                rooms[thisGameId].hostName = playerName;
                rooms[thisGameId].tests = {
                    blue: data.tests.blue,
                    green: data.tests.green,
                    yellow: data.tests.yellow,
                    orange: data.tests.orange,
                    purple: data.tests.purple,
                    pink: data.tests.pink
                }

                // Join the Room and wait for the players
                this.join(thisGameId.toString());
                this.emit('newGameCreated', {gameId: thisGameId, mySocketId: this.id, tests: rooms[thisGameId].tests});

                // If host wants to play
                if (data.asPlayer != undefined && data.asPlayer) {
                    var playerData = {
                        socketId: this.id,
                        name: playerName,
                        color: getAvailableColor(thisGameId, data.favColor),
                        square: 100,
                        connected: true,
                        left: false,
                        cheeses: {
                            blue: false,
                            green: false,
                            yellow: false,
                            orange: false,
                            purple: false,
                            pink: false
                        }
                    }
        
                    rooms[thisGameId].players[this.id] = playerData;
                    this.emit("updateRoomPlayers", rooms[thisGameId].players);
                }
            }
        }
    } catch (error) {
        console.log(error);
    }
}

async function hostStartGame(data) {
    try {
        console.log("Trying to start game " + data.gameId);
        if (rooms[data.gameId].host == this.id && !rooms[data.gameId].playing && !rooms[data.gameId].starting && Object.keys(rooms[data.gameId].players).length > 1) {
            rooms[data.gameId].starting = true;
            if (await utils.createPlayerTests(rooms[data.gameId], tokens)) {
                console.log("All Players Present. Starting game " + data.gameId);
                rooms[data.gameId].playing = true;
                rooms[data.gameId].starting = false;
                rooms[data.gameId].initDate = new Date();
                const gameDurationInSeconds = GAME_DURATION/1000;
                io.sockets.in(data.gameId.toString()).emit('startingGame', {players: rooms[data.gameId].players, gameDurationInSeconds: gameDurationInSeconds});
                // Wait to let client load game
                await utils.sleep(15000);
                // Start game loop by giving the first turn
                giveTurn(0, data.gameId);
            } else {
                rooms[data.gameId].starting = false;
                io.sockets.in(data.gameId.toString()).emit('errorStartingGame', {message: "Error contactando Siette, prueba de nuevo en unos segundos"});
            }
            
        }
    } catch (error) {
        console.log(error);
    }
}

// Player connection events
async function playerJoinGame(data) {
    try {
        console.log('Player ' + this.id + ' attempting to join game: ' + data.gameId );
        let room = io.sockets.adapter.rooms.get(data.gameId.toString());
        const playerName = utils.getNickBySocketId(tokens, this.id);
        if (!playerName) throw new Error("Player name not found");
        // If the room exists...
        if(room != undefined && rooms[data.gameId] != undefined && rooms[data.gameId].players != undefined){
            if (!inRoom(playerName) && Object.keys(rooms[data.gameId].players).length < 6 && !rooms[data.gameId].playing && !rooms[data.gameId].starting) {
                // Join the room
                this.join(data.gameId.toString());
                
                const playerData = {
                    socketId: this.id,
                    name: playerName,
                    color: getAvailableColor(data.gameId, data.favColor),
                    square: 100,
                    connected: true,
                    left: false,
                    cheeses: {
                        blue: false,
                        green: false,
                        yellow: false,
                        orange: false,
                        purple: false,
                        pink: false
                    }
                }

                rooms[data.gameId].players[this.id] = playerData;

                data.tests = rooms[data.gameId].tests;

                console.log('Player ' + playerName + ' joining game: ' + data.gameId );

                // Emit an event notifying the clients that the player has joined the room.
                this.emit('roomFound', data);
                io.sockets.in(data.gameId).emit('playerJoinedRoom', playerData);
                io.sockets.in(data.gameId).emit('updateRoomPlayers', rooms[data.gameId].players);
                // Reconnect game
            } else if (rooms[data.gameId].playing && playerInsideRoom(playerName, data.gameId)) {
                this.join(data.gameId.toString());

                if (rooms[data.gameId].hostName === playerName) {
                    rooms[data.gameId].host = this.id;
                }

                let oldId = null;
                let newData = null;
                let playerColor = "white";

                Object.values(rooms[data.gameId].players).forEach((player) => {
                    if(player.name === playerName) {
                        newData = {...player};
                        newData.socketId = this.id;
                        oldId = player.socketId;
                        playerColor = player.color;
                    }
                });

                if (newData) {
                    delete rooms[data.gameId].players[oldId];
                    rooms[data.gameId].players[this.id] = newData;
                }

                console.log('Player ' + playerName + ' reconnecting game: ' + data.gameId );
                data.tests = rooms[data.gameId].tests;
                this.emit('roomFound', data);
                const gameDurationInSeconds = (GAME_DURATION + (rooms[data.gameId].initDate - new Date()))/1000;
                this.emit('startingGame', {players: rooms[data.gameId].players, gameDurationInSeconds: gameDurationInSeconds});
                await utils.sleep(8000);
                rooms[data.gameId].players[this.id].connected = true;
                io.sockets.in(data.gameId).emit('playerReconnected', {name: playerName, color: playerColor});
            }
        } else {
            // Otherwise, send an error message back to the player.
            console.log("Error trying to enter room");
            this.emit('error',{message: "This room does not exist."} );
        }
    } catch (error) {
        console.log(error);
    }
}

async function playerDisconnect() {
    try {
        console.log("Client disconnected: " + this.id);
        tokens.delete(utils.getTokenBySocketId(tokens, this.id));

        // Disconnect player from room
        Object.entries(rooms).forEach(([key, value]) => {
            let playerData = value.players[this.id];

            // Player inside room
            if (playerData != undefined) {
                let playerName = playerData.name;
                let color = playerData.color;
                
                // Is a host playing
                if (value.host  == this.id) {
                    console.log("Host playing from room", key, "disconnected")
                    // If game is in lobby
                    if (value.playing == false) {
                        console.log("[Game", gameId + "] Host left room, closing game");
                        delete rooms[key]; 
                        io.sockets.in(key).emit('cancelSession', {message: "Se ha desconectado el host, cancelando partida..."}); // Alert users in room.
                    } else {
                        value.players[this.id].connected = false;
                        io.sockets.in(key).emit('playerDisconnected', {playerId: this.id, name: playerName, color: color}); // Alert users in room.
                    }
                } else {
                    // If game is in lobby
                    if (value.playing == false) {
                        // Free color
                        let playerColor = value.players[this.id].color;
                        rooms[key].availableColors.push(playerColor);
                        delete value.players[this.id]; // If player in lobby, just delete
                        io.sockets.in(key).emit('updateRoomPlayers', value.players);
                    } else {
                        value.players[this.id].connected = false;
                        if (isTurn(this.id, key)) {
                            value.waitingUserInput = false;
                        }
                    }
                    io.sockets.in(key).emit('playerDisconnected', {playerId: this.id, name: playerName, color: color}); // Alert users in room.
                }  
            // If is a host not playing
            } else if (value.host == this.id) {
                console.log("Host from room", key, "disconnected");
                
                if (value.playing == false) {
                    console.log("[Game", gameId + "] Host left room, closing game");
                    delete rooms[key]; 
                    io.sockets.in(key).emit('cancelSession', {message: "Se ha desconectado el host, cancelando partida..."}); // Alert users in room.
                } else {
                    io.sockets.in(key).emit('msgReceived', {message: "Se ha desconectado el host.", color: "white", name: "[Server]"}); // Alert users in room.
                }
            }
            
            const connectedPlayers = Object.values(value.players).filter(player => player.connected);

            // If playing room doesn't have enough connected players
            if (value.playing && connectedPlayers.length < 2) {
                console.log("Not enough players in room " + key + ", deleting room.");    
                const roomClone = {...rooms[key]}
                utils.addGameData(roomClone);
                io.sockets.in(key).emit('cancelSession', {message: "Sólo queda un jugador conectado, cancelando partida..."}); // Alert users in room.
                delete rooms[key];
            }
        });
    } catch (error) {
        console.log(error);
    }
}

// Reconnection events
function checkPlayerInsideRoom() {
    try {
        const playerName = utils.getNickBySocketId(tokens, this.id);
        let gameId = null;
        if (playerName != null) {
            Object.entries(rooms).forEach(([key, value]) => {
                if (value.hostName == playerName) gameId = key;
                if (gameId == null) {
                    Object.values(value.players).forEach((player) => {
                        if(gameId == null && player.name === playerName && !player.left) {
                            gameId = key;
                        }
                    });
                }
            });
        }
        if (gameId != null) this.emit("playerInsideRoomFound", {gameId: gameId});
    } catch (error) {
        console.log(error);
    }
}

function playerInsideRoom(playerName, gameId) {
    let found = false;
    if (rooms[gameId].hostName === playerName) found = true;
    if (!found) {
        Object.values(rooms[gameId].players).forEach((player) => {
            if(!found && player.name === playerName && !player.left) {
                found = true;
            }
        });
    }
    return found;
}

function tryLeaveRoom(data) {
    try {
        const playerName = utils.getNickBySocketId(tokens, this.id);
        if (playerName != null) {
            Object.entries(rooms).forEach(([key, value]) => {
                if (value.hostName == playerName) {
                    console.log("[Game", gameId + "] Host left room, closing game");
                    this.emit("leftRoomSuccess");
                    io.sockets.in(key).emit('cancelSession', {message: "El host ha cancelado la partida..."}); // Alert users in room.
                    const roomClone = {...rooms[key]}
                    utils.addGameData(roomClone);
                    delete rooms[key];
                    
                    throw new Error("Game closed");
                } else {
                    Object.values(value.players).forEach((player) => {
                        if (player.name === playerName && !player.left) {
                            rooms[key].players[player.socketId].left = true;
                            this.emit("leftRoomSuccess");
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.log(error);
    }
}

// Player game events
function sendChatMsg(data) {
    try {
        if (roomExists(data.gameId) && (rooms[data.gameId].host == data.playerId || rooms[data.gameId].players[data.playerId] != null) && data.msg != '') {
            let msg = data.msg;
            let player = rooms[data.gameId].players[data.playerId];
            msg = msg.replaceAll('<','&lt;').replaceAll('>', '&gt;');
            if (player) {
                io.sockets.in(data.gameId.toString()).emit("msgReceived", {message: msg, color: player.color, name: player.name});
            } else {
                io.sockets.in(data.gameId.toString()).emit("msgReceived", {message: msg, color: "white", name: rooms[data.gameId].hostName});
            }
            
        }
    } catch (error) {
        console.log(error)
    }
}

async function giveTurn(playerIndex, gameId) {
    try {
        const isGamePlaying = rooms[gameId].playing;
        const isPlayerConnected = Object.values(rooms[gameId].players)[playerIndex].connected

        if (isGamePlaying) {
            const timePassed = new Date() - rooms[gameId].initDate;

            if (timePassed >= GAME_DURATION) {
                console.log("[Game " , gameId + "] Closing, max. duration exceeded");
                io.sockets.in(gameId).emit('cancelSession', {message: "Se ha acabado el tiempo de juego, terminando partida..."});
                const roomClone = {...rooms[gameId]}
                utils.addGameData(roomClone);
                delete rooms[gameId];
                throw new Error("Game closed");
            }
        }

        if (isGamePlaying && isPlayerConnected) {
            let playerId = Object.keys(rooms[gameId].players)[playerIndex];
            rooms[gameId].turn = playerIndex;
            rooms[gameId].turnState = TURN_STATE.rollDice;

            // Do calculate a number while possible squares is empty
            let diceNumber = utils.getRandom(6, 1);
            let possibleSquares = utils.calculatePossibleSquares(rooms[gameId].players[playerId].square, diceNumber);

            while(possibleSquares.length == 0) {
                diceNumber = utils.getRandom(6, 1);
                possibleSquares = utils.calculatePossibleSquares(rooms[gameId].players[playerId].square, diceNumber);
            }

            rooms[gameId].diceNumber = diceNumber;
            console.log("[Game " , gameId + "] Player ", playerId, "rolling dice with number ", diceNumber);
            let data = {
                player: playerId,
                number: rooms[gameId].diceNumber,
                timeout: TIMEOUT.rollDice
            }
            io.sockets.in(gameId.toString()).emit('giveTurn', data);

            rooms[gameId].waitingUserInput = true;
            rooms[gameId].numberOfTimeouts = 0;

            while (rooms[gameId].waitingUserInput) {
                rooms[gameId].numberOfTimeouts++;
                await utils.sleep(1000);
                if (rooms[gameId].numberOfTimeouts > TIMEOUT.rollDice) {
                    rooms[gameId].waitingUserInput = false;
                }
            }

            io.sockets.in(gameId.toString()).emit('rollDice', rooms[gameId].diceNumber);

            // Wait for client roll animation
            await utils.sleep(4000);
            askSquare(playerId, gameId, possibleSquares);
        } else if (isGamePlaying) {
            console.log("[Game " , gameId + "] Turn when reconnecting ");
            newTurn(gameId);
        }
    } catch (error) {
        console.log("[Game " , gameId + "] Error giving turn, giving it to next player");
        newTurn(gameId);
    }
}

async function askSquare(playerId, gameId, possibleSquares) {
    try {
        const isGamePlaying = rooms[gameId].playing;
        const isPlayerConnected = rooms[gameId].players[playerId].connected;
        // isTurn is redundant, to avoid bad uses
        if (isGamePlaying && isTurn(playerId, gameId)) {
            if (isPlayerConnected) {
                // Next turn phase
                rooms[gameId].turnState = TURN_STATE.chooseSquare;
                io.sockets.sockets.get(playerId).emit("selectSquare", {squares: possibleSquares});
                io.sockets.in(gameId.toString()).emit('userSelecting', {timeout: TIMEOUT.chooseSquare, playerId: playerId});

                rooms[gameId].waitingUserInput = true;
                rooms[gameId].numberOfTimeouts = 0;

                while (rooms[gameId].waitingUserInput) {
                    rooms[gameId].numberOfTimeouts++;
                    await utils.sleep(1000);
                    if (rooms[gameId].numberOfTimeouts > TIMEOUT.chooseSquare) {
                        rooms[gameId].waitingUserInput = false;
                    }
                }

                if (rooms[gameId].numberOfTimeouts > TIMEOUT.chooseSquare) rooms[gameId].players[playerId].square = possibleSquares[0];

                io.sockets.in(gameId.toString()).emit('movePlayer', {playerId: playerId, square: rooms[gameId].players[playerId].square});

                const colorSquare = utils.colorSquare(rooms[gameId].players[playerId].square);
                const isCheese = utils.isCheeseSquare(rooms[gameId].players[playerId].square);
                
                await utils.sleep(rooms[gameId].diceNumber * 1000 + 1000);

                if (!colorSquare) {
                    // Roll again
                    giveTurn(rooms[gameId].turn, gameId);
                } else if (colorSquare == "multi") {
                    // Multicolor square
                    const cheeses = rooms[gameId].players[playerId].cheeses;
                    const falseColors = Object.keys(cheeses).filter(color => cheeses[color] === false);
                    const randomIndex = utils.getRandom(falseColors.length, 1) - 1;
                    askQuestion(playerId, gameId, falseColors[randomIndex], false);
                } else {
                    // Color square
                    if (!rooms[gameId].players[playerId].cheeses[colorSquare]) {
                        // No cheese
                        askQuestion(playerId, gameId, colorSquare, isCheese);
                    } else {
                        newTurn(gameId);
                    }
                }
            } else {
                console.log("[Game" , gameId + "] Player disconnected when asking square, new turn");
                newTurn(gameId);
            }
        } else if (isGamePlaying) {
            console.log("[Game" , gameId + "] Player disconnected when asking square, new turn");
            newTurn(gameId);
        }
    } catch (error) {
        console.log("[Game" , gameId + "] Error asking square, giving new turn", error);
        newTurn(gameId);
    }
}

async function askQuestion(playerId, gameId, color, isCheese) {
    try {
        const isGamePlaying = rooms[gameId].playing;
        const isPlayerConnected = rooms[gameId].players[playerId].connected;
        // isTurn is redundant, to avoid bad uses
        if (isGamePlaying && isTurn(playerId, gameId)) {
            if (isPlayerConnected) {
                console.log("[Game", gameId + "] Asking question to player");
                // Next turn phase
                rooms[gameId].turnState = TURN_STATE.answerQuestion;
                const jsessionId = rooms[gameId].players[playerId].tests[color].jsessionId;
                const signature = rooms[gameId].players[playerId].signature;
                const questionData = rooms[gameId].players[playerId].tests[color].question;

                let playerWon = false;

                if (questionData.finished) {
                    // Pregunta no disponible
                    console.log("[Game", gameId + "] Player won", color, "cheese");
                    rooms[gameId].players[playerId].cheeses[color] = true;
                    io.sockets.in(gameId.toString()).emit('playerWonCheese', {color: color, playerId: playerId});
                    const cheeses = rooms[gameId].players[playerId].cheeses;
                    playerWon = Object.keys(cheeses).every(key => cheeses[key] === true);
                    if (!playerWon) {
                        giveTurn(rooms[gameId].turn, gameId);
                    } else {
                        console.log("[Game", gameId + "] Player won, closing game");
                        rooms[gameId].winnerId = playerId;
                        io.sockets.in(gameId.toString()).emit('gameOver', {winnerId: playerId, players: rooms[gameId].players});
                        const roomClone = {...rooms[gameId]}
                        utils.addGameData(roomClone);
                        delete rooms[gameId]; 
                        throw new Error("Game closed");
                    }
                } else {
                    const questionDataClone = {...questionData};
                    const questionDataUser = {...questionData};
    
                    delete questionDataUser.feedback;
                    questionDataUser.responses.forEach((response) => {
                        const { evaluation, score, ...rest } = response;
                        Object.assign(response, rest);
                    });

                    io.sockets.sockets.get(playerId).emit("askQuestion", {question: questionDataUser});
                    io.sockets.in(gameId.toString()).emit('userAnsweringQuestion', 
                        {timeout: TIMEOUT.answerQuestion, playerId: playerId});

                    rooms[gameId].waitingUserInput = true;
                    rooms[gameId].numberOfTimeouts = 0;

                    while (rooms[gameId].waitingUserInput) {
                        rooms[gameId].numberOfTimeouts++;
                        await utils.sleep(1000);
                        if (rooms[gameId].numberOfTimeouts > TIMEOUT.answerQuestion) {
                            rooms[gameId].waitingUserInput = false;
                        }
                    }

                    const playerAnswer = rooms[gameId].players[playerId].answer;
                    const rightAnswer = questionDataClone.responses.find((response) => response.evaluation === "right");
                    const isCorrect = (playerAnswer && rightAnswer)? playerAnswer == rightAnswer.id : false;
                    delete rooms[gameId].players[playerId].answer;

                    console.log("[Game", gameId + "] The player answer is", playerAnswer);
                    console.log("[Game", gameId + "] The correct answer is", rightAnswer);
                    console.log("[Game", gameId + "] The player answer is correct?", isCorrect);
                    
                    await siette.answerQuestion(jsessionId, (playerAnswer)? playerAnswer : "", signature);

                    rooms[gameId].players[playerId].tests[color].question = utils.processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, signature));
                    rooms[gameId].players[playerId].tests[color].questionNum++;

                    io.sockets.in(gameId.toString()).emit('playerAnsweredQuestion', {color: color, playerId: playerId, correct: isCorrect});
                    io.sockets.sockets.get(playerId).emit("questionFeedback", {feedback: questionDataClone.feedback, rightAnswerText: rightAnswer.text, isCorrect: isCorrect});
                    
                    if (!isCorrect) {
                        newTurn(gameId);
                    } else {
                        rooms[gameId].players[playerId].tests[color].questionCorrect++;

                        // Si es de queso
                        if (isCheese) {
                            console.log("[Game", gameId + "] Player won", color, "cheese");
                            rooms[gameId].players[playerId].cheeses[color] = true;
                            io.sockets.in(gameId.toString()).emit('playerWonCheese', {color: color, playerId: playerId});
                            const cheeses = rooms[gameId].players[playerId].cheeses;
                            playerWon = Object.keys(cheeses).every(key => cheeses[key] === true);
                        }
                        
                        if (!playerWon) {
                            giveTurn(rooms[gameId].turn, gameId);
                        } else {
                            console.log("[Game", gameId + "] Player won, closing game");
                            rooms[gameId].winnerId = playerId;
                            io.sockets.in(gameId.toString()).emit('gameOver', {playerId: playerId});
                            const roomClone = {...rooms[gameId]}
                            utils.addGameData(roomClone);
                            delete rooms[gameId];
                            throw new Error("Game closed");
                        }
                    }
                }
            } else {
                console.log("[Game", gameId + "] Player disconnected when asking question, new turn");
                newTurn(gameId);
            }
        } else if (isGamePlaying) {
            newTurn(gameId);
        }
    } catch (error) {
        console.log("[Game", gameId + "] Error asking question, giving new turn", error);
        newTurn(gameId);
    }
}

function answerQuestion(data) {
    try {
        console.log(data);
        if (isTurn(data.playerId, data.gameId)
            && rooms[data.gameId].turnState == TURN_STATE.answerQuestion
            && rooms[data.gameId].waitingUserInput) {
            rooms[data.gameId].players[data.playerId].answer = data.answer;
            rooms[data.gameId].waitingUserInput = false;
        }
    } catch (error) {
        console.log(error);
    }
}

function newTurn(gameId) {
    try {
        let i = 1;
        let player = null;
        do {
            var newTurn = (rooms[gameId].turn + i) % Object.keys(rooms[gameId].players).length;
            player = Object.values(rooms[gameId].players)[newTurn];
            i++;
        } while (player == null || !player.connected)
        
        giveTurn(newTurn, gameId);
    } catch (error) {
        console.log(error);
    }
}

function finishSelection(data) {
    try {
        if (isTurn(data.playerId, data.gameId) && rooms[data.gameId].turnState == TURN_STATE.chooseSquare && rooms[data.gameId].waitingUserInput) {
            rooms[data.gameId].players[data.playerId].square = data.square;
            rooms[data.gameId].waitingUserInput = false;
        }
    } catch (error) {
        console.log(error);
    }
}

function finishTurnRollDice(data) {
    try {
        if (isTurn(this.id, data.gameId) && rooms[data.gameId].turnState == TURN_STATE.rollDice) {
            rooms[data.gameId].waitingUserInput = false;
            console.log(this.id + " finished rolling dice in game " + data.gameId);
        }
    } catch (error) {
        console.log(error);
    }
}

/* Legacy code using API
router.post('/answerquestion', (req, res) => {
    try {
        const body = req.body;
        const query = req.query;

        console.log(query);
        console.log(body);
        console.log(body.items['$'].idsession.slice(1));
        console.log(siette.getAnswerResult(body));

        if (isTurn(query.playerId, query.gameId) && rooms[query.gameId].turnState === TURN_STATE.answerQuestion && rooms[query.gameId].waitingUserInput && rooms[query.gameId].questionCode == query.code) {
            if (body.items && body.items['$'].idsession.slice(1) === rooms[query.gameId].questionSession.toString()) {
                // Pregunta respondida
                rooms[query.gameId].questionCode = null;
                rooms[query.gameId].questionCorrect = siette.getAnswerResult(body);
                rooms[query.gameId].waitingUserInput = false;
                res.status(200).json({ message: 'Answer recorded successfully.' });
                console.log('Answer recorded successfully.');
            }
        } else {
            res.status(400).json({ error: 'Invalid answer.' });
            console.log('Invalid answer.');
        }
    } catch (error) {
        console.log(error);
        res.status(500).json({ error: 'An error occurred.' });
        console.log('An error occurred.');
    }
});
*/

