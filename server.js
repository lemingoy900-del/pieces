const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 3000;

// ═══════════════════════════════════════════════════════════
// ИГРОВОЕ СОСТОЯНИЕ
// ═══════════════════════════════════════════════════════════
let gameState = {
    status: 'waiting',
    image: null,
    width: 0,
    height: 0,
    cols: 0,
    rows: 0,
    pieces: {},
    tabs: { h: [], v: [] }
};

// ═══════════════════════════════════════════════════════════
// HTTP СЕРВЕР
// ═══════════════════════════════════════════════════════════
const server = http.createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
            res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
            res.end(data);
        });
    } 
    else if (req.url.match(/\.(png|jpg|jpeg)$/)) {
        const imagePath = path.join(__dirname, req.url);
        fs.readFile(imagePath, (err, data) => {
            if (err) {
                res.writeHead(404);
                res.end('Image not found');
            } else {
                const ext = path.extname(req.url).slice(1);
                res.writeHead(200, {'Content-Type': `image/${ext}`});
                res.end(data);
            }
        });
    } 
    else {
        res.writeHead(404);
        res.end('Not found');
    }
});

// ═══════════════════════════════════════════════════════════
// WEBSOCKET СЕРВЕР
// ═══════════════════════════════════════════════════════════
const wss = new WebSocket.Server({ server });

function broadcast(message) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Отправка сообщения всем, кроме автора
function broadcastExcept(exceptClient, message) {
    const data = JSON.stringify(message);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client !== exceptClient) {
            client.send(data);
        }
    });
}

wss.on('connection', (ws) => {
    console.log('Игрок подключился');
    
    // Генерируем уникальный ID и случайный яркий цвет для курсора игрока
    ws.clientId = Math.random().toString(36).substring(2, 9);
    const colors = ['#e74c3c', '#2ecc71', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#e84393', '#00d2d3'];
    ws.clientColor = colors[Math.floor(Math.random() * colors.length)];

    ws.send(JSON.stringify({ type: 'fullState', state: gameState }));
    
    ws.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            
            if (msg.type === 'initGame') {
                gameState.status = 'playing';
                gameState.image = msg.image;
                gameState.width = msg.width;
                gameState.height = msg.height;
                gameState.cols = msg.cols;
                gameState.rows = msg.rows;
                gameState.pieces = msg.pieces;
                gameState.tabs = msg.tabs;
                
                broadcast({ type: 'fullState', state: gameState });
            } 
            else if (msg.type === 'updatePieces') {
                msg.pieces.forEach(p => {
                    if (gameState.pieces[p.id]) {
                        gameState.pieces[p.id].x = p.x;
                        gameState.pieces[p.id].y = p.y;
                        gameState.pieces[p.id].group = p.group;
                    }
                });
                broadcast({ type: 'piecesUpdate', pieces: msg.pieces });
            }
            else if (msg.type === 'resetGame') {
                gameState = { status: 'waiting', pieces: {}, tabs: {h:[], v:[]} };
                broadcast({ type: 'fullState', state: gameState });
            }
            else if (msg.type === 'cursorMove') {
                // Пересылаем координаты остальным игрокам, добавляя ID и цвет отправителя
                broadcastExcept(ws, {
                    type: 'cursorUpdate',
                    id: ws.clientId,
                    color: ws.clientColor,
                    x: msg.x,
                    y: msg.y
                });
            }
        } catch (e) {
            console.error('Ошибка:', e);
        }
    });

    ws.on('close', () => {
        console.log('Игрок отключился');
        // Даем команду остальным удалить курсор этого игрока
        broadcast({ type: 'cursorRemove', id: ws.clientId });
    });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('Сервер запущен. Адрес: http://localhost:' + PORT);
});