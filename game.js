'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const LS_SCORES     = 'tetris-scores';
const LS_BEST_COMBO = 'tetris-best-combo';
const LS_MAX_LINES  = 'tetris-max-lines';

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayCombo = document.getElementById('overlay-combo');
const overlayLinesStat = document.getElementById('overlay-lines-stat');
const restartBtn = document.getElementById('restart-btn');
const nameInputSection = document.getElementById('name-input-section');
const playerNameInput = document.getElementById('player-name');
const saveScoreBtn = document.getElementById('save-score-btn');
const leaderboardBody = document.getElementById('leaderboard-body');
const resetScoresBtn = document.getElementById('reset-scores-btn');

let board, current, next, score, lines, level, paused, gameOver,
    lastTime, dropAccum, dropInterval, animId,
    currentCombo, bestCombo, savedEntryIndex;

// ---- localStorage helpers ----

function loadScores() {
  try {
    const stored = localStorage.getItem(LS_SCORES);
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveScores(arr) {
  localStorage.setItem(LS_SCORES, JSON.stringify(arr));
}

function loadBestCombo() {
  return parseInt(localStorage.getItem(LS_BEST_COMBO), 10) || 0;
}

function loadMaxLines() {
  return parseInt(localStorage.getItem(LS_MAX_LINES), 10) || 0;
}

// ---- Leaderboard rendering ----

function renderLeaderboard(highlightIndex) {
  const scores = loadScores();
  leaderboardBody.innerHTML = '';
  if (scores.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 3;
    td.textContent = '—';
    td.style.textAlign = 'center';
    td.style.color = 'var(--label-color)';
    tr.appendChild(td);
    leaderboardBody.appendChild(tr);
    return;
  }
  scores.forEach((entry, i) => {
    const tr = document.createElement('tr');
    if (i === highlightIndex) tr.classList.add('highlight-row');
    const rank = document.createElement('td');
    rank.textContent = i + 1;
    const name = document.createElement('td');
    name.textContent = entry.name || '???';
    const pts = document.createElement('td');
    pts.textContent = entry.score.toLocaleString();
    tr.append(rank, name, pts);
    leaderboardBody.appendChild(tr);
  });
}

function qualifiesForTop5(s) {
  const scores = loadScores();
  if (scores.length < 5) return true;
  return s > scores[scores.length - 1].score;
}

function insertScore(name, s) {
  const scores = loadScores();
  const entry = { name: name.trim() || '???', score: s };
  scores.push(entry);
  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 5) scores.length = 5;
  saveScores(scores);
  return scores.indexOf(entry);
}

// ---- Board ----

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  const cleared = clearLines();
  if (cleared > 0) {
    currentCombo++;
    if (currentCombo > bestCombo) bestCombo = currentCombo;
  } else {
    currentCombo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = '#22222e';
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);

  // Update global best combo
  const globalBestCombo = loadBestCombo();
  if (bestCombo > globalBestCombo) {
    localStorage.setItem(LS_BEST_COMBO, bestCombo);
  }
  const displayBestCombo = Math.max(bestCombo, globalBestCombo);

  // Update global max lines
  const globalMaxLines = loadMaxLines();
  if (lines > globalMaxLines) {
    localStorage.setItem(LS_MAX_LINES, lines);
  }
  const displayMaxLines = Math.max(lines, globalMaxLines);

  // Populate overlay
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayCombo.textContent = `Combo: ${bestCombo} (mejor: ${displayBestCombo})`;
  overlayLinesStat.textContent = `Líneas: ${lines} (mejor: ${displayMaxLines})`;

  savedEntryIndex = null;

  document.getElementById('leaderboard-section').classList.remove('hidden');

  if (qualifiesForTop5(score)) {
    nameInputSection.classList.remove('hidden');
    playerNameInput.value = '';
    playerNameInput.focus();
    // Leaderboard will be rendered after the player saves their name
  } else {
    nameInputSection.classList.add('hidden');
    renderLeaderboard(null);
  }

  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayCombo.textContent = '';
    overlayLinesStat.textContent = '';
    nameInputSection.classList.add('hidden');
    document.getElementById('leaderboard-section').classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  currentCombo = 0;
  bestCombo = 0;
  savedEntryIndex = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

// ---- Event listeners ----

saveScoreBtn.addEventListener('click', () => {
  const name = playerNameInput.value.trim() || '???';
  savedEntryIndex = insertScore(name, score);
  nameInputSection.classList.add('hidden');
  renderLeaderboard(savedEntryIndex);
});

playerNameInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveScoreBtn.click();
});

resetScoresBtn.addEventListener('click', () => {
  localStorage.removeItem(LS_SCORES);
  localStorage.removeItem(LS_BEST_COMBO);
  localStorage.removeItem(LS_MAX_LINES);
  renderLeaderboard(null);
});

restartBtn.addEventListener('click', init);

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

<<<<<<< HEAD
// ---- Theme ----
=======
restartBtn.addEventListener('click', init);
>>>>>>> parent of a425c0b (Merge pull request #7 from rodrialeh01/claude/issue-5-20260607-2333)

init();
