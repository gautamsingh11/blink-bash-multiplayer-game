const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const PORT = Number(process.env.PORT || 4317);
const ROOT = __dirname;
const rooms = new Map();
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rounds = [
  { type: 'quiz', prompt: 'Which planet is known as the Red Planet?', options: ['Venus', 'Mars', 'Jupiter', 'Mercury'], answer: 1 },
  { type: 'reaction' },
  { type: 'memory', sequence: ['●', '▲', '◆', '★'] },
  { type: 'quiz', prompt: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], answer: 1 },
  { type: 'reaction' },
  { type: 'memory', sequence: ['▲', '★', '●', '◆', '▲'] },
  { type: 'quiz', prompt: 'Which animal is the tallest?', options: ['Elephant', 'Ostrich', 'Giraffe', 'Camel'], answer: 2 },
  { type: 'reaction' },
];

function safeRoom(room, viewerId) {
  const revealAnswers = room.phase === 'results' || room.phase === 'finished';
  return {
    code: room.code, phase: room.phase, roundIndex: room.roundIndex,
    roundType: room.roundType, roundStartedAt: room.roundStartedAt,
    goAt: room.goAt, go: room.go, roundEndsAt: room.roundEndsAt, memoryRevealUntil: room.memoryRevealUntil,
    players: [...room.players.values()].map(p => ({ id: p.id, name: p.name, score: p.score, connected: p.connected, host: p.id === room.hostId, answer: revealAnswers || p.id === viewerId ? p.answer : null, answerAt: revealAnswers || p.id === viewerId ? p.answerAt : null, points: p.lastPoints || 0 })),
    question: room.roundType === 'quiz' ? { prompt: room.current.prompt, options: room.current.options } : null,
    sequence: room.roundType === 'memory' ? room.current.sequence : null,
    choices: room.roundType === 'memory' ? room.current.choices : null,
    correctIndex: room.phase === 'results' && room.roundType !== 'reaction' ? room.current.answer : null,
    reactionResult: room.phase === 'results' && room.roundType === 'reaction' ? room.reactionResult : null,
    winnerIds: room.phase === 'finished' ? room.winnerIds : [],
  };
}
function broadcast(room) {
  for (const [res, playerId] of room.clients) res.write(`data: ${JSON.stringify(safeRoom(room, playerId))}\n\n`);
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}
function randomCode() { return Array.from({ length: 4 }, () => letters[crypto.randomInt(letters.length)]).join(''); }
function fail(message, status = 400) { const e = new Error(message); e.status = status; return e; }
function getRoom(code) { const room = rooms.get((code || '').toUpperCase()); if (!room) throw fail('That room code was not found.', 404); return room; }
function getPlayer(room, id) { const player = room.players.get(id); if (!player) throw fail('Player not found. Rejoin the room.'); return player; }
function tick(room) {
  if (room.phase === 'playing' && Date.now() >= room.roundEndsAt) finishRound(room);
}
function finishRound(room) {
  if (room.phase !== 'playing') return;
  const correct = [...room.players.values()].filter(p => p.answer !== null && p.answer !== 'false-start' && (room.roundType === 'reaction' || p.answer === room.current.answer));
  correct.sort((a, b) => a.answerAt - b.answerAt);
  const awarded = new Map();
  let place = 0;
  for (let i = 0; i < correct.length; i++) {
    if (i === 0 || correct[i].answerAt !== correct[i - 1].answerAt) place = i;
    const points = place === 0 ? 3 : place === 1 ? 2 : 1;
    awarded.set(correct[i].id, points);
  }
  for (const p of room.players.values()) { p.lastPoints = awarded.get(p.id) || 0; p.score += p.lastPoints; }
  if (room.roundType === 'reaction') room.reactionResult = correct.length ? correct[0].id : null;
  room.phase = 'results';
  room.resultUntil = Date.now() + 4800;
  broadcast(room);
  room.timer = setTimeout(() => {
    if (room.phase !== 'results') return;
    if (room.roundIndex === rounds.length - 1) {
      room.phase = 'finished';
      const high = Math.max(...[...room.players.values()].map(p => p.score));
      room.winnerIds = [...room.players.values()].filter(p => p.score === high).map(p => p.id);
      broadcast(room);
    } else startRound(room, room.roundIndex + 1);
  }, 4800);
}
function startRound(room, position) {
  clearTimeout(room.timer);
  room.roundIndex = position;
  room.current = { ...rounds[room.order[position]] };
  if (room.current.type === 'memory') {
    const original = room.current.sequence;
    const wrongA = original.slice(); wrongA[0] = wrongA[0] === '▲' ? '●' : '▲';
    const wrongB = original.slice(); wrongB[wrongB.length - 1] = wrongB[wrongB.length - 1] === '◆' ? '★' : '◆';
    const wrongC = original.slice(); wrongC[Math.floor(wrongC.length / 2)] = wrongC[Math.floor(wrongC.length / 2)] === '●' ? '★' : '●';
    room.current.choices = [original, wrongA, wrongB, wrongC].sort(() => Math.random() - .5);
    room.current.answer = room.current.choices.indexOf(original);
  }
  room.roundType = room.current.type;
  room.phase = 'playing';
  room.roundStartedAt = Date.now();
  room.roundEndsAt = room.roundStartedAt + 10500;
  room.go = false;
  room.goAt = room.roundType === 'reaction' ? room.roundStartedAt + 1700 + crypto.randomInt(2400) : null;
  room.memoryRevealUntil = room.roundType === 'memory' ? room.roundStartedAt + 2600 : null;
  room.reactionResult = null;
  for (const p of room.players.values()) { p.answer = null; p.answerAt = null; p.lastPoints = 0; }
  broadcast(room);
  room.timer = setTimeout(() => finishRound(room), 10500);
  if (room.roundType === 'reaction') {
    room.signalTimer = setTimeout(() => { if (room.phase === 'playing') { room.go = true; broadcast(room); } }, room.goAt - Date.now());
  }
}
function createRoom(name) {
  let code; do { code = randomCode(); } while (rooms.has(code));
  const id = crypto.randomUUID();
  const room = { code, hostId: id, players: new Map(), clients: new Map(), phase: 'lobby', roundIndex: -1, roundType: null, roundStartedAt: null, roundEndsAt: null, current: null, goAt: null, go: false, timer: null, signalTimer: null, winnerIds: [] };
  room.players.set(id, { id, name, score: 0, connected: false, answer: null, answerAt: null, lastPoints: 0 });
  rooms.set(code, room);
  return { room, playerId: id };
}
function staticFile(url, res) {
  const route = url === '/' ? '/index.html' : url;
  const file = path.resolve(ROOT, `.${decodeURIComponent(route.split('?')[0])}`);
  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) return sendJson(res, 403, { error: 'Forbidden' });
  fs.readFile(file, (err, bytes) => {
    if (err) return sendJson(res, 404, { error: 'Not found' });
    const type = file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(bytes);
  });
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/info') {
    const addresses = [];
    for (const list of Object.values(os.networkInterfaces())) for (const item of list || []) if (item.family === 'IPv4' && !item.internal) addresses.push(`http://${item.address}:${PORT}`);
    return sendJson(res, 200, { urls: [...new Set(addresses)] });
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    try {
      const room = getRoom(url.searchParams.get('room'));
      getPlayer(room, url.searchParams.get('player'));
      return sendJson(res, 200, { active: true });
    } catch (e) { return sendJson(res, e.status || 400, { error: e.message }); }
  }
  if (req.method === 'GET' && !url.pathname.startsWith('/api/')) return staticFile(url.pathname, res);
  if (req.method === 'GET' && url.pathname === '/api/events') {
    try {
      const room = getRoom(url.searchParams.get('room'));
      const id = url.searchParams.get('player');
      const player = getPlayer(room, id);
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write(`data: ${JSON.stringify(safeRoom(room, id))}\n\n`);
      room.clients.set(res, id); player.connected = true; broadcast(room);
      const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(heartbeat); room.clients.delete(res); player.connected = false; broadcast(room); });
    } catch (e) { sendJson(res, e.status || 400, { error: e.message }); }
    return;
  }
  if (req.method === 'POST' && url.pathname.startsWith('/api/')) {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 8192) req.destroy(); });
    req.on('end', () => {
      try {
        const data = JSON.parse(body || '{}');
        if (url.pathname === '/api/create') {
          const name = String(data.name || '').trim().slice(0, 16);
          if (!name) throw fail('Add a name to create a room.');
          const { room, playerId } = createRoom(name);
          return sendJson(res, 200, { code: room.code, playerId });
        }
        if (url.pathname === '/api/join') {
          const room = getRoom(data.code);
          const name = String(data.name || '').trim().slice(0, 16);
          if (!name) throw fail('Add a name to join a room.');
          if (!['lobby', 'finished'].includes(room.phase)) throw fail('This game is already in progress.');
          if (room.players.size >= 8) throw fail('This room is full (8 players).');
          const id = crypto.randomUUID();
          room.players.set(id, { id, name, score: 0, connected: false, answer: null, answerAt: null, lastPoints: 0 });
          broadcast(room); return sendJson(res, 200, { code: room.code, playerId: id });
        }
        const room = getRoom(data.code); const player = getPlayer(room, data.playerId); tick(room);
        if (url.pathname === '/api/start') {
          if (player.id !== room.hostId) throw fail('Only the host can start the game.');
          if (room.phase !== 'lobby' || room.players.size < 2) throw fail('Need at least two players to start.');
          for (const p of room.players.values()) p.score = 0;
          // Shuffle the eight round cards, preserving the designed 3/3/2 mix.
          room.order = rounds.map((_, i) => i).sort(() => Math.random() - .5);
          startRound(room, 0); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/answer') {
          if (room.phase !== 'playing') throw fail('This round is closed.');
          if (player.answer !== null) throw fail('Your answer is already locked in.');
          const now = Date.now();
          if (room.roundType === 'reaction') {
            if (!room.go) { player.answer = 'false-start'; player.answerAt = now; broadcast(room); return sendJson(res, 200, { ok: true }); }
            player.answer = 'tap'; player.answerAt = now;
          } else {
            if (room.roundType === 'memory' && now < room.memoryRevealUntil) throw fail('Wait until the sequence disappears.');
            const choice = Number(data.choice);
            const count = room.roundType === 'quiz' ? room.current.options.length : 4;
            if (!Number.isInteger(choice) || choice < 0 || choice >= count) throw fail('That choice is not available.');
            player.answer = choice; player.answerAt = now;
          }
          broadcast(room); return sendJson(res, 200, { ok: true });
        }
        if (url.pathname === '/api/rematch') {
          if (room.phase !== 'finished') throw fail('The game has not finished.');
          if (player.id !== room.hostId) throw fail('Only the host can start a rematch.');
          room.phase = 'lobby'; room.roundIndex = -1; room.roundType = null; room.winnerIds = [];
          for (const p of room.players.values()) { p.score = 0; p.answer = null; p.answerAt = null; p.lastPoints = 0; }
          broadcast(room); return sendJson(res, 200, { ok: true });
        }
        throw fail('Unknown action.', 404);
      } catch (e) { sendJson(res, e.status || 400, { error: e.message }); }
    }); return;
  }
  sendJson(res, 404, { error: 'Not found' });
});
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Blink Bash ready. Open http://localhost:${PORT}`);
  const addresses = [];
  for (const list of Object.values(os.networkInterfaces())) for (const item of list || []) if (item.family === 'IPv4' && !item.internal) addresses.push(item.address);
  for (const address of new Set(addresses)) console.log(`For phones on this Wi-Fi: http://${address}:${PORT}`);
});
