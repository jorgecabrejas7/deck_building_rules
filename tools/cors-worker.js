// Optional self-hosted CORS proxy for Archidekt deck loading.
//
// The app reads Archidekt through public proxies, which keep disappearing or
// growing API keys. Deploying this to your own Cloudflare account (free tier:
// 100k requests/day, far more than a pod will ever use) makes deck loading
// depend on nobody else.
//
// Deploy:
//   npx wrangler deploy tools/cors-worker.js --name pod-cors --compatibility-date 2025-01-01
// Then put your worker first in the PROXIES list of app/js/engine/archidekt.js:
//   (u) => ["https://pod-cors.<your-subdomain>.workers.dev/?url=" + encodeURIComponent(u), {}],
//
// Only archidekt.com is forwarded, so the worker cannot be used as an open
// relay against arbitrary hosts.
const ALLOWED_HOST = "archidekt.com";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    if (request.method !== "GET") return new Response("GET only", { status: 405, headers: CORS });

    const target = new URL(request.url).searchParams.get("url");
    if (!target) return new Response("missing ?url=", { status: 400, headers: CORS });

    let parsed;
    try { parsed = new URL(target); } catch (e) { return new Response("bad url", { status: 400, headers: CORS }); }
    if (parsed.protocol !== "https:" || (parsed.hostname !== ALLOWED_HOST && !parsed.hostname.endsWith("." + ALLOWED_HOST)))
      return new Response("host not allowed", { status: 403, headers: CORS });

    const upstream = await fetch(parsed.toString(), { headers: { Accept: "application/json" } });
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...CORS, "Content-Type": upstream.headers.get("Content-Type") || "application/json" },
    });
  },
};
