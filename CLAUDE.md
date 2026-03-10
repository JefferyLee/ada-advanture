# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (Vite)
npm run build    # Build for production
npm run preview  # Preview production build
```

For Cloudflare Pages Functions, use the Wrangler CLI to test locally:
```bash
npx wrangler pages dev dist
```

## Architecture

This is a React + Vite web game deployed on Cloudflare Pages.

**Game loop:** `ForestGame.jsx` drives everything via `requestAnimationFrame`. Game state is split between `gameObjectsRef` (mutable ref, updated every frame without re-renders) and `gameState` (React state, for UI display). This split is intentional — keep per-frame physics/collision data in the ref, only sync to state what needs to render outside the canvas.

**Rendering:** All game visuals are drawn on an HTML5 `<canvas>`. React DOM is only used for the start screen (name input), the HighScores overlay, and the game-over overlay.

**Scoring:** On `endGame`, `ForestGame.jsx` POSTs `{ name, score }` to `/api/scores`. The `HighScores` component self-fetches `GET /api/scores` on mount (no props needed from parent beyond `onClose`).

**Backend (Cloudflare Pages Functions + D1):** `functions/api/scores.js` handles `GET` (top 10) and `POST` (submit). The D1 database binding is named `DB` and configured in `wrangler.toml`. Schema is in `schema.sql`.

## Game Rules (important context for feature work)

- Red mushroom: -1 point; 3 in a row → Ada turns gray (jumps blocked by trees)
- Golden mushroom: +3 points; 2 in a row → Ada turns pink (jumps restored) + 1 bomb + 5 bonus points
- Bomb (key `B`): clears all red mushrooms on screen
- Game ends after 30 trees pass
- Player name is required before starting (1–10 characters)
