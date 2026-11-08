/**
 * Proxy Serverless para o Chat PISA (Cloudflare Worker).
 * Copyright (c) 2026 José Edson Sebastião (PPGIA/UFRPE). MIT License (see LICENSE).
 *
 * Permite que os visitantes utilizem o Chat PISA no GitHub Pages SEM precisar
 * informar uma API Key própria, mantendo a chave do autor 100% segura em uma
 * variável secreta do servidor (env.GEMINI_API_KEY) e nunca exposta no HTML/JS.
 *
 * Como implantar gratuitamente (Cloudflare Workers):
 *   1. Crie um Worker em https://dash.cloudflare.com/ e cole este arquivo.
 *   2. Em Settings -> Variables and Secrets, adicione o Secret `GEMINI_API_KEY`
 *      com sua chave do Google AI Studio (`AIza...`).
 *   3. Copie a URL do Worker (ex.: https://chat-pisa-proxy.seu-nome.workers.dev)
 *      e configure-a em `PROXY_URL` no arquivo `docs/app.js`.
 */
const ALLOWED_MODELS = new Set([
  "gemini-embedding-001:embedContent",
  "gemini-flash-latest:generateContent",
  "gemini-flash-latest:streamGenerateContent",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: CORS });
    }
    const url = new URL(request.url);
    const action = url.pathname.replace(/^\/+/, "");
    if (!ALLOWED_MODELS.has(action)) {
      return new Response("Forbidden model/action", { status: 403, headers: CORS });
    }
    const target = `https://generativelanguage.googleapis.com/v1beta/models/${action}${url.search}`;
    const upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      body: await request.text(),
    });
    const headers = new Headers(CORS);
    headers.set("Content-Type", upstream.headers.get("Content-Type") || "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
