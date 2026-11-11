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

Deploys are run by hand with Wrangler (there is no Git-connected build):
```bash
npm run deploy:preview   # build, publish to preview.ada-advanture.pages.dev
npm run deploy           # build, publish to production (branch main)
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

## Graphic Novel Creator (`/studio/`)

A second app in the same Pages project, for Ada (8) to make her graphic novels. It is a separate Vite entry (`studio/index.html` -> `src/studio/`), so it shares nothing with the game bundle. **All UI text is English and written for an 8-year-old.**

- **Model** (`src/studio/model.js`): a book (episode) has pages; a character-card page has a name, four boxes (title + body) and an optional drawing. Every piece of text is a "part" addressed by a target string: `name`, `<boxId>.title`, `<boxId>.body`. Pages are plain JSON.
- **Storage** (`store.js`): browser IndexedDB only for now (books as JSON, images as Blobs). Server sync (D1 + R2) is not built yet.
- **Editor** (`CardEditor.jsx`): whole-book undo/redo snapshots; edits made with the same key (typing in one box) collapse into one step. The page is drawn at a fixed 900x636 (`CardPage.jsx`) and scaled to fit; printing uses a read-only copy scaled to A4 landscape.
- **Photo import** (`PhotoImport.jsx`, `cleanup.js`): turns a photo of a paper drawing into transparent line art in the browser. `cleanup.js` is DOM-free so it can be tested in Node. The original photo is always stored next to the cleaned one.
- **Helper bar** (`HelperBar.jsx` -> `POST /api/studio/helper`): the in-app assistant, shown as "Creator Helper" (a placeholder name Ada will choose; never call it Claude in the UI). The function returns `{ reply, actions }`; the browser applies the actions as one undo step and shows Keep It / Put It Back. Its system prompt lives in `server/creatorHelper/systemPrompt.js`. `server/` holds server-only code imported by functions, kept outside `functions/` because every file in there becomes a route.
- **Access** (`functions/api/studio/_middleware.js`): everything under `/api/studio` requires a valid Cloudflare Access token and fails closed when Access is not configured. Local dev: copy `.dev.vars.example` to `.dev.vars`.

Design mock-ups and the build order (comic pages, coloring, part resizing, server sync come later) were agreed in conversation; the character card is the first version.
