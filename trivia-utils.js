const siette = require("./siette-requests");
const MongoClient = require('mongodb').MongoClient;
const url = process.env.DATABASE_URL;
const serverAsciiTitle = `
 _______          _           _           _     _____                   ______ 
|__   __|        (_)         (_)         | |   |  __ \\                 |____  |
   | |     _ __   _  __   __  _    __ _  | |   | |__) |  _   _   _ __      / / 
   | |    | '__| | | \\ \\ / / | |  / _\` | | |   |  ___/  | | | | | '__|    / /  
   | |    | |    | |  \\ V /  | | | (_| | | |   | |      | |_| | | |      / /   
   |_|    |_|    |_|   \\_/   |_|  \\__,_| |_|   |_|       \\__,_| |_|     /_/    
  `;

function serverStartMessage(port) {
    console.log(serverAsciiTitle);
    console.log(url);
    console.log('Server started and listening in port ' + port)
}

const BOARD_SQUARES = {
    // Ring squares 0-23
    0: {isCheese: true, nextRing: 1, prevRing: 23, prevVer: 41, color: "purple"}, // purpleCheese

    1: {nextRing: 2, prevRing: 0}, // rollAgain
    2: {nextRing: 3, prevRing: 1, color: "green"}, // green
    3: {nextRing: 4, prevRing: 2, color: "blue"}, // blue

    4: {isCheese: true, nextRing: 5, prevRing: 3, prevDiag2: 35, color: "orange"}, // orangeCheese

    5: {nextRing: 6, prevRing: 4}, // rollAgain2
    6: {nextRing: 7, prevRing: 5, color: "yellow"}, // yellow
    7: {nextRing: 8, prevRing: 6, color: "green"}, // green2

    8: {isCheese: true, nextRing: 9, prevRing: 7, prevDiag1: 29, color: "blue"}, // blueCheese

    9: {nextRing: 10, prevRing: 8}, // rollAgain3
    10: {nextRing: 11, prevRing: 9, color: "orange"}, // orange
    11: {nextRing: 12, prevRing: 10, color: "blue"}, // blue2

    12: {isCheese: true, nextRing: 13, prevRing: 11, nextVer: 36, color: "green"}, // greenCheese

    13: {nextRing: 14, prevRing: 12}, // rollAgain4
    14: {nextRing: 15, prevRing: 13, color: "yellow"}, // yellow2
    15: {nextRing: 16, prevRing: 14, color: "purple"}, // purple

    16: {isCheese: true, nextRing: 17, prevRing: 15, nextDiag2: 30, color: "pink"}, // pinkCheese

    17: {nextRing: 18, prevRing: 16}, // rollAgain5
    18: {nextRing: 19, prevRing: 17, color: "pink"}, // pink
    19: {nextRing: 20, prevRing: 18, color: "purple"}, // purple2

    20: {isCheese: true, nextRing: 21, prevRing: 19, nextDiag1: 24, color: "yellow"}, // yellowCheese

    21: {nextRing: 22, prevRing: 20}, // rollAgain6
    22: {nextRing: 23, prevRing: 21, color: "pink"}, // pink2
    23: {nextRing: 0, prevRing: 22, color: "orange"}, // orange2

    // Diagonal 1
    24: {nextDiag1: 25, prevDiag1: 20, color: "pink"}, // pink3
    25: {nextDiag1: 26, prevDiag1: 24, color: "purple"}, // purple3
    26: {nextDiag1: 100, prevDiag1: 25, color: "green"}, // green3

    27: {nextDiag1: 28, prevDiag1: 100, color: "purple"}, // purple4
    28: {nextDiag1: 29, prevDiag1: 27, color: "yellow"}, // yellow3
    29: {nextDiag1: 8, prevDiag1: 28, color: "orange"}, // orange3

    // Diagonal 2
    30: {nextDiag2: 31, prevDiag2: 16, color: "green"}, // green4
    31: {nextDiag2: 32, prevDiag2: 30, color: "purple"}, // purple4
    32: {nextDiag2: 100, prevDiag2: 31, color: "orange"}, // orange4

    33: {nextDiag2: 34, prevDiag2: 100, color: "pink"}, // pink4
    34: {nextDiag2: 35, prevDiag2: 33, color: "green"}, // green5
    35: {nextDiag2: 4, prevDiag2: 34, color: "blue"}, // blue3

    // Vertical
    36: {nextVer: 37, prevVer: 12, color: "blue"}, // blue4
    37: {nextVer: 38, prevVer: 36, color: "pink"}, // pink5
    38: {nextVer: 100, prevVer: 37, color: "yellow"}, // yellow4

    39: {nextVer: 40, prevVer: 100, color: "orange"}, // orange5
    40: {nextVer: 41, prevVer: 39, color: "yellow"}, // yellow5
    41: {nextVer: 0, prevVer: 40, color: "blue"}, // blue5

    // Hub
    100: {nextVer: 39, prevVer: 38, nextDiag1: 27, prevDiag1: 26, nextDiag2: 33, prevDiag2: 32, color: "multi"}
}

function calculatePossibleSquares(initiaLSquare, diceNumber) {
    let squares = [];
    let nextSquare = initiaLSquare;

    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].nextDiag1 != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].nextDiag1;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].prevDiag1 != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].prevDiag1;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].nextDiag2 != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].nextDiag2;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].prevDiag2 != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].prevDiag2;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].nextVer != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].nextVer;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    console.log(squares);

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].prevVer != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].prevVer;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].nextRing != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].nextRing;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    nextSquare = initiaLSquare;
    for (let i = 0; i<diceNumber; i++) {
        if (BOARD_SQUARES[nextSquare].prevRing != undefined) {
            nextSquare = BOARD_SQUARES[nextSquare].prevRing;
            if (i == diceNumber - 1) squares.push(nextSquare);
        } else {
            break;
        }
    }

    return squares;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandom(max, min) {
    return (Math.floor(Math.random() * (max-min)) + min);
}

function getTokenBySocketId(activeTokens, socketId) {
    for (const [token,  [id, nick]] of activeTokens) {
      if (id === socketId) {
        return token;
      }
    }
    return null;
}

function getTokenByNick(activeTokens, nickname) {
    for (const [token,  [id, nick]] of activeTokens) {
      if (nick === nickname) {
        return token;
      }
    }
    return null;
}

function getNickBySocketId(activeTokens, socketId) {
    for (const [token,  [id, nick]] of activeTokens) {
      if (id === socketId) {
        return nick;
      }
    }
    return null;
}

async function searchUserByToken(token) {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db('triviaDatabase');
        const usersCollection = db.collection('users');
        const user = await usersCollection.findOne({ token: token });
        client.close();

        return user;
    } catch (error) {
        console.log('Error:', error);
    }
};

async function addGameData(roomData) {
    try {
        const client = await MongoClient.connect(url);
        const db = client.db('triviaDatabase');
        const gamesCollection = db.collection('games');
        const game = {
            date: new Date(),
            gameId: roomData.id,
            host: roomData.hostName,
            winner: (roomData.winnerId)? roomData.players[roomData.winnerId].name : null,
            players: roomData.players
        }
        const res = await gamesCollection.insertOne(game);
        client.close();
    } catch (error) {
        console.log('Error:', error);
    }
};

async function createPlayerTests(room, activeTokens) {
    let correct = true;
    room.starting = true;
    try {
        for (const [key, player] of Object.entries(room.players)) {
            player.tests = {
                blue: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                },
                green: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                },
                yellow: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                    
                },
                orange: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                },
                purple: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                },
                pink: {
                    idSession: null,
                    jsessionId: null,
                    question: null,
                    questionNum: 0,
                    questionCorrect: 0
                }
            }

            const token = getTokenByNick(activeTokens, player.name).toString();
            let res = await siette.createTestSession(room.tests.blue, player.name, 1000);
            player.tests.blue.idSession = res.result;
            let jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.blue.jsessionId = jsessionId;
            player.signature = res.signature;
            player.tests.blue.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));

            res = await siette.createTestSession(room.tests.green, player.name, 1000);
            player.tests.green.idSession = res.result;
            jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.green.jsessionId = jsessionId;
            player.tests.green.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));

            res = await siette.createTestSession(room.tests.yellow, player.name, 1000);
            player.tests.yellow.idSession = res.result;
            jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.yellow.jsessionId = jsessionId;
            player.tests.yellow.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));

            res = await siette.createTestSession(room.tests.orange, player.name, 1000);
            player.tests.orange.idSession = res.result;
            jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.orange.jsessionId = jsessionId;
            player.tests.orange.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));

            res = await siette.createTestSession(room.tests.purple, player.name, 1000);
            player.tests.purple.idSession = res.result;
            jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.purple.jsessionId = jsessionId;
            player.tests.purple.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));

            res = await siette.createTestSession(room.tests.pink, player.name, 1000);
            player.tests.pink.idSession = res.result;
            jsessionId = await siette.startTestSession(res.result, token, res.signature);
            player.tests.pink.jsessionId = jsessionId;
            player.tests.pink.question = processSingleSelectionQuestion(await siette.getNextQuestion(jsessionId, res.signature));
        }

    } catch (error) {
        correct = false;
        console.log("Error creating player tests", error);
    }
    room.starting = false;
    return correct;
}

function processSingleSelectionQuestion(question) {
    try {
        if (!question.course) {
            const questionData = {
                title: question.items.item[0].title[0],
                question: question.items.item[0].stem[0],
                responses: question.items.item[0].responses[0].response,
                feedback: question.items.item[0].responses[0].blank[0].feedback[0]
            }
    
            questionData.responses.forEach((response) => {
                delete response.script;
                delete response.feedback;
                delete response.penalty;
                response.id = Math.abs(response['$'].id).toString();
                delete response['$'];
                response.text = response.text[0];
                response.score = response.score[0];
                response.evaluation = response.evaluation[0];
            });
    
            console.log(questionData);
            return questionData;
        } else {
            return {finished: true};
        }
        
    } catch (error) {
        return {finished: true};
    }
}

function colorSquare(square) {
    return BOARD_SQUARES[square].color;
}

function isCheeseSquare(square) {
    return BOARD_SQUARES[square].isCheese === true;
}

module.exports = {
    serverStartMessage,
    calculatePossibleSquares,
    sleep,
    getRandom,
    getTokenBySocketId,
    searchUserByToken,
    getNickBySocketId,
    processSingleSelectionQuestion,
    createPlayerTests,
    colorSquare,
    isCheeseSquare,
    addGameData
};