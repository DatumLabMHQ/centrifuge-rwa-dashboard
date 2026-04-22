/**
 * Off-chain context for deRWA wrappers — DEX pools, oracle addresses, and
 * known DeFi integrations. Sourced from the research phase (Centrifuge docs,
 * Aerodrome, GeckoTerminal, Chronicle Proof of Asset).
 *
 * Update this file when new integrations go live (e.g. Morpho/Euler markets,
 * Stellar/Solana wrapped supply).
 */

export interface DerwaIntegration {
  protocol: string;
  kind: 'dex' | 'oracle' | 'lending' | 'wallet' | 'cex';
  address?: string;
  chain?: string;
  url?: string;
  status: 'live' | 'announced' | 'planned';
  /** DefiLlama yield pool ID — used to pull TVL, APY, volume for DEX pools. */
  defiLlamaPoolId?: string;
  /** Gauge address for Aerodrome rewards staking. */
  gaugeAddress?: string;
}

export interface DerwaContext {
  /** Symbol of the deRWA wrapper, e.g. "deSPXA". */
  symbol: string;
  /** Symbol of the underlying institutional pool token, e.g. "SPXA". Used to
   *  compute the wrap ratio (wrapper TVL / institutional TVL). */
  instSymbol: string;
  /** What it wraps. */
  underlying: string;
  /** Plain-language description of the underlying. */
  description: string;
  /** Asset manager. */
  manager: string;
  /** Integrations on each protocol/venue. */
  integrations: DerwaIntegration[];
}

const DERWA_CONTEXT: DerwaContext[] = [
  {
    symbol: 'deSPXA',
    instSymbol: 'SPXA',
    underlying: 'SPXA — Janus Henderson Anemoy S&P 500 Index Fund',
    description:
      'First tokenized S&P 500 index fund, licensed from S&P Dow Jones Indices and managed by Janus Henderson via Anemoy.',
    manager: 'Janus Henderson / Anemoy / S&P DJI license',
    integrations: [
      {
        protocol: 'Aerodrome',
        kind: 'dex',
        chain: 'Base',
        /** The actual trading pool (NOT the gauge 0x0fb1...) */
        address: '0xf840346fafedc1c0466216f3a899a599e6d03e75',
        /** The gauge contract (for AERO rewards staking) */
        gaugeAddress: '0x0fb1DAFCC2bD0bc30477bA7B96B2e8045ADd8a03',
        url: 'https://aerodrome.finance',
        status: 'live',
        /** DefiLlama yield pool ID for APY breakdown. */
        defiLlamaPoolId: 'f331d86f-6aae-4576-8f4d-d24f9bc2f883',
      },
      {
        protocol: 'Chronicle Proof of Asset',
        kind: 'oracle',
        chain: 'Base',
        address: '0x67e58B26a1847fd474C5F2CCF5E662A0105cE3Dd',
        url: 'https://chroniclelabs.org/dashboard/proofofasset/centrifuge-despxa',
        status: 'live',
      },
      {
        protocol: 'Chronicle Proof of Asset',
        kind: 'oracle',
        chain: 'Ethereum',
        address: '0xDCf4296E83ca7b05b3CFeE730a07BCc6570e85e7',
        url: 'https://chroniclelabs.org/dashboard/proofofasset/centrifuge-despxa',
        status: 'live',
      },
      {
        protocol: 'Morpho',
        kind: 'lending',
        chain: 'Base',
        address: '0x4440abd9eff38ebf76b8f64c074682acef8c89e77555075478a7582883206604',
        url: 'https://app.morpho.org/base/market/0x4440abd9eff38ebf76b8f64c074682acef8c89e77555075478a7582883206604/despxa-usdc',
        status: 'live',
      },
      {
        protocol: 'Euler',
        kind: 'lending',
        chain: 'Base',
        /** Euler deSPXA market in the Clearstar-curated RWA vault. */
        address: '0x0a6Af3A75BB350Fb1a402B70138B9820Cf0CA0Cb',
        url: 'https://app.euler.finance/borrow/0x0a6Af3A75BB350Fb1a402B70138B9820Cf0CA0Cb/0xEaA709fDb7CCcfbBF5185feBf183F0138cDe5983?network=8453',
        status: 'live',
      },
      {
        protocol: 'Chronicle Price Proxy',
        kind: 'oracle',
        chain: 'Base',
        /** 24/7 deSPXA/USD price feed used by Euler. */
        address: '0x9Fb1db0252D9153F426FC585135B7696F8a37d96',
        url: 'https://app.euler.finance/explore/clearstar-rwa',
        status: 'live',
      },
    ],
  },
  {
    symbol: 'deJTRSY',
    instSymbol: 'JTRSY',
    underlying: 'JTRSY — Janus Henderson Anemoy Short-Term US Treasury Fund',
    description:
      'Short-duration US Treasury exposure tokenized as a freely-transferable wrapper around the institutional JTRSY share class.',
    manager: 'Janus Henderson / Anemoy',
    integrations: [
      {
        protocol: 'Aerodrome',
        kind: 'dex',
        chain: 'Base',
        url: 'https://aerodrome.finance',
        status: 'live',
      },
      {
        protocol: 'Stellar Bridge',
        kind: 'wallet',
        chain: 'Stellar',
        url: 'https://stellar.org/press/centrifuge-brings-derwa-to-stellar-launching-with-usd20m-into-dejtrsy-and-dejaaa',
        status: 'live',
      },
    ],
  },
  {
    symbol: 'deJAAA',
    instSymbol: 'JAAA',
    underlying: 'JAAA — Janus Henderson Anemoy AAA CLO Fund',
    description:
      'Tokenized exposure to a portfolio of AAA-rated Collateralized Loan Obligations managed by Janus Henderson.',
    manager: 'Janus Henderson / Anemoy',
    integrations: [
      {
        protocol: 'Aerodrome',
        kind: 'dex',
        chain: 'Base',
        url: 'https://aerodrome.finance',
        status: 'live',
      },
      {
        protocol: 'Stellar Bridge',
        kind: 'wallet',
        chain: 'Stellar',
        status: 'live',
      },
    ],
  },
  {
    symbol: 'deCRDX',
    instSymbol: 'ACRDX',
    underlying: 'ACRDX — Anemoy Tokenized Apollo Diversified Credit Fund',
    description:
      'Tokenized exposure to Apollo Global Management\'s Diversified Credit strategy via the Anemoy wrapper.',
    manager: 'Apollo / Anemoy',
    integrations: [
      {
        protocol: 'Aerodrome',
        kind: 'dex',
        chain: 'Base',
        url: 'https://aerodrome.finance',
        status: 'announced',
      },
    ],
  },
];

export function getDerwaContext(symbol: string): DerwaContext | undefined {
  return DERWA_CONTEXT.find((c) => c.symbol === symbol);
}

export const DERWA_SYMBOLS = DERWA_CONTEXT.map((c) => c.symbol);
