export type DiscoveredTag = {
  tag: string
  declaration: { cssProperties?: { name: string; type?: string | { text?: string } }[] }
}

export function discoverPublishableContracts(repoRoot: string): { tags: DiscoveredTag[] }
