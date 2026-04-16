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
        address: '0x0af85f3169dfd494624b83467e97bfb956de0a16',
        url: 'https://aerodrome.finance',
        status: 'live',
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
        url: 'https://www.euler.finance',
        status: 'announced',
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
