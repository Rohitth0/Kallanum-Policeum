const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// This object will hold the state of all active game rooms
const rooms = {};

// This runs whenever a user connects to the server
io.on('connection', (socket) => {
    console.log(`User Connected: ${socket.id}`);

    // Handles a player creating a new room
    socket.on('createRoom', (playerName) => {
        const roomCode = Math.random().toString(36).substring(2, 6).toUpperCase();
        rooms[roomCode] = {
            players: [],
            host: socket.id
        };
        socket.join(roomCode);
        rooms[roomCode].players.push({ id: socket.id, name: playerName, score: 0 });
        socket.emit('roomCreated', roomCode);
        io.to(roomCode).emit('updatePlayerList', rooms[roomCode].players);
    });

    // Handles a player joining an existing room
    socket.on('joinRoom', ({ roomCode, playerName }) => {
        if (rooms[roomCode]) {
            if (rooms[roomCode].players.length >= 4) {
                socket.emit('errorMessage', 'This room is full.');
                return;
            }
            socket.join(roomCode);
            rooms[roomCode].players.push({ id: socket.id, name: playerName, score: 0 });
            io.to(roomCode).emit('updatePlayerList', rooms[roomCode].players);
        } else {
            socket.emit('errorMessage', 'This room does not exist.');
        }
    });
    
    // Handles the host starting the game
    socket.on('startGame', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            if (room.players.length !== 4) {
                socket.emit('errorMessage', 'You need exactly 4 players to start.');
                return;
            }

            const roles = ['Raja', 'Mantri', 'Police', 'Chor'];
            for (let i = roles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [roles[i], roles[j]] = [roles[j], roles[i]];
            }

            room.players.forEach((player, index) => {
                player.role = roles[index];
            });
            
            room.players.forEach((player) => {
                io.to(player.id).emit('gameStarted', { 
                    role: player.role, 
                    players: room.players.map(p => ({id: p.id, name: p.name}))
                });
            });
            console.log(`Game started in room ${roomCode}.`);
        }
    });

    // Handles the Police making a guess
    socket.on('makeGuess', ({ roomCode, guessedPlayerId }) => {
        const room = rooms[roomCode];
        if (!room) {
            console.error(`Error: Room ${roomCode} not found.`);
            return;
        }

        const police = room.players.find(p => p.role === 'Police');
        const guessedPlayer = room.players.find(p => p.id === guessedPlayerId);
        const chor = room.players.find(p => p.role === 'Chor');

        // THIS IS THE CRITICAL FIX: Check if all roles were found to prevent a crash
        if (!police || !guessedPlayer || !chor) {
            console.error(`Error: Could not find all roles in room ${roomCode}. Aborting guess.`);
            return;
        }

        if (socket.id !== police.id) return;
        
        const correctGuess = (guessedPlayer.role === 'Chor');
        
        // Calculate scores
        if (correctGuess) {
            police.score += 300;
        } else {
            chor.score += 800;
        }
        room.players.find(p => p.role === 'Raja').score += 1000;
        room.players.find(p => p.role === 'Mantri').score += 500;
        
        const roundResult = {
            policeName: police.name,
            guessedName: guessedPlayer.name,
            chorName: chor.name,
            correctGuess: correctGuess,
            players: room.players
        };
        
        console.log(`Guess made in room ${roomCode}. Correct: ${correctGuess}. Sending results.`);
        io.to(roomCode).emit('roundResult', roundResult);
    });

    // Handles starting the next round
    socket.on('nextRound', (roomCode) => {
        const room = rooms[roomCode];
        if (room && room.host === socket.id) {
            const roles = ['Raja', 'Mantri', 'Police', 'Chor'];
            for (let i = roles.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [roles[i], roles[j]] = [roles[j], roles[i]];
            }
            room.players.forEach((player, index) => { player.role = roles[index]; });
            room.players.forEach((player) => {
                io.to(player.id).emit('gameStarted', { 
                    role: player.role, 
                    players: room.players.map(p => ({id: p.id, name: p.name}))
                });
            });
            console.log(`Starting next round in room ${roomCode}.`);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User Disconnected: ${socket.id}`);
    });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

server.listen(3000, () => {
    console.log('🚀 Server is listening on http://localhost:3000');
});