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
npm run studio:local     # the studio with a local database and bucket, so sync works
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
- **Storage and sync** (`store.js`, `sync.js`, `functions/api/studio/{sync,docs/[id],images/[id]}.js`, `server/studio/storage.js`): local-first. Everything is saved to IndexedDB (books and tray photos as JSON documents, pictures as Blobs) and copied to the server in the background. The server keeps a list of documents with a global revision counter in D1 (`STUDIO_DB`) and the bodies and pictures in R2 (`STUDIO_BUCKET`); a client pulls "everything since revision N" and pushes with the revision it last saw. A push against a stale revision gets 409 and nothing is overwritten: the device takes the server's book and keeps its own version as a new book titled "(copy)". Pictures are immutable (new id per version) and fetched on demand. Every save writes a new body object, so R2 holds the full history. With no bindings (or under plain `vite`), sync turns itself off and the app is single-device. There is one shared library for everyone Access lets in; tables are created on first use. `Studio.jsx` owns the engine and remounts the editor when another device's version of the open book arrives.
- **My Photos** (`Bookshelf.jsx`, `PhotoPicker.jsx`): photos added on the bookshelf are synced as `photo` documents, so they can be taken on the iPad and placed from the iMac. Adding a drawing offers them first. A photo stays after it is put on a page; it gets `usedAt` and a "Used" tag, and new ones are listed first. A photo already there is not added again: each one keeps a `print` (its brightness on a 32x32 grid, `photo.js`), close enough to match the same photo saved again but not two shots of the same drawing.
- **Editor** (`Editor.jsx`): one editor for both page types, with whole-book undo/redo snapshots; edits made with the same key (typing in one box, one eraser rub) collapse into one step. Pages are drawn at a fixed 900x636 (`CardPage.jsx`, `ComicPage.jsx`) and scaled to fit; printing uses a read-only copy scaled to A4 landscape.
- **Comic page** (`ComicPage.jsx`): everything is positioned in page pixels. Pen strokes are SVG paths on a page-wide layer (not per panel); the eraser removes whole strokes. Once an Apple Pencil has been seen, finger touches don't draw.
- **Draw & Color** (`ColorStudio.jsx`, `regions.js`): a full-screen studio for one drawing, opened from a drawing ("Draw & Color") or from an empty card or panel ("Draw It", a blank sheet the shape of the space; such a drawing has no `id`). Pen, eraser, tap-to-fill and un-color, by mouse, finger or Apple Pencil (once a Pencil has been used, fingers and palms don't draw). Pen and eraser strokes are kept in order in `image.edits`, in the coordinates of the straightened photo so they stay put when the lines are switched. An eraser stroke rubs out everything drawn before it, Ada's pencil lines too, but not colors. The line art itself is never modified: `Drawing.jsx` shows the edits as SVG over it, each run of eraser strokes masking what came before. `regions.js` splits the ink (line art plus edits) into enclosed areas, thickening lines first so small gaps don't leak (DOM-free, testable in Node). A fill colors an area as it is at that moment and stays when lines are drawn or rubbed out later, as on paper; the colors are a layer under the ink (`colorId`), and the fills are also kept as seed points (`fills`, `gap`) so the colors can be worked out again on other lines.
- **Photo import** (`PhotoImport.jsx`, `perspective.js`, `cleanup.js`): finds the sheet of paper in a photo, straightens it from its four corners (which the child can drag), then turns it into transparent line art, all in the browser. `perspective.js` and `cleanup.js` are DOM-free so they can be tested in Node. Page detection treats broad dark areas connected to the photo's edge as the desk and everything else as the sheet, so drawn lines and panel borders don't break it up. "Dark" is measured against the paper (the middle of the photo) and the surface (its frame) on a slightly blurred copy, so carpets, towels and a dark shadow beside the paper don't fool it, and the corners are where straight lines fitted to the sides meet, so a curled corner doesn't pull one in; when it isn't sure (paper fills the frame, soft shadows) it returns null and the whole photo is used. The original photo is always stored next to the cleaned one.
- **Just my character and neat lines** (`vectorize.js`, DOM-free, `npm run test:studio`): two switches in the photo import. "Just My Character" keeps the biggest figure near the middle (a box packed with writing at the side can be bigger) and everything inside its outline (on by default for cards, off for comic panels). "Neat Lines" finds the middle of each pencil line and redraws it as smooth strokes of even width, so the shapes stay Ada's (on by default). Every version is made at import and kept in `image.versions` (pencil or neat lines, everything or just the character, each with its box on the straightened photo); `image.look` says which is shown, and the same two switches on the page change it. `id` is the PNG shown and used by Draw & Color, `vecId` the SVG of neat lines (shown by `Drawing.jsx`, sharp at any size). On a switch the fills are moved into the new box (ones that fall outside are dropped) and the colors worked out again. Drawings imported before this have `alt` (the other lines) instead; `model.js` reads both.
- **Read My Words** (`functions/api/studio/read.js`, `wordsOnCard` in `model.js`): a third switch in the photo import, cards only, on by default. On Looks Good! the straightened sheet goes to the model, which reads the name and every text box with the spelling fixed (Ada's choice) and says where each box is. The boxes go into the card's four by where they were drawn (left or right, then top to bottom); a crowded column gets smaller letters so it fits the fixed page. The drawing lands at once and the words follow a few seconds later through the helper bar, as one undo step with Keep It / Put It Back. Tests answer it with a made-up reply (`page.route`) so they never call the model.
- **Helper bar** (`HelperBar.jsx` -> `POST /api/studio/helper`): the in-app assistant, shown as "Creator Helper" (a placeholder name Ada will choose; never call it Claude in the UI). The function returns `{ reply, actions }`; the browser applies the actions as one undo step and shows Keep It / Put It Back. Its system prompt lives in `server/creatorHelper/systemPrompt.js`. `server/` holds server-only code imported by functions, kept outside `functions/` because every file in there becomes a route.
- **Access** (`functions/api/studio/_middleware.js`): everything under `/api/studio` requires a valid Cloudflare Access token and fails closed when Access is not configured. Local dev: copy `.dev.vars.example` to `.dev.vars`.

- **Looks and colors** (`studio.css`, `look.js`): two looks, `simple` (comic outlines) and `crafty` (wood, paper, raised buttons), chosen on the bookshelf and stored in `localStorage`; each has light and dark values that follow `prefers-color-scheme`. Everything is driven by CSS variables set on `html[data-theme]`. Purple is the accent (the family iMac is purple). **The page itself never changes with the look or with dark mode**: it is always white paper with fixed ink colors, so on-screen matches print. When adding UI, use the look variables (`--surface`, `--ctl`, `--fg`, ...) for app chrome and the constants (`--ink`, `--paper`, `--select`) for anything drawn on the page.

- **Tests** (`tests/studio/`): scripts, not a framework. `npm run test:studio` checks paper detection, straightening, just-my-character and neat lines in Node. The five `.cjs` files drive the built app in a real browser with Playwright (not a dependency of this repo; each file's header says how to run it): `card`, `comic`, `photo-import` and `draw` run against `npm run preview`, `sync` needs `npm run studio:local` with empty storage. Run them after changing the studio; they caught real bugs while it was being built.

Not built yet: helper-driven coloring and part resizing (needs the helper to see the drawing). Sync runs against the real D1 and R2 (live since 2026-11-12).
