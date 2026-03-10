export async function onRequestGet({ env }) {
  try {
    await env.DB.prepare(
      `DELETE FROM presence WHERE last_seen < datetime('now', '-30 seconds')`
    ).run();
    const { results } = await env.DB.prepare(
      `SELECT name, location FROM presence ORDER BY last_seen DESC`
    ).all();
    return Response.json(results);
  } catch {
    return Response.json([]);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const { sessionId, name, location } = await request.json();
    if (!sessionId) return Response.json({ error: 'sessionId required' }, { status: 400 });

    const safeName = (name || 'Anonymous').toString().trim().slice(0, 10);
    const safeLoc  = (location || 'Unknown').toString().slice(0, 50);

    await env.DB.prepare(
      `INSERT INTO presence (session_id, name, location, last_seen) VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(session_id) DO UPDATE SET name = excluded.name, location = excluded.location, last_seen = datetime('now')`
    ).bind(sessionId, safeName, safeLoc).run();

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
