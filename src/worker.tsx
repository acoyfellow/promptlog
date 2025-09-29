import { Hono } from "hono";
import { jsxRenderer } from "hono/jsx-renderer";
import { html } from "hono/html";
import { Effect, Schema, Layer } from "effect";

import type { Cloudflare } from "cloudflare:workers";
import { PromptLog } from "./do";

export { PromptLog };

const PromptSchema = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(16_384));

const app = new Hono<{ Bindings: Cloudflare.Env }>();

const defaultCode = `// Type ESM code for a Worker module here (default below).
// Must export default { fetch(req, env, ctx) { ... } }
export default {
  async fetch(req, env, ctx) {
    const { searchParams } = new URL(req.url);
    const prompt = searchParams.get("q") ?? "Hello";
    return new Response(prompt.toUpperCase(), { headers: { "content-type": "text/plain" }});
  }
}
`;

app.use(
  "*",
  jsxRenderer(
    ({ children }) => html`<!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>Worker Loaders (CF) POC</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Google+Sans+Code:ital,wght@0,300..800;1,300..800&display=swap" rel="stylesheet">
          <style>
            *{
              font-family: "Google Sans Code", monospace;
            }
          </style>
        </head>
        <body>
          ${children}
        </body>
      </html>`
  )
);

app.get("/", (c) => {
  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">
        <h1 className="text-2xl font-semibold mb-4">Cloudflare Dynamic Worker Loader POC</h1>
        <p className="text-sm text-slate-300 mb-6">
          This POC spins up a dynamic isolate per request using the Worker Loader API and runs your code in a sandbox (no outbound network).
          The <strong>prompt</strong> gets passed as the <code>?q=</code> query parameter to your dynamic worker.
        </p>

        <details className="mb-6 p-4 bg-slate-800 rounded-lg">
          <summary className="cursor-pointer text-emerald-400 font-semibold mb-3">Quick examples to try</summary>

          <div className="space-y-4 text-sm">
            <div>
              <h4 className="text-slate-200 font-semibold mb-2">1) Reverse the prompt</h4>
              <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">{`export default {
  async fetch(req) {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const out = q.split("").reverse().join("");
    return new Response(out, { headers: { "content-type": "text/plain" }});
  }
}`}</pre>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-2">2) JSON echo with timing</h4>
              <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">{`export default {
  async fetch(req) {
    const t0 = Date.now();
    const q = new URL(req.url).searchParams.get("q");
    const body = { q, now: new Date().toISOString(), tookMs: Date.now() - t0 };
    return new Response(JSON.stringify(body, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
}`}</pre>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-2">3) Hash the prompt (crypto.subtle)</h4>
              <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">{`export default {
  async fetch(req) {
    const q = new URL(req.url).searchParams.get("q") ?? "";
    const data = new TextEncoder().encode(q);
    const buf = await crypto.subtle.digest("SHA-256", data);
    const hex = [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2,"0")).join("");
    return new Response(hex, { headers: { "content-type": "text/plain" }});
  }
}`}</pre>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-2">4) Tiny router inside the child worker</h4>
              <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">{`export default {
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/json") {
      return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" }});
    }
    return new Response("root", { headers: { "content-type": "text/plain" }});
  }
}`}</pre>
            </div>

            <div>
              <h4 className="text-slate-200 font-semibold mb-2">5) Simple template for your own logic</h4>
              <pre className="bg-slate-900 p-3 rounded text-xs overflow-x-auto">{`export default {
  async fetch(req, env, ctx) {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "Hello";
    // Your pure compute / transform / validation logic here:
    const result = q.toUpperCase() + " from " + (env?.WHO ?? "sandbox");
    return new Response(result, { headers: { "content-type": "text/plain" }});
  }
}`}</pre>
            </div>
          </div>
        </details>

        <details className="mb-6 p-4 bg-slate-800 rounded-lg">
          <summary className="cursor-pointer text-emerald-400 font-semibold mb-3">What's happening under the hood (why this is cool)</summary>
          <div className="text-sm text-slate-300 space-y-2">
            <p>• Your main Hono worker creates/looks up a dynamic worker isolate keyed by your code hash.</p>
            <p>• That isolate runs only in memory with the code you supplied—no deploy needed.</p>
            <p>• It's perfect for sandboxing user scripts, per-tenant transforms, on-the-fly routers, and blog-worthy "load a worker, run it, throw it away" demos.</p>
          </div>
        </details>

        <form method="post" action="/run" className="space-y-4">
          <textarea
            name="code"
            rows={16}
            className="w-full rounded-lg bg-slate-900 border border-slate-800 p-3 font-mono text-sm"
            placeholder={defaultCode}
          >{defaultCode}</textarea>
          <div className="flex items-center gap-3">
            <input
              className="flex-1 rounded bg-slate-900 border border-slate-800 p-2"
              name="prompt"
              placeholder="type a prompt..."
              required
            />
            <button className="px-4 py-2 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400">
              Run
            </button>
          </div>
        </form>

        <div className="mt-10">
          <a href="/recent" className="text-emerald-400 underline">View recent prompts</a>
        </div>
        <script dangerouslySetInnerHTML={{__html: `
          const loadPrompt = sessionStorage.getItem('loadPrompt');
          if (loadPrompt) {
            document.querySelector('input[name="prompt"]').value = loadPrompt;
            sessionStorage.removeItem('loadPrompt');
          }
        `}} />
      </main>
    </div>
    );
});

app.get("/recent", async (c) => {
  const id = c.env.PROMPTS.idFromName("prompts");
  const stub = c.env.PROMPTS.get(id);
  const res = await stub.fetch(new URL("/list", "http://do").toString());
  const recent: string[] = await res.json();
  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Recent prompts</h2>
          <button
            onClick="clearPrompts()"
            className="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600"
          >
            Clear All
          </button>
        </div>
        <ul className="space-y-2">
          {recent.length === 0 && (<small className="text-slate-300">
            No prompts yet
          </small>)}
          {recent.map((p, i) => (
            <li key={i} className="group">
              <button
                onClick={`loadPrompt('${p.replace(/'/g, "\\'")}')`}
                className="w-full text-left p-3 text-sm text-slate-300 whitespace-pre-wrap break-words border border-slate-800 rounded hover:border-slate-600 hover:bg-slate-800 transition-colors cursor-pointer"
              >
                {p || "(no prompt)"}
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-6">
          <a href="/" className="text-emerald-400 underline">Back</a>
        </div>
        <script dangerouslySetInnerHTML={{__html: `
          function clearPrompts() {
            if (confirm('Clear all prompts?')) {
              fetch('/clear', { method: 'DELETE' })
                .then(() => location.reload());
            }
          }
          function loadPrompt(prompt) {
            sessionStorage.setItem('loadPrompt', prompt);
            window.location.href = '/';
          }
        `}} />
      </main>
    </div>
  );
});

app.delete("/clear", async (c) => {
  const id = c.env.PROMPTS.idFromName("prompts");
  await c.env.PROMPTS.get(id).fetch(new URL("/clear", "http://do").toString(), {
    method: "DELETE"
  });
  return new Response("cleared");
});

app.post("/run", async (c) => {
  const form = await c.req.formData();
  const code = (form.get("code") as string | null) ?? "";
  const prompt = (form.get("prompt") as string | null) ?? "";

  const program = Schema.decodeUnknown(PromptSchema)(prompt);

  const result = await Effect.runPromise(
    program.pipe(
      Effect.retry({
        times: 2,
      })
    )
  ).catch((_e) => "");

  const id = c.env.PROMPTS.idFromName("prompts");
  await c.env.PROMPTS.get(id).fetch(new URL("/write", "http://do") .toString(), {
    method: "POST",
    body: result
  }).catch(() => {});

  const userModule = (code && code.trim().length > 0)
    ? code
    : `export default {
        async fetch(req, env, ctx) {
          const { searchParams } = new URL(req.url);
          const prompt = searchParams.get("q") ?? "Hello";
          return new Response(prompt.toUpperCase(), { headers: { "content-type": "text/plain" }});
        }
      }`;

  const idHash = [...userModule].reduce((a,c)=>a + c.charCodeAt(0), 0).toString(36);
  const isolateId = `demo:${idHash}`;

  // @ts-expect-error - LOADER is injected by Wrangler/Alchemy via `worker_loaders` config.
  const worker = c.env.LOADER.get(isolateId, async () => ({
    compatibilityDate: "2025-06-01",
    mainModule: "main.js",
    modules: {
      "main.js": userModule
    },
    env: {
      WHO: "dynamic-sandbox"
    },
    globalOutbound: null
  }));

  const endpoint = worker.getEntrypoint();
  const url = new URL(`http://sandbox/run?q=${encodeURIComponent(result || prompt)}`);
  const out = await endpoint.fetch(url.toString());
  const text = await out.text();

  return c.html(
    <main className="mx-auto max-w-3xl py-10 px-6">
      <a href="/" className="text-emerald-400 underline">← back</a>
      <h2 className="text-xl font-semibold mt-4 mb-3">Result</h2>
      <pre className="bg-slate-900 border border-slate-800 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">{text}</pre>
      <div className="mt-6">
        <a href="/recent" className="text-emerald-400 underline">View recent prompts</a>
      </div>
    </main>
  );
});

export default {
  fetch: app.fetch,
} satisfies ExportedHandler<Cloudflare.Env>;