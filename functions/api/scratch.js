// The Scratch game, read from Scratch's public API. Browsers can't ask that API
// directly (it only allows scratch.mit.edu), so this passes along what the page
// needs for this one project:
//   /api/scratch           its title, Instructions and Notes and Credits
//   /api/scratch?project   its project.json, so the page can run it in its own
//                          player and read the score (costumes and sounds load
//                          from Scratch directly)
// Nothing is copied into this repo, so whatever Ada changes on Scratch shows up
// here within a few minutes.
const PROJECT = '1439703364'; // the same as SCRATCH_PROJECT in src/App.jsx
const FRESH = { 'Cache-Control': 'public, max-age=300' };

export async function onRequestGet({ request }) {
  try {
    const wantsProject = new URL(request.url).searchParams.has('project');
    // The project file needs a token that only lasts a few minutes, so its details are always fetched fresh.
    const res = await fetch(`https://api.scratch.mit.edu/projects/${PROJECT}`, wantsProject ? {} : { cf: { cacheTtl: 300, cacheEverything: true } });
    if (!res.ok) return Response.json({ error: 'Scratch is not answering' }, { status: 502 });
    const p = await res.json();
    if (!wantsProject) {
      return Response.json({ title: p.title || '', instructions: p.instructions || '', notes: p.description || '' }, { headers: FRESH });
    }
    const file = await fetch(`https://projects.scratch.mit.edu/${PROJECT}?token=${p.project_token}`);
    if (!file.ok) return Response.json({ error: 'Scratch is not answering' }, { status: 502 });
    return new Response(file.body, { headers: { 'Content-Type': 'application/json', ...FRESH } });
  } catch (err) {
    return Response.json({ error: 'Scratch is not answering' }, { status: 502 });
  }
}
