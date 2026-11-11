// POST /api/studio/helper
//
// The Creator Helper bar sends what Ada said plus a description of the page
// she is on. This asks the model for a short reply and a list of page changes,
// and returns both. The browser applies the changes and shows Keep / Put Back.
//
// Settings (Pages environment variables):
//   ANTHROPIC_API_KEY   secret; without it the helper answers 503
//   HELPER_MODEL        optional, defaults to claude-opus-5-5
//   HELPER_NAME         optional, the helper's display name
//   ANTHROPIC_BASE_URL  optional, for tests

import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_HELPER_NAME, buildHelperSystemPrompt } from '../../../server/creatorHelper/systemPrompt.js';

const DEFAULT_MODEL = 'claude-opus-5-5';
// Models where the API can re-run a declined request on another model.
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']);

const MAX_MESSAGE = 400;
const MAX_ITEM_TEXT = 600;
const MAX_ITEMS = 40;
const MAX_HISTORY = 8;

const FONTS = ['hand', 'bangers', 'comic', 'round'];
const SIZES = ['s', 'm', 'l', 'xl'];
const COLORS = ['black', 'blue', 'orange', 'green', 'purple', 'red'];
const BOX_STYLES = ['none', 'box', 'banner'];

const optional = (values) => ({ anyOf: [{ type: 'string', enum: values }, { type: 'null' }] });

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string' },
    actions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['set_text', 'set_style', 'set_box_style'] },
          target: { type: 'string' },
          text: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          font: optional(FONTS),
          size: optional(SIZES),
          color: optional(COLORS),
          box_style: optional(BOX_STYLES),
        },
        required: ['type', 'target', 'text', 'font', 'size', 'color', 'box_style'],
        additionalProperties: false,
      },
    },
  },
  required: ['reply', 'actions'],
  additionalProperties: false,
};

const json = (body, status = 200) => Response.json(body, { status });
const clip = (value, max) => String(value ?? '').slice(0, max);
const oneOf = (value, allowed) => (allowed.includes(value) ? value : null);

// Rebuild the page description from the request, keeping only what the model
// needs and capping sizes. Nothing from the browser is passed through as-is.
function cleanPage(page) {
  const items = (Array.isArray(page?.items) ? page.items : []).slice(0, MAX_ITEMS).map((it) => ({
    target: clip(it?.target, 40),
    text: clip(it?.text, MAX_ITEM_TEXT),
    font: oneOf(it?.font, FONTS),
    size: oneOf(it?.size, SIZES),
    color: oneOf(it?.color, COLORS),
  })).filter((it) => it.target);
  const boxes = (Array.isArray(page?.boxes) ? page.boxes : []).slice(0, MAX_ITEMS).map((b) => ({
    id: clip(b?.id, 40),
    box_style: oneOf(b?.box_style, BOX_STYLES),
  })).filter((b) => b.id);
  return { kind: 'character_card', has_drawing: Boolean(page?.has_drawing), items, boxes };
}

function cleanHistory(history) {
  const turns = (Array.isArray(history) ? history : [])
    .filter((t) => (t?.role === 'user' || t?.role === 'assistant') && typeof t.text === 'string' && t.text.trim())
    .slice(-MAX_HISTORY)
    .map((t) => ({ role: t.role, content: clip(t.text, MAX_ITEM_TEXT) }));
  while (turns.length && turns[0].role !== 'user') turns.shift();
  return turns;
}

// Keep only actions that point at something on this page.
function cleanActions(actions, page) {
  const targets = new Set(page.items.map((it) => it.target));
  const boxIds = new Set(page.boxes.map((b) => b.id));
  return (Array.isArray(actions) ? actions : []).filter((a) =>
    a && (a.type === 'set_box_style' ? boxIds.has(a.target) : targets.has(a.target)));
}

export async function onRequestPost({ request, env }) {
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'helper_not_configured' }, 503);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const message = clip(body?.message, MAX_MESSAGE).trim();
  if (!message) return json({ error: 'empty_message' }, 400);

  const page = cleanPage(body.page);
  const selected = page.items.some((it) => it.target === body.selected) ? body.selected : null;
  const model = env.HELPER_MODEL || DEFAULT_MODEL;

  const client = new Anthropic({
    apiKey: env.ANTHROPIC_API_KEY,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
    maxRetries: 1,
    timeout: 60_000,
  });

  const params = {
    model,
    max_tokens: 16000,
    system: buildHelperSystemPrompt(env.HELPER_NAME || DEFAULT_HELPER_NAME),
    messages: [
      ...cleanHistory(body.history),
      {
        role: 'user',
        content:
          `<page>\n${JSON.stringify(page)}\n</page>\n` +
          `<selected>${selected ?? 'nothing'}</selected>\n\n` +
          `Ada says: ${message}`,
      },
    ],
    // Short, quick answers: this is a chat bar, not a long task.
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
      console.error('helper: API key rejected');
      return json({ error: 'helper_not_configured' }, 503);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`helper: API error ${error.status}: ${error.message}`);
      return json({ error: 'helper_failed' }, 502);
    }
    console.error('helper: request failed', error);
    return json({ error: 'helper_failed' }, 502);
  }

  if (response.stop_reason === 'refusal') {
    return json({ reply: "I can't help with that one. Want to try a different idea?", actions: [] });
  }
  if (response.stop_reason === 'max_tokens') {
    console.error('helper: answer was cut off');
    return json({ error: 'helper_failed' }, 502);
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  let answer;
  try {
    answer = JSON.parse(textBlock.text);
  } catch {
    console.error('helper: answer was not JSON');
    return json({ error: 'helper_failed' }, 502);
  }
  return json({ reply: clip(answer.reply, 1000), actions: cleanActions(answer.actions, page) });
}
