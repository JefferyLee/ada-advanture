// Gate for everything under /api/studio: only signed-in family members get in.
//
// Cloudflare Access sits in front of the site and adds a signed token to each
// request it lets through. Checking the token here means the API stays closed
// even if a hostname is ever left out of the Access setup.
//
// Settings (Pages environment variables):
//   ACCESS_TEAM_DOMAIN   e.g. "myteam.cloudflareaccess.com"
//   ACCESS_AUD           the Access application's audience tag; several can be
//                        given separated by commas (production and preview)
//   STUDIO_DEV_NO_AUTH   "1" skips the check, on localhost only

const CERT_TTL_MS = 60 * 60 * 1000;
let certCache = { domain: null, at: 0, keys: [] };

const json = (body, status) => Response.json(body, { status });

const b64urlToBytes = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const b64urlToJson = (s) => JSON.parse(new TextDecoder().decode(b64urlToBytes(s)));

async function accessKeys(teamDomain, now) {
  if (certCache.domain !== teamDomain || now - certCache.at > CERT_TTL_MS) {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`Access certs: HTTP ${res.status}`);
    certCache = { domain: teamDomain, at: now, keys: (await res.json()).keys || [] };
  }
  return certCache.keys;
}

// Returns the token's claims if it is a valid Access token for one of the
// given audiences, otherwise null.
export async function verifyAccessToken(token, teamDomain, audiences, now = Date.now()) {
  const parts = String(token).split('.');
  if (parts.length !== 3) return null;
  let header;
  let claims;
  let signature;
  try {
    header = b64urlToJson(parts[0]);
    claims = b64urlToJson(parts[1]);
    signature = b64urlToBytes(parts[2]);
  } catch {
    return null;
  }
  if (header.alg !== 'RS256') return null;

  const jwk = (await accessKeys(teamDomain, now)).find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'],
  );
  const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
  if (!(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed))) return null;

  const tokenAud = [].concat(claims.aud ?? []);
  if (!tokenAud.some((a) => audiences.includes(a))) return null;
  if (claims.iss !== `https://${teamDomain}`) return null;
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) return null;
  if (typeof claims.nbf === 'number' && claims.nbf * 1000 > now + 60_000) return null;
  return claims;
}

function tokenFrom(request) {
  const header = request.headers.get('Cf-Access-Jwt-Assertion');
  if (header) return header;
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return match ? match[1] : null;
}

export async function onRequest({ request, env, next }) {
  const { hostname } = new URL(request.url);
  const local = hostname === 'localhost' || hostname === '127.0.0.1';
  if (local && env.STUDIO_DEV_NO_AUTH === '1') return next();

  const teamDomain = env.ACCESS_TEAM_DOMAIN;
  const audiences = String(env.ACCESS_AUD || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!teamDomain || audiences.length === 0) return json({ error: 'access_not_configured' }, 503);

  const token = tokenFrom(request);
  if (!token) return json({ error: 'sign_in_required' }, 401);

  let claims;
  try {
    claims = await verifyAccessToken(token, teamDomain, audiences);
  } catch {
    return json({ error: 'access_check_failed' }, 503);
  }
  if (!claims) return json({ error: 'not_allowed' }, 403);
  return next();
}
