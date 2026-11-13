// POST /api/studio/read
//
// "Read My Words": the photo import sends the straightened sheet of a
// hand-drawn character card (a JPEG). This asks the model to read the
// handwriting and returns the character's name and every text box, with the
// spelling fixed, and where each box is on the sheet. The browser puts them
// on the card and shows Keep It / Put It Back.
//
// Uses the same settings as the helper (ANTHROPIC_API_KEY, HELPER_MODEL,
// ANTHROPIC_BASE_URL).

import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-opus-5-5';
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);
const MAX_PHOTO = 5 * 1024 * 1024;
const MAX_BOXES = 8;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    boxes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          text: { type: 'string' },
          x: { type: 'integer' },
          y: { type: 'integer' },
        },
        required: ['title', 'text', 'x', 'y'],
        additionalProperties: false,
      },
    },
  },
  required: ['name', 'boxes'],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a character card that an 8-year-old drew by hand. Read her handwriting.

- name: the character's name, usually big near the top or the middle. "" if there is none.
- boxes: every text box (an outlined area with writing in it). Leave out words that are part of a drawing, like words on stickers.
  - title: the box's heading. If the box has no heading, a short one that fits what is in it, like "Stats". If the whole box is only a heading (like "No Ability 2"), put all of it in title.
  - text: everything else in the box. One line per list item. Drawn stars and hearts become ★ and ♥.
  - x, y: the middle of the box, from 0 to 1000 across and down the photo.
- Fix spelling and capital letters only. Keep her words, her order and her punctuation.`;

const json = (body, status = 200) => Response.json(body, { status });
const clip = (value, max) => String(value ?? '').slice(0, max);
const at = (value) => Math.min(1000, Math.max(0, Math.round(Number(value) || 0)));

function base64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'helper_not_configured' }, 503);
  if (!(request.headers.get('content-type') || '').startsWith('image/jpeg')) return json({ error: 'bad_request' }, 400);
  const photo = await request.arrayBuffer();
  if (!photo.byteLength || photo.byteLength > MAX_PHOTO) return json({ error: 'bad_request' }, 400);

  const model = env.HELPER_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    maxRetries: 1,
    timeout: 90_000,
  });
  const params = {
    model,
    max_tokens: 16000,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64(photo) } },
        { type: 'text', text: PROMPT },
      ],
    }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: ANSWER_SCHEMA } },
  };
  if (FALLBACK_MODELS.has(model)) {
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  let response;
  try {
    response = await client.beta.messages.create(params);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json({ error: 'busy' }, 429);
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error('read: API key rejected');
      return json({ error: 'helper_not_configured' }, 503);
    }
    console.error('read: request failed', error instanceof Anthropic.APIError ? `${error.status}: ${error.message}` : error);
    return json({ error: 'helper_failed' }, 502);
  }
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    console.error(`read: no answer (${response.stop_reason})`);
    return json({ error: 'helper_failed' }, 502);
  }

  let answer;
  try {
    answer = JSON.parse(response.content.find((block) => block.type === 'text').text);
  } catch {
    console.error('read: answer was not JSON');
    return json({ error: 'helper_failed' }, 502);
  }
  return json({
    name: clip(answer.name, 60),
    boxes: (Array.isArray(answer.boxes) ? answer.boxes : []).slice(0, MAX_BOXES).map((b) => ({
      title: clip(b?.title, 60), text: clip(b?.text, 600), x: at(b?.x), y: at(b?.y),
    })),
  });
}
