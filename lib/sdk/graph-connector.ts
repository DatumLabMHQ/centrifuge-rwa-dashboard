/**
 * Inlined from @datumlabs/data-connectors/connectors/graph
 *
 * Multi-chain subgraph client with Apollo, lazy-loaded per chain.
 * Inlined here so the project doesn't depend on a sibling SDK package
 * that isn't accessible from Vercel's build environment.
 */
import { ApolloClient, InMemoryCache, createHttpLink, type DocumentNode } from '@apollo/client';

export interface ChainConfig {
  name: string;
  shortName: string;
  subgraphUrl: string;
}

export interface GraphConfig {
  apiKey?: string;
  chains: Record<string, ChainConfig>;
}

export class GraphConnector {
  private apiKey: string;
  private chains: Record<string, ChainConfig>;
  private clientCache = new Map<string, ApolloClient>();

  constructor(config: GraphConfig) {
    this.apiKey = config.apiKey || process.env.NEXT_PUBLIC_THEGRAPH_API_KEY || '';
    this.chains = config.chains;
  }

  getClient(chainId: string): ApolloClient {
    if (!this.clientCache.has(chainId)) {
      const chain = this.chains[chainId];
      if (!chain || !chain.subgraphUrl) {
        throw new Error(`No subgraph URL configured for chain: ${chainId}`);
      }
      const link = createHttpLink({
        uri: chain.subgraphUrl,
        headers: this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      });
      const client = new ApolloClient({
        link,
        cache: new InMemoryCache(),
        defaultOptions: {
          query: { fetchPolicy: 'network-only' },
        },
      });
      this.clientCache.set(chainId, client);
    }
    return this.clientCache.get(chainId)!;
  }

  async query<T>(
    chainId: string,
    document: DocumentNode,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const client = this.getClient(chainId);
    const result = await client.query<T>({ query: document, variables });
    return result.data as T;
  }

  get chainIds(): string[] {
    return Object.keys(this.chains);
  }

  getChain(chainId: string): ChainConfig | undefined {
    return this.chains[chainId];
  }
}
