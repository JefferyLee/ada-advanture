export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT name, location, message, sent_at FROM chat ORDER BY id DESC LIMIT 50`
    ).all();
    return Response.json(results.reverse());
  } catch {
    return Response.json([]);
  }
}

export async function onRequestPost({ env, request }) {
  try {
    const { name, location, message } = await request.json();
    const safeName = (name || 'Anonymous').toString().trim().slice(0, 10);
    const safeLoc  = (location || 'Unknown').toString().slice(0, 50);
    const safeMsg  = (message || '').toString().trim().slice(0, 200);

    if (!safeMsg) return Response.json({ error: 'Empty message' }, { status: 400 });

    await env.DB.prepare(
      `INSERT INTO chat (name, location, message) VALUES (?, ?, ?)`
    ).bind(safeName, safeLoc, safeMsg).run();

    await env.DB.prepare(
      `DELETE FROM chat WHERE id NOT IN (SELECT id FROM chat ORDER BY id DESC LIMIT 50)`
    ).run();

    return Response.json({ ok: true }, { status: 201 });
  } catch {
    return Response.json({ error: 'Failed' }, { status: 500 });
  }
}
