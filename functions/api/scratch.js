// The Scratch game's title, Instructions and Notes and Credits, read from
// Scratch's public API. Browsers can't ask Scratch directly (it only allows
// scratch.mit.edu), so this passes along those three fields for this one
// project. The text stays on Scratch, so editing it there updates the page.
const PROJECT = '1439703364'; // the same as SCRATCH_PROJECT in src/App.jsx

export async function onRequestGet() {
  try {
    const res = await fetch(`https://api.scratch.mit.edu/projects/${PROJECT}`, { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return Response.json({ error: 'Scratch is not answering' }, { status: 502 });
    const p = await res.json();
    return Response.json(
      { title: p.title || '', instructions: p.instructions || '', notes: p.description || '' },
      { headers: { 'Cache-Control': 'public, max-age=300' } },
    );
  } catch (err) {
    return Response.json({ error: 'Scratch is not answering' }, { status: 502 });
  }
}
