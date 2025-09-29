declare module "cloudflare:workers" {
  namespace Cloudflare {
    interface Env {
      PROMPTS: DurableObjectNamespace;
      LOADER: WorkerEntrypoint;
    }
  }
}