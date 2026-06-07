# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the game

No build step. Open `index.html` directly in a browser, or serve it with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Architecture

Three files, no dependencies:

- `index.html` — DOM structure: `<canvas id="board">` (300×600 px), side panel with score/lines/level/next preview, and an overlay div used for both PAUSE and GAME OVER states.
- `style.css` — Dark/retro arcade theme. Overlay visibility is toggled via `.hidden` class.
- `game.js` — All game logic (~300 lines, `'use strict'`).

### game.js internals

**State**: `board` is a `ROWS × COLS` matrix where `0` = empty and `1–7` = color index matching `COLORS[]`. `current` and `next` are piece objects `{ type, shape, x, y }` where `shape` is a 2D array.

**Key functions**:
- `collide(shape, ox, oy)` — bounds + overlap check against the board.
- `rotateCW(shape)` — transpose + row-reverse; produces a new array.
- `tryRotate()` — applies `rotateCW` then tries kick offsets `[0, -1, 1, -2, 2]`.
- `clearLines()` — scans bottom-up, splices full rows, recalculates level and `dropInterval`.
- `ghostY()` — projects `current` straight down until collision.
- `loop(ts)` — `requestAnimationFrame` loop; accumulates `dropAccum` and locks the piece when `dropAccum >= dropInterval`.
- `init()` — full reset; called on page load and on restart button click.

**Speed formula**: `dropInterval = Math.max(100, 1000 - (level - 1) * 90)` ms. Level increments every 10 lines.

**Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` × level. Hard drop adds 2 pts/cell, soft drop adds 1 pt/row.

### Changing board dimensions

If you modify `COLS`, `ROWS`, or `BLOCK` in `game.js`, also update the `width`/`height` attributes on `<canvas id="board">` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).
