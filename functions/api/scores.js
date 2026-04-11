export async function onRequestDelete({ env, request }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!env.ADMIN_TOKEN) {
    return Response.json({ error: 'ADMIN_TOKEN not configured' }, { status: 500 });
  }
  if (!token || token !== env.ADMIN_TOKEN) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await env.DB.prepare('DELETE FROM leaderboard').run();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: 'Failed to clear leaderboard' }, { status: 500 });
  }
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url);
  const gameType = url.searchParams.get('game') || 'forest';
  try {
    const { results } = await env.DB.prepare(
      `SELECT name, score, wave, location, played_at
         FROM leaderboard
        WHERE game_type = ?
        ORDER BY score DESC
        LIMIT 10`
    ).bind(gameType).all();
    return Response.json(results);
  } catch (err) {
    // Fallback: game_type column may not exist yet
    try {
      const { results } = await env.DB.prepare(
        `SELECT name, score, location, played_at FROM leaderboard ORDER BY score DESC LIMIT 10`
      ).all();
      return Response.json(results);
    } catch {
      return Response.json([], { status: 200 });
    }
  }
}

export async function onRequestPost({ env, request }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const name     = (body.name ?? '').toString().trim().slice(0, 10);
  const score    = parseInt(body.score, 10);
  const wave     = body.wave != null ? parseInt(body.wave, 10) : null;
  const gameType = (body.game || 'forest').toString().slice(0, 30);

  if (!name) {
    return Response.json({ error: 'name is required' }, { status: 400 });
  }
  if (Number.isNaN(score)) {
    return Response.json({ error: 'score must be a number' }, { status: 400 });
  }

  const cf = request.cf || {};
  const city = cf.city || '';
  const country = cf.country || '';
  const location = city ? `${city}, ${country}` : (country || 'Unknown');

  try {
    await env.DB.prepare(
      `INSERT INTO leaderboard (name, score, wave, game_type, location) VALUES (?, ?, ?, ?, ?)`
    ).bind(name, score, wave, gameType, location).run();
    return Response.json({ ok: true }, { status: 201 });
  } catch (err) {
    // Fallback: new columns may not exist yet
    try {
      await env.DB.prepare(
        `INSERT INTO leaderboard (name, score, location) VALUES (?, ?, ?)`
      ).bind(name, score, location).run();
      return Response.json({ ok: true }, { status: 201 });
    } catch {
      return Response.json({ error: 'Failed to save score' }, { status: 500 });
    }
  }
}
