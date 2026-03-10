export async function onRequestGet({ request }) {
  const cf = request.cf || {};
  const city = cf.city || '';
  const country = cf.country || '';
  const location = city ? `${city}, ${country}` : (country || 'Unknown');
  return Response.json({ location });
}
