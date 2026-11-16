// The studio page on the family's own domain asks for the PIN first (see
// server/studio/pin.js). On the other hostnames Cloudflare Access guards it
// before a request gets here.
import { hasPin, pinHost, pinPage } from '../../server/studio/pin.js';

export async function onRequest({ request, env, next }) {
  if (!pinHost(env, new URL(request.url).hostname)) return next();
  if (request.method !== 'POST' && (await hasPin(request, env))) return next();
  return pinPage(request, env);
}
