/**
 * AI HUB API — Cloudflare Worker (Workers AI)
 *
 *   GET  /health   status + configured models
 *   POST /chat     { message?, messages?, language?, mode?, stream? }
 *                  stream:true  -> text/event-stream  (data: {"response":"..."} ... data: [DONE])
 *                  stream:false -> { "response": "..." }
 *   POST /title    { message, reply, language? } -> { "title": "..." }
 *   POST /image    { prompt, style? } -> { "image": "<base64 png>" }
 *
 * Secrets never live in the browser. The AI binding is configured in wrangler.toml.
 */

const BASE_PROMPT =
  "You are AI HUB, a friendly and accurate AI assistant built by Syed Hasan Shah. " +
  "If asked who made you, say AI HUB was built by Syed Hasan Shah. " +
  "Be concise by default. Use Markdown: short paragraphs, lists, and fenced code blocks with a language tag. " +
  "If you are not sure about something, say so instead of guessing, and never invent sources or links.";

const MODES = {
  general: "",
  tutor:
    "Act as a patient tutor. Explain step by step in simple words with one everyday example, then check understanding. " +
    "When asked for practice questions, write multiple-choice questions with four options, the correct answer, and a one-line explanation.",
  coder:
    "Act as a senior software engineer. Give working code in fenced blocks with a language tag, explain the key idea briefly, " +
    "point out edge cases and likely bugs, and ask for missing details only when they are truly needed.",
  writer:
    "Act as a skilled writing assistant. Produce clear, well-structured drafts that match the requested tone and length. " +
    "Offer one short alternative when it helps. Do not pad.",
  translator:
    "Act as a translator between English, Urdu (Urdu script), Roman Urdu (Urdu in Latin letters) and Hindi (Devanagari). " +
    "Translate faithfully, keep names and numbers, and add a short note only when a phrase has nuance. " +
    "If the target language is not stated, translate Urdu, Roman Urdu and Hindi into English, and English into Urdu."
};

const LANGUAGES = {
  auto: "Reply in the same language and script the user writes in.",
  en: "Always reply in English.",
  ur: "Always reply in Urdu, written in Urdu (Nastaliq/Arabic) script.",
  roman: "Always reply in Roman Urdu: Urdu written with English letters, not in Urdu script.",
  hi: "Always reply in Hindi, written in Devanagari script."
};

const IMAGE_STYLES = {
  auto: "",
  photo: "ultra realistic photograph, natural lighting, sharp detail",
  cinematic: "cinematic still, dramatic lighting, shallow depth of field, film grain",
  anime: "anime illustration, clean line art, vibrant colors",
  "3d": "3D render, soft studio lighting, high detail, smooth materials",
  watercolor: "watercolor painting, soft washes, visible paper texture",
  minimal: "minimalist flat vector illustration, clean composition, limited palette"
};

const DEFAULT_ORIGINS = "https://syedhasanshahqadri-ops.github.io,http://localhost:8000,http://127.0.0.1:8000";
const MAX_BODY_BYTES = 64 * 1024;

/* ---------- small helpers ---------- */

function corsFor(request, env) {
  const origin = request.headers.get("Origin");
  const allowed = String(env.ALLOWED_ORIGINS || DEFAULT_ORIGINS).split(",").map((s) => s.trim()).filter(Boolean);
  const base = { Vary: "Origin" };
  if (!origin) return { headers: base, allowed: true };
  if (allowed.includes("*") || allowed.includes(origin)) {
    return {
      allowed: true,
      headers: {
        ...base,
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400"
      }
    };
  }
  return { headers: base, allowed: false };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...(headers || {}) }
  });
}

/* Best-effort per-isolate rate limit. For strict limits, add a Cloudflare Rate Limiting rule or KV/Durable Object. */
const buckets = new Map();
function rateLimited(request, env, cost) {
  const limit = Number(env.RATE_LIMIT_PER_MIN) || 30;
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const now = Date.now();
  if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
  let b = buckets.get(ip);
  if (!b || b.reset < now) { b = { count: 0, reset: now + 60000 }; buckets.set(ip, b); }
  b.count += cost;
  return b.count > limit ? Math.max(1, Math.ceil((b.reset - now) / 1000)) : 0;
}

async function readJson(request) {
  const len = Number(request.headers.get("Content-Length") || 0);
  if (len > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large.");
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "Request is too large.");
  try { return JSON.parse(text || "{}"); } catch (_) { throw new HttpError(400, "Request body must be valid JSON."); }
}

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }

const textModel = (env) => env.TEXT_MODEL || "@cf/meta/llama-3.1-8b-instruct";
const imageModel = (env) => env.IMAGE_MODEL || "@cf/black-forest-labs/flux-1-schnell";
function needAI(env) { if (!env.AI) throw new HttpError(500, "The AI binding is not configured. Check wrangler.toml."); }

function systemPrompt(mode, language) {
  const parts = [BASE_PROMPT];
  if (MODES[mode]) parts.push(MODES[mode]);
  parts.push(LANGUAGES[language] || LANGUAGES.auto);
  return parts.filter(Boolean).join("\n\n");
}

function pickText(out) {
  if (!out) return "";
  if (typeof out === "string") return out;
  return String(out.response ?? (out.result && out.result.response) ?? (out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) ?? "");
}

/* ---------- routes ---------- */

async function chat(request, env) {
  needAI(env);
  const body = await readJson(request);
  let msgs = Array.isArray(body.messages) ? body.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) }));
  if (!msgs.length && typeof body.message === "string" && body.message.trim()) msgs = [{ role: "user", content: body.message.slice(0, 4000) }];
  if (!msgs.length || msgs[msgs.length - 1].role !== "user") throw new HttpError(400, "A message is required.");

  const input = {
    messages: [{ role: "system", content: systemPrompt(body.mode, body.language) }, ...msgs],
    max_tokens: Math.min(Number(env.MAX_TOKENS) || 1024, 4096),
    temperature: 0.7
  };

  if (body.stream) {
    const stream = await env.AI.run(textModel(env), { ...input, stream: true });
    return { stream };
  }
  const text = pickText(await env.AI.run(textModel(env), input)).trim();
  if (!text) throw new HttpError(502, "The AI model returned an empty answer.");
  return { data: { response: text, model: textModel(env) } };
}

async function title(request, env) {
  needAI(env);
  const body = await readJson(request);
  const q = String(body.message || "").slice(0, 400), a = String(body.reply || "").slice(0, 400);
  if (!q) throw new HttpError(400, "A message is required.");
  const lang = body.language && body.language !== "auto" ? " " + LANGUAGES[body.language] : " Use the same language as the user.";
  const out = await env.AI.run(textModel(env), {
    messages: [
      { role: "system", content: "Write a short title (at most 5 words) for this conversation. Reply with the title only: no quotes, no punctuation at the end." + lang },
      { role: "user", content: "User: " + q + "\nAssistant: " + a }
    ],
    max_tokens: 24,
    temperature: 0.3
  });
  const t = pickText(out).replace(/["“”\n\r]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return { data: { title: t || q.slice(0, 40) } };
}

async function enhanceImagePrompt(env, prompt) {
  try {
    const out = await env.AI.run(textModel(env), {
      messages: [
        { role: "system", content: "Rewrite the user's idea as one vivid English image-generation prompt of at most 50 words. Describe subject, setting, lighting and mood. Reply with the prompt only." },
        { role: "user", content: prompt }
      ],
      max_tokens: 120,
      temperature: 0.5
    });
    const t = pickText(out).replace(/["\n\r]/g, " ").trim();
    return t.length > 8 ? t.slice(0, 600) : prompt;
  } catch (_) { return prompt; }
}

async function image(request, env) {
  needAI(env);
  const body = await readJson(request);
  const raw = String(body.prompt || "").trim();
  if (!raw) throw new HttpError(400, "Describe the image you want.");
  if (raw.length > 800) throw new HttpError(400, "The image description is too long (800 characters max).");

  const nonLatin = /[^\u0000-\u024F\s\d\p{P}\p{S}]/u.test(raw);
  let prompt = nonLatin || env.IMAGE_ENHANCE === "always" ? await enhanceImagePrompt(env, raw) : raw;
  const style = IMAGE_STYLES[body.style] || "";
  if (style) prompt += ", " + style;

  const out = await env.AI.run(imageModel(env), { prompt: prompt.slice(0, 1000), steps: 4 });
  if (out && typeof out.image === "string" && out.image) return { data: { image: out.image } };
  if (out && (out instanceof ReadableStream || out instanceof ArrayBuffer || ArrayBuffer.isView(out))) return { binary: out };
  throw new HttpError(502, "The image model did not return an image.");
}

/* ---------- entry ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = corsFor(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: cors.allowed ? 204 : 403, headers: cors.headers });
    if (!cors.allowed) return json({ error: "This origin is not allowed." }, 403, cors.headers);

    try {
      if (request.method === "GET" && url.pathname === "/health") {
        return json({ ok: true, service: "ai-hub-api", version: "2.0.0", model: textModel(env), image_model: imageModel(env) }, 200, cors.headers);
      }
      if (request.method !== "POST") return json({ error: "Not found." }, 404, cors.headers);

      const routes = { "/chat": [chat, 1], "/title": [title, 1], "/image": [image, 5] };
      const route = routes[url.pathname.replace(/\/+$/, "")];
      if (!route) return json({ error: "Not found." }, 404, cors.headers);

      const wait = rateLimited(request, env, route[1]);
      if (wait) return json({ error: "Too many requests. Please wait " + wait + " seconds and try again." }, 429, { ...cors.headers, "Retry-After": String(wait) });

      const r = await route[0](request, env);
      if (r.stream) return new Response(r.stream, { headers: { ...cors.headers, "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
      if (r.binary) return new Response(r.binary, { headers: { ...cors.headers, "Content-Type": "image/png", "Cache-Control": "no-store" } });
      return json(r.data, 200, cors.headers);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status, cors.headers);
      console.error("AI HUB API error:", err && err.message ? err.message : err);
      return json({ error: "The AI service had a problem. Please try again in a moment." }, 500, cors.headers);
    }
  }
};
