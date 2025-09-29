# Cloudflare Dynamic Worker Loader Demo

A proof-of-concept demonstrating Cloudflare's Dynamic Worker Loader API in local development. This allows you to spin up Worker isolates programmatically without deploying them.

## What This Demo Does

- Runs a main Hono worker that serves a web interface
- Accepts custom JavaScript code from users
- Creates dynamic Worker isolates on-demand using the Worker Loader API
- Executes user code in sandboxed environments with no network access
- Persists prompt history using Durable Objects

## Why Dynamic Worker Loaders Are Useful

Dynamic Worker Loaders enable several interesting patterns:

- **Runtime code execution**: Run user-provided scripts without deployment
- **Per-tenant isolation**: Spin up separate compute environments for different customers
- **A/B testing**: Load different code versions dynamically
- **Sandbox environments**: Execute untrusted code safely with `globalOutbound: null`
- **Ephemeral compute**: Create workers, use them, and let them be garbage collected

## Architecture

```
Main Worker (Hono app)
├── Serves web interface
├── Accepts user code + prompt
├── Creates dynamic isolate keyed by code hash
└── Executes user code with prompt as ?q= parameter

Dynamic Isolate
├── Runs user's ESM code
├── No network access (globalOutbound: null)
├── Receives prompt via URL search params
└── Returns response to main worker

Durable Object
└── Stores recent prompts for easy reuse
```

## Local Development

```bash
# Install dependencies
bun install

# Start development server
bun dev

# Visit http://localhost:8787
```

## Key Implementation Details

**Worker Loader Configuration** (`wrangler.jsonc`):
```json
{
  "worker_loaders": [
    { "binding": "LOADER" }
  ]
}
```

**Dynamic Isolate Creation**:
```javascript
const worker = c.env.LOADER.get(isolateId, async () => ({
  compatibilityDate: "2025-06-01",
  mainModule: "main.js",
  modules: { "main.js": userModule },
  env: { WHO: "dynamic-sandbox" },
  globalOutbound: null  // No network access
}));
```

**Calling the Dynamic Worker**:
```javascript
const endpoint = worker.getEntrypoint();
const response = await endpoint.fetch(`http://sandbox/?q=${prompt}`);
```

## Production Considerations

- Dynamic Worker Loaders are currently in closed beta for production deployment
- Local development works immediately with Wrangler 4.x
- Apply for beta access via Cloudflare for production use
- Consider rate limiting and resource quotas for user-generated code

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono with JSX
- **Bundler**: Wrangler 4.x
- **Styling**: Tailwind CSS (CDN)
- **Validation**: Effect Schema
- **Storage**: Durable Objects
- **Package Manager**: Bun

## Example Use Cases

1. **Code playground**: Let users test Worker scripts without deployment
2. **User-defined transforms**: Allow customers to write data processing logic
3. **Multi-tenant applications**: Isolate per-customer business logic
4. **Dynamic routing**: Create request handlers on the fly
5. **Compute-as-a-Service**: Serverless functions with user-provided code

## Files Structure

```
src/
├── worker.tsx          # Main Hono application
├── do.tsx              # Durable Object for prompt storage
└── env.d.ts            # TypeScript environment definitions
wrangler.jsonc          # Wrangler configuration
```

## License

MIT