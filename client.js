const $ = (q, root = document) => root.querySelector(q);
const home = $('#home'), roomView = $('#room'), toast = $('#toast');
let stored = null;
try { stored = JSON.parse(localStorage.getItem('blinkBashSession') || 'null'); }
catch { localStorage.removeItem('blinkBashSession'); }
let session = null, stream = null, game = null, info = { urls: [] }, tickHandle = null, toastHandle = null, initialConnectionTimer = null;
const symbols = ['●','▲','◆','★'];

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function tell(message) { toast.textContent = message; toast.classList.add('show'); clearTimeout(toastHandle); toastHandle = setTimeout(() => toast.classList.remove('show'), 2600); }
function saveSession(s) { session = s; localStorage.setItem('blinkBashSession', JSON.stringify(s)); }
async function post(path, data) {
  const res = await fetch(path, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
  const result = await res.json(); if (!res.ok) throw new Error(result.error || 'Something went wrong.'); return result;
}
async function connect(s) {
  clearTimeout(initialConnectionTimer); initialConnectionTimer = null;
  stream?.close(); saveSession(s); home.classList.add('hidden'); roomView.classList.remove('hidden');
  stream = new EventSource(`/api/events?room=${encodeURIComponent(s.code)}&player=${encodeURIComponent(s.playerId)}`);
  stream.onmessage = e => {
    clearTimeout(initialConnectionTimer); initialConnectionTimer = null;
    try { game = JSON.parse(e.data); renderRoom(); }
    catch (error) {
      console.error('Could not render the saved room:', error);
      stream?.close(); stream = null; session = null; game = null;
      localStorage.removeItem('blinkBashSession');
      if (tickHandle) clearInterval(tickHandle); tickHandle = null;
      roomView.classList.add('hidden'); home.classList.remove('hidden');
      homeError('Could not reopen that room. Create a new one or join an active room.');
    }
  };
  stream.onerror = () => {
    if (game || initialConnectionTimer) return;
    initialConnectionTimer = setTimeout(() => {
      initialConnectionTimer = null;
      if (game) return;
      stream?.close(); stream = null; session = null; game = null;
      localStorage.removeItem('blinkBashSession');
      if (tickHandle) clearInterval(tickHandle); tickHandle = null;
      roomView.classList.add('hidden'); home.classList.remove('hidden');
      homeError('That saved room is no longer active. Create a new room or join an active one.');
    }, 1200);
  };
  fetch('/api/info').then(r=>r.json()).then(x=>{info=x;renderRoom();}).catch(()=>{});
  if (tickHandle) clearInterval(tickHandle); tickHandle = setInterval(() => {
    if (game?.phase !== 'playing') return;
    if (game.roundType === 'memory' && Date.now() >= game.memoryRevealUntil && roomView.querySelector('.sequence-display')) { renderRoom(); return; }
    const left = Math.max(0, game.roundEndsAt - Date.now());
    const timer = roomView.querySelector('.round-topline span:last-child');
    const fill = roomView.querySelector('.timer-fill');
    if (timer) timer.textContent = `${(left / 1000).toFixed(1)}s`;
    if (fill) fill.style.width = `${Math.max(0, Math.min(100, left / 10500 * 100))}%`;
  }, 180);
}
function homeError(msg) { $('#home-error').textContent = msg; }
const savedName = localStorage.getItem('blinkBashName') || '';
$('#player-name').value = savedName;
const requestedCode = new URLSearchParams(location.search).get('room'); if (requestedCode) $('#room-code').value = requestedCode.toUpperCase();
$('#player-name').addEventListener('input', e => localStorage.setItem('blinkBashName', e.target.value));
$('#room-code').addEventListener('input', e => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''); });
$('#create-room').addEventListener('click', async () => {
  const name = $('#player-name').value.trim(); if (!name) return homeError('Add your name first.');
  homeError(''); $('#create-room').disabled = true;
  try { await connect(await post('/api/create', {name})); } catch(e) { homeError(e.message); } finally { $('#create-room').disabled = false; }
});
$('#join-room').addEventListener('click', async () => {
  const name = $('#player-name').value.trim(), code = $('#room-code').value.trim();
  if (!name) return homeError('Add your name first.'); if (code.length !== 4) return homeError('Enter the 4-letter room code.');
  homeError(''); $('#join-room').disabled = true;
  try { await connect(await post('/api/join', {name, code})); } catch(e) { homeError(e.message); } finally { $('#join-room').disabled = false; }
});
$('#player-name').addEventListener('keydown', e => { if(e.key === 'Enter') $('#create-room').click(); });

function pointsLine() {
  return [...game.players].sort((a,b)=>b.score-a.score).map((p,i)=>`<div class="player-item"><div class="avatar">${esc(p.name.slice(0,1).toUpperCase())}</div><div class="player-name">${esc(p.name)}${p.id===session.playerId?'<span class="your-tag">YOU</span>':''}</div>${p.host?'<span class="host-tag">HOST</span>':''}<span class="score-value">${p.score}</span></div>`).join('');
}
function lobbyContent() {
  const me = game.players.find(p=>p.id===session.playerId), host = me?.host;
  const url = info.urls[0] || location.origin;
  return `<div class="lobby-message"><div class="lobby-symbol">✦</div><div class="eyebrow-mini">THE PARTY STARTS HERE</div><h2>Room ${esc(game.code)} is ready.</h2><p>Get your crew in. When everyone has joined, the host can kick off eight fast rounds.</p></div>
  <div class="room-action">${host?`<button class="button button-primary" id="start-game" ${game.players.length<2?'disabled':''}>${game.players.length<2?'Waiting for players…':'Start the game  →'}</button>`:`<button class="button button-secondary" disabled>You're in — hang tight</button>`}<div class="hint">${host?'Share the room code. Players need to open the same game address on their phones.':'The host will start when the room is ready.'}</div><div class="share-address">GAME ADDRESS: ${esc(url)} <button class="small-action" id="copy-link">Copy link</button></div></div>`;
}
function timerMarkup() {
  const total=10500, left=Math.max(0,game.roundEndsAt-Date.now()), pct=Math.max(0,Math.min(100,left/total*100));
  return `<div class="round-topline"><span>ROUND ${String(game.roundIndex+1).padStart(2,'0')} / 08</span><span>${(left/1000).toFixed(1)}s</span></div><div class="timer-track"><div class="timer-fill" style="width:${pct}%"></div></div>`;
}
function answered() { return game.players.find(p=>p.id===session.playerId)?.answer !== null; }
function gameContent() {
  const me = game.players.find(p=>p.id===session.playerId); const locked = !!me && me.answer !== null;
  const type = game.roundType;
  const top = timerMarkup();
  if (game.phase === 'playing') {
    if (type === 'reaction') {
      const label = locked ? (me.answer==='false-start'?'FALSE START — ROUND OVER':'LOCKED IN — NICE!') : game.go?'TAP!':'WAIT FOR IT…';
      return `<div class="game-area">${top}<div class="type-label">⚡ REFLEX ROUND</div><h2 class="challenge-title">${game.go?'TAP NOW!':'Wait for the signal.'}</h2><button id="reaction-tap" class="big-tap ${game.go&&!locked?'go':''} ${locked&&me.answer==='false-start'?'false':''} ${!game.go?'waiting':''}" ${locked?'disabled':''}>${game.go?'TAP!':locked?'TOO SOON':'WAIT…'}</button><div class="submitted-note">${locked?(me.answer==='false-start'?'Oops! Early tap. Take a breath for the next round.':'Your reaction is in. Watch the leaderboard!'):'Only tap after the screen turns green.'}</div></div>`;
    }
    if (type === 'quiz') {
      const opts=game.question.options.map((o,i)=>`<button class="choice-btn ${game.correctIndex===i?'correct':''} ${locked&&me.answer===i&&i!==game.correctIndex?'wrong':''}" data-choice="${i}" ${locked?'disabled':''}>${esc(o)}</button>`).join('');
      return `<div class="game-area">${top}<div class="type-label">✳ QUICK PICK</div><h2 class="challenge-title">${esc(game.question.prompt)}</h2><div class="choice-grid">${opts}</div><div class="submitted-note">${locked?(me.answer===game.correctIndex?'Correct answer locked in!':'Answer locked — see how you did.'):'One shot. Choose fast.'}</div></div>`;
    }
    const revealing = Date.now() < game.memoryRevealUntil;
    const opts = (game.choices||[]).map((seq,i)=>`<button class="choice-btn seq-option" data-choice="${i}" ${locked||revealing?'disabled':''}>${seq.join(' ')}</button>`).join('');
    return `<div class="game-area">${top}<div class="type-label">◈ MEMORY DASH</div>${revealing?`<h2 class="challenge-title">Remember this sequence.</h2><div class="sequence-display">${game.sequence.join(' ')}</div><p class="reveal-note">Memorize it…</p>`:`<h2 class="challenge-title">Which sequence did you see?</h2>`}<div class="choice-grid">${revealing?'':opts}</div><div class="submitted-note">${locked?'Choice locked in!':''}</div></div>`;
  }
  if (game.phase === 'results') {
    const ordered=[...game.players].sort((a,b)=>(b.points-a.points)||((a.answerAt??Infinity)-(b.answerAt??Infinity)));
    const earned=me?.points||0;
    const rows=ordered.map(p=>`<div class="result-row"><span class="rank">${p.points?'✓':'—'}</span><div class="player-name">${esc(p.name)}${p.id===session.playerId?'<span class="your-tag">YOU</span>':''}</div><span class="earned">${p.points?`+${p.points} pts`:'0 pts'}</span></div>`).join('');
    return `<div class="game-area"><div class="type-label">ROUND ${String(game.roundIndex+1).padStart(2,'0')} RESULTS</div><h2 class="results-title">${earned?`You scored <span style="color:var(--lime)">+${earned}</span>`:'Round wrapped.'}</h2><div class="result-list">${rows}</div><div class="submitted-note">Next round starting shortly…</div></div>`;
  }
  const winners=game.players.filter(p=>game.winnerIds.includes(p.id));
  const board=[...game.players].sort((a,b)=>b.score-a.score);
  return `<div class="game-area"><div class="winner-icon">${winners.length>1?'♛':'✹'}</div><div class="type-label">GAME OVER</div><h1 class="winner-title">${winners.length>1?'It’s a tie!':`<em>${esc(winners[0]?.name||'')}</em> wins!`}</h1><p class="winner-sub">${winners.length>1?`${winners.map(p=>esc(p.name)).join(' & ')} share the crown.`:'Quick hands. Sharp mind. All-round legend.'}</p><div class="final-board">${board.map((p,i)=>`<div class="result-row ${game.winnerIds.includes(p.id)?'winner-row':''}"><span class="rank">${i===0?'♛':`#${i+1}`}</span><div class="player-name">${esc(p.name)}${p.id===session.playerId?'<span class="your-tag">YOU</span>':''}</div><span class="earned">${p.score} pts</span></div>`).join('')}</div>${me?.host?'<button id="rematch" class="button button-primary">Run it back  ↗</button>':''}</div>`;
}
function renderRoom() {
  if (!game) {
    roomView.innerHTML = `<div class="room-top"><div class="brand-row"><div class="brand-mark">BB</div><span class="brand-word">BLINK <b>BASH</b></span></div><span class="room-meta"><i class="connection-dot"></i>CONNECTING</span></div><div class="lobby-message"><div class="lobby-symbol">↻</div><h2>Joining the party…</h2><p>Syncing your phone with the room.</p></div>`; return;
  }
  const slots = Math.max(0, 4-game.players.length);
  const me=game.players.find(p=>p.id===session.playerId);
  const current=game.phase==='playing'?`<div class="room-meta"><i class="connection-dot"></i>LIVE · ${game.players.length} PLAYERS</div>`:`<div class="room-meta"><i class="connection-dot"></i>${game.phase==='finished'?'FINAL SCORES':'ROOM LOBBY'}</div>`;
  roomView.innerHTML=`<div class="room-top"><div class="brand-row"><div class="brand-mark">BB</div><span class="brand-word">BLINK <b>BASH</b></span></div>${current}</div><div class="room-heading"><div><h1 class="room-title">${game.phase==='finished'?'The final tally.':game.phase==='lobby'?'The party room.':'Stay sharp.'}</h1><div class="room-sub">${game.phase==='finished'?'A champion has been crowned.':game.phase==='lobby'?'Pass the code around and rally your crew.':'Every tap counts. Keep your eyes up.'}</div></div><div class="code-box"><div class="code-caption">ROOM CODE</div><div class="code-value">${esc(game.code)}</div></div></div><div class="room-layout"><section class="game-card" id="game-card">${game.phase==='lobby'?lobbyContent():gameContent()}</section><aside class="side-card"><div class="players-heading"><span class="card-label">${game.phase==='finished'?'FINAL SCORES':'IN THE ROOM'}</span><span class="count-pill">${game.players.length} / 8</span></div><div class="player-list">${pointsLine()}${game.phase==='lobby'?Array.from({length:Math.min(slots,8-game.players.length)},()=>'<div class="empty-slot">+ waiting for a player</div>').join(''):''}</div>${game.phase==='lobby'?`<div class="hint">${game.players.length<2?'Need at least 2 players to start.':'Ready when you are, '+esc(me?.name||'player')+'.'}</div>`:''}</aside></div>`;
  $('#start-game')?.addEventListener('click',async()=>{try{await post('/api/start',{code:session.code,playerId:session.playerId});}catch(e){tell(e.message);}});
  $('#rematch')?.addEventListener('click',async()=>{try{await post('/api/rematch',{code:session.code,playerId:session.playerId});}catch(e){tell(e.message);}});
  $('#reaction-tap')?.addEventListener('click',async()=>{try{await post('/api/answer',{code:session.code,playerId:session.playerId});}catch(e){tell(e.message);}});
  roomView.querySelectorAll('[data-choice]').forEach(btn=>btn.addEventListener('click',async()=>{try{await post('/api/answer',{code:session.code,playerId:session.playerId,choice:Number(btn.dataset.choice)});}catch(e){tell(e.message);}}));
  $('#copy-link')?.addEventListener('click',async()=>{const url=(info.urls[0]||location.origin)+`/?room=${game.code}`;try{await navigator.clipboard.writeText(url);tell('Game link copied. Send it with the room code!');}catch{tell(`Open ${url} on the other phone.`);}});
}
if (stored?.code && stored?.playerId) {
  const query = new URLSearchParams({room:stored.code, player:stored.playerId});
  fetch(`/api/session?${query}`, {cache:'no-store'}).then(res => {
    if (!res.ok) throw new Error('That saved room is no longer active. Create a new room or join an active one.');
    return connect(stored);
  }).catch(error => {
    localStorage.removeItem('blinkBashSession');
    homeError(error.message || 'Could not restore that room. Create or join a room to play.');
  });
}
