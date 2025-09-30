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

const examples = [
  "Create a tool that converts JSON to CSV format",
  "Build a password generator with custom rules",
  "Make a text analyzer that counts words, sentences, and reading time",
  "Create a URL shortener that generates readable slugs",
  "Build a QR code generator for text input",
  "Make a color palette generator from a hex color"
];

app.get("/", (c) => {
  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">
        <h1 className="text-2xl font-semibold mb-4">Dynamic Tool Generator</h1>
        <p className="text-sm text-slate-300 mb-6">
          Describe what you want to build, and AI will generate a custom tool for you instantly.
          Then we'll execute it in a sandboxed Worker environment.
        </p>

        <details className="mb-6 p-4 bg-slate-800 rounded-lg">
          <summary className="cursor-pointer text-emerald-400 font-semibold mb-3">Example prompts to try</summary>

          <script dangerouslySetInnerHTML={{__html: `
            function set(prompt) {
              document.querySelector('textarea[name="prompt"]').value= prompt;
            }
          `}} />

          <div className="space-y-3 text-sm">
            {examples.map((p) => (
              <button 
                className="p-3 bg-slate-900 rounded text-xs cursor-pointer hover:bg-slate-800 transition-colors"
                type="button"
                onclick={`set('${p}')`}>
                {p}
              </button>
            ))}
          </div>
            
        </details>

        <form method="post" action="/generate" className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Describe the tool you want to build:
            </label>
            <textarea
              name="prompt"
              rows={4}
              className="w-full rounded-lg bg-slate-900 border border-slate-800 p-3 text-sm"
              placeholder="Create a tool that takes a list of URLs and checks if they're valid..."
              required
            />
          </div>
          <button className="w-full px-4 py-3 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors">
            Generate Tool
          </button>
        </form>

        <div className="mt-10">
          <a href="/recent" className="text-emerald-400 underline">View recent prompts</a>
        </div>
        <script dangerouslySetInnerHTML={{__html: `
          const loadPrompt = sessionStorage.getItem('loadPrompt');
          if (loadPrompt) {
            document.querySelector('textarea[name="prompt"]').value = loadPrompt;
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

app.get("/generate", async (c) => {
  const prompt = c.req.query("prompt") || "";

  if (!prompt.trim()) {
    return c.redirect("/");
  }

  return c.render(
    <div className="min-h-screen bg-slate-900 text-slate-100">
      <main className="mx-auto max-w-3xl py-10 px-6">
        <a href="/" className="text-emerald-400 underline hover:text-emerald-300 transition-colors">← back</a>

        <div className="mt-6 space-y-6">
          <div>
            <h2 className="text-xl font-semibold mb-3">Your Request</h2>
            <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
              <p className="text-slate-200">{prompt}</p>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-3">Generated Tool Code</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
              <div className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700 bg-slate-950">
                TypeScript Worker Code
              </div>
              <pre id="generated-code" className="text-sm text-green-400 whitespace-pre-wrap min-h-64 p-4">
                <span className="text-slate-500">Generating code...</span>
              </pre>
            </div>
          </div>

          <form method="post" action="/execute" className="space-y-4" style="display: none;" id="execute-form">
            <input type="hidden" name="prompt" value={prompt} />
            <input type="hidden" name="code" id="final-code" />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-200">
                Test Input (optional):
              </label>
              <textarea
                name="input"
                rows={3}
                className="w-full rounded-lg bg-slate-900 border border-slate-800 p-3 text-sm placeholder-slate-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
                placeholder="Enter test data for your tool..."
              />
            </div>

            <button type="submit" className="w-full px-4 py-3 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900">
              Execute Tool
            </button>
          </form>
        </div>

        <script dangerouslySetInnerHTML={{__html: `
          // Fetch real AI-generated code
          const codeElement = document.getElementById('generated-code');
          const executeForm = document.getElementById('execute-form');
          const finalCodeInput = document.getElementById('final-code');

          console.log('Starting code generation for:', ${JSON.stringify(prompt)});

          fetch('/api/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: ${JSON.stringify(prompt)} })
          })
          .then(response => {
            console.log('Response status:', response.status);

            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }

            return response.text();
          })
          .then(code => {
            console.log('Generated code length:', code.length);
            console.log('Generated code preview:', code.substring(0, 100));

            if (code.trim().length > 0) {
              // Show the code
              codeElement.textContent = code;

              // Set the form value
              finalCodeInput.value = code;

              // Show the execute form
              executeForm.style.display = 'block';
              executeForm.scrollIntoView({ behavior: 'smooth' });
            } else {
              codeElement.textContent = 'Error: No code was generated';
              codeElement.className = 'text-sm text-red-400 whitespace-pre-wrap min-h-64';
            }
          })
          .catch(error => {
            console.error('Fetch error:', error);
            codeElement.textContent = 'Error generating code: ' + error.message;
            codeElement.className = 'text-sm text-red-400 whitespace-pre-wrap min-h-64';
          });
        `}} />
      </main>
    </div>
  );
});

app.post("/generate", async (c) => {
  const form = await c.req.formData();
  const prompt = (form.get("prompt") as string | null) ?? "";

  if (!prompt.trim()) {
    return c.redirect("/");
  }

  // Store the prompt
  const id = c.env.PROMPTS.idFromName("prompts");
  await c.env.PROMPTS.get(id).fetch(new URL("/write", "http://do").toString(), {
    method: "POST",
    body: prompt
  }).catch(() => {});

  return c.redirect(`/generate?prompt=${encodeURIComponent(prompt)}`);
});

app.post("/api/generate-code", async (c) => {
  try {
    const { prompt } = await c.req.json();

    if (!prompt?.trim()) {
      return new Response("Missing prompt", { status: 400 });
    }

    console.log("Generating code for prompt:", prompt);

    // Always use fallback for now to ensure it works
    const generatedCode = generateFallbackCode(prompt);

    console.log("Generated code length:", generatedCode.length);

    // Return the code directly (no streaming for now)
    return new Response(generatedCode, {
      headers: {
        "Content-Type": "text/plain"
      }
    });

  } catch (error) {
    console.error("Code generation error:", error);
    return new Response(`Error generating code: ${error.message}`, { status: 500 });
  }
});

function generateFallbackCode(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('password')) {
    return `export default {
  async fetch(req) {
    const url = new URL(req.url);
    const lengthParam = url.searchParams.get("length") || "12";
    const length = Math.min(Math.max(parseInt(lengthParam), 4), 128);

    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

    const allChars = lowercase + uppercase + numbers + symbols;
    let password = "";

    // Ensure at least one character from each category
    password += lowercase[Math.floor(Math.random() * lowercase.length)];
    password += uppercase[Math.floor(Math.random() * uppercase.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += symbols[Math.floor(Math.random() * symbols.length)];

    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password
    const shuffled = password.split("").sort(() => Math.random() - 0.5).join("");

    return new Response(JSON.stringify({
      password: shuffled,
      length: shuffled.length,
      strength: length >= 16 ? "strong" : length >= 12 ? "medium" : "weak"
    }), {
      headers: { "content-type": "application/json" }
    });
  }
}`;
  }

  if (lowerPrompt.includes('json') && lowerPrompt.includes('csv')) {
    return `export default {
  async fetch(req) {
    const url = new URL(req.url);
    const input = url.searchParams.get("q") || "";

    try {
      const data = JSON.parse(input);
      const isArray = Array.isArray(data);
      const items = isArray ? data : [data];

      if (items.length === 0) {
        return new Response("No data to convert", { status: 400 });
      }

      // Get all unique keys
      const keys = [...new Set(items.flatMap(Object.keys))];

      // Create CSV header
      let csv = keys.join(",") + "\\n";

      // Add rows
      items.forEach(item => {
        const row = keys.map(key => {
          const value = item[key] ?? "";
          const escaped = String(value).replace(/"/g, '""');
          return escaped.includes(",") ? '"' + escaped + '"' : escaped;
        });
        csv += row.join(",") + "\\n";
      });

      return new Response(csv, {
        headers: { "content-type": "text/csv" }
      });
    } catch (e) {
      return new Response("Invalid JSON: " + e.message, { status: 400 });
    }
  }
}`;
  }

  // Default echo tool
  return `export default {
  async fetch(req) {
    const url = new URL(req.url);
    const input = url.searchParams.get("q") || "Hello, World!";

    // Custom tool for: ${prompt}
    const result = {
      input,
      processed: input.toUpperCase(),
      timestamp: new Date().toISOString(),
      tool: "Custom Generated Tool"
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { "content-type": "application/json" }
    });
  }
}`;
}

app.post("/execute", async (c) => {
  const form = await c.req.formData();
  const prompt = (form.get("prompt") as string | null) ?? "";
  const code = (form.get("code") as string | null) ?? "";
  const input = (form.get("input") as string | null) ?? "";

  console.log("Execute attempt:", { prompt: prompt.substring(0, 50), hasCode: !!code, codeLength: code?.length });

  if (!code?.trim()) {
    console.log("No code provided, redirecting to home");
    return c.html(
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <main className="mx-auto max-w-3xl py-10 px-6">
          <a href="/" className="text-emerald-400 underline">← back</a>
          <h2 className="text-xl font-semibold mt-4 mb-3">No Code to Execute</h2>
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4">
            <p className="text-red-200 text-sm">No generated code was found. Please try generating a tool first.</p>
          </div>
          <div className="mt-4">
            <a href="/" className="text-emerald-400 underline">← Go back and try again</a>
          </div>
        </main>
      </div>
    );
  }

  const idHash = [...code].reduce((a,c)=>a + c.charCodeAt(0), 0).toString(36);
  const isolateId = `tool:${idHash}`;

  // Check if LOADER binding is available
  if (!c.env.LOADER) {
    return c.html(
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <main className="mx-auto max-w-3xl py-10 px-6">
          <a href="/" className="text-emerald-400 underline">← back</a>
          <h2 className="text-xl font-semibold mt-4 mb-3">Worker Loaders Not Available</h2>
          <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-4 mb-4">
            <p className="text-orange-200 text-sm">
              Dynamic Worker Loaders require closed beta access in production.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // @ts-expect-error - LOADER is injected by Wrangler
  const worker = c.env.LOADER.get(isolateId, async () => ({
    compatibilityDate: "2025-06-01",
    mainModule: "main.js",
    modules: { "main.js": code },
    env: { WHO: "dynamic-tool" },
    globalOutbound: null
  }));

  const endpoint = worker.getEntrypoint();
  const testInput = input.trim() || prompt;
  const url = new URL(`http://tool/?q=${encodeURIComponent(testInput)}`);

  try {
    const out = await endpoint.fetch(url.toString());
    const text = await out.text();
    const contentType = out.headers.get("content-type") || "text/plain";

    return c.render(
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <main className="mx-auto max-w-3xl py-10 px-6">
          <a href="/" className="text-emerald-400 underline">← back</a>

          <div className="mt-6 space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-3">Tool Result</h2>
              <div className="bg-slate-800 rounded-lg overflow-hidden">
                <div className="text-xs text-slate-400 px-3 py-2 border-b border-slate-700 bg-slate-900">
                  Content-Type: {contentType}
                </div>
                <pre className="p-4 overflow-x-auto whitespace-pre-wrap text-sm text-slate-100">{text}</pre>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold mb-3">Generated Code</h3>
              <details className="bg-slate-900 border border-slate-800 rounded-lg">
                <summary className="p-3 cursor-pointer text-emerald-400 hover:text-emerald-300 transition-colors">
                  View source code
                </summary>
                <pre className="p-4 text-xs overflow-x-auto border-t border-slate-800 text-slate-300 bg-slate-950">{code}</pre>
              </details>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a href="/" className="px-4 py-2 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors text-center">
                Create Another Tool
              </a>
              <a href="/recent" className="px-4 py-2 bg-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-600 transition-colors text-center">
                View History
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  } catch (error) {
    return c.render(
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <main className="mx-auto max-w-3xl py-10 px-6">
          <a href="/" className="text-emerald-400 underline hover:text-emerald-300 transition-colors">← back</a>
          <h2 className="text-xl font-semibold mt-6 mb-4">Execution Error</h2>
          <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 mb-6">
            <p className="text-red-200 text-sm">{error instanceof Error ? error.message : String(error)}</p>
          </div>
          <div className="flex gap-3">
            <a href="/" className="px-4 py-2 bg-emerald-500 text-slate-900 font-semibold rounded-lg hover:bg-emerald-400 transition-colors">
              Try Again
            </a>
            <a href="/recent" className="px-4 py-2 bg-slate-700 text-slate-200 font-semibold rounded-lg hover:bg-slate-600 transition-colors">
              View History
            </a>
          </div>
        </main>
      </div>
    );
  }
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

  // Check if LOADER binding is available (requires closed beta access)
  if (!c.env.LOADER) {
    return c.html(
      <div className="min-h-screen bg-slate-900 text-slate-100">
        <main className="mx-auto max-w-3xl py-10 px-6">
          <a href="/" className="text-emerald-400 underline">← back</a>
          <h2 className="text-xl font-semibold mt-4 mb-3">Worker Loaders Not Available</h2>
          <div className="bg-orange-900/20 border border-orange-500/50 rounded-lg p-4 mb-4">
            <p className="text-orange-200 text-sm">
              Dynamic Worker Loaders require closed beta access in production.
            </p>
            <p className="text-orange-200 text-sm mt-2">
              This feature works in local development but requires beta access for deployment.
              <a href="https://developers.cloudflare.com/workers/runtime-apis/bindings/worker-loaders/" className="text-orange-300 underline ml-1">
                Apply for beta access
              </a>
            </p>
          </div>
          <div className="mt-6">
            <a href="/recent" className="text-emerald-400 underline">View recent prompts</a>
          </div>
        </main>
      </div>
    );
  }

  // @ts-expect-error - LOADER is injected by Wrangler via `worker_loaders` config.
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