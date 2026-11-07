import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  accountId: "c9bf3d8e875ffe933a9bf895695e0fd1", // Datum Labs
  worker: defineWorker({
    name: "centrifuge-rwa-dashboard",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-05",
    compatibilityFlags: ["nodejs_compat"],
    // api.centrifuge.io fails for US-east callers (520/524) but answers European ones,
    // so run the Worker in London like the old Vercel deployment (lhr1).
    placement: { region: "aws:eu-west-2" },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      // Plain settings all have code defaults (CENTRIFUGE_GRAPHQL_URL, IPFS_GATEWAY,
      // DEFILLAMA_PROTOCOL_URL, CACHE_TTL_*). Secrets (UPSTASH_REDIS_REST_*, BEEHIIV_*,
      // GRAPH_PROXY_KEY, NEXT_PUBLIC_THEGRAPH_API_KEY, *_RPC_URL) are Worker secrets.
    },
  }),
});
