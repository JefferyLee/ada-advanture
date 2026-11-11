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

- **Model** (`src/studio/model.js`): a book (episode) has pages of two types. A `card` page has a name, four boxes (title + body) and an optional drawing. A `comic` page has a panel layout, panels that can each hold a drawing, pen strokes drawn over the page, and items (speech/thought bubbles, captions, sound words). Every piece of text is a "part" addressed by a target string: `name`, `<boxId>.title`, `<boxId>.body`, `item:<id>`. Pages are plain JSON.
- **Storage** (`store.js`): browser IndexedDB only for now (books as JSON, images as Blobs). Server sync (D1 + R2) is not built yet.
- **Editor** (`Editor.jsx`): one editor for both page types, with whole-book undo/redo snapshots; edits made with the same key (typing in one box, one eraser rub) collapse into one step. Pages are drawn at a fixed 900x636 (`CardPage.jsx`, `ComicPage.jsx`) and scaled to fit; printing uses a read-only copy scaled to A4 landscape.
- **Comic page** (`ComicPage.jsx`): everything is positioned in page pixels. Pen strokes are SVG paths on a page-wide layer (not per panel); the eraser removes whole strokes. Once an Apple Pencil has been seen, finger touches don't draw.
- **Coloring** (`ColorStudio.jsx`, `regions.js`): tap-to-fill. `regions.js` splits the line art into enclosed areas, thickening lines first so small gaps don't leak (DOM-free, testable in Node). Fills are stored as seed points on the image (`fills`, `gap`) plus a rendered color layer (`colorId`) that `Drawing.jsx` shows under the line art. The line art itself is never modified.
- **Photo import** (`PhotoImport.jsx`, `cleanup.js`): turns a photo of a paper drawing into transparent line art in the browser. `cleanup.js` is DOM-free so it can be tested in Node. The original photo is always stored next to the cleaned one.
- **Helper bar** (`HelperBar.jsx` -> `POST /api/studio/helper`): the in-app assistant, shown as "Creator Helper" (a placeholder name Ada will choose; never call it Claude in the UI). The function returns `{ reply, actions }`; the browser applies the actions as one undo step and shows Keep It / Put It Back. Its system prompt lives in `server/creatorHelper/systemPrompt.js`. `server/` holds server-only code imported by functions, kept outside `functions/` because every file in there becomes a route.
- **Access** (`functions/api/studio/_middleware.js`): everything under `/api/studio` requires a valid Cloudflare Access token and fails closed when Access is not configured. Local dev: copy `.dev.vars.example` to `.dev.vars`.

- **Looks and colors** (`studio.css`, `look.js`): two looks, `simple` (comic outlines) and `crafty` (wood, paper, raised buttons), chosen on the bookshelf and stored in `localStorage`; each has light and dark values that follow `prefers-color-scheme`. Everything is driven by CSS variables set on `html[data-theme]`. Purple is the accent (the family iMac is purple). **The page itself never changes with the look or with dark mode**: it is always white paper with fixed ink colors, so on-screen matches print. When adding UI, use the look variables (`--surface`, `--ctl`, `--fg`, ...) for app chrome and the constants (`--ink`, `--paper`, `--select`) for anything drawn on the page.

Not built yet: helper-driven coloring and part resizing (needs the helper to see the drawing), perspective correction in photo import, and server sync between the iPad and the iMac.
