This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Cloudflare Workers

The app runs on Cloudflare Workers via [vinext](https://github.com/cloudflare/vinext).
`cloudflare.config.ts` is the Worker config (Datum Labs account, London placement).

1. `npx cf auth login` (in CI, set `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`)
2. Set secrets with `npx cf workers secrets update <NAME> --worker centrifuge-rwa-dashboard`:
   `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `BEEHIIV_API_KEY`, `BEEHIIV_PUBLICATION_ID`,
   `GRAPH_PROXY_KEY`, and optionally `BASE_RPC_URL` / `ETHEREUM_RPC_URL` / other `<CHAIN>_RPC_URL`.
3. `npm run deploy`

`npm run dev` runs Vite on port 3000, `npm start` previews the built Worker locally in workerd.
`npm run dev:next` / `npm run build:next` still run plain Next.js.

Live: https://centrifuge-rwa-dashboard.datumlabs.workers.dev
