// Provider adapters: everything the app needs to know about each cloud model
// provider lives here. Safe to import from both the browser and the server.

export type CloudProviderId = 'openai' | 'claude' | 'gemini'
export type BuildProvider = 'local' | CloudProviderId
export type EmbeddingSource = 'local' | 'provider'

export type ProviderAdapter = {
  id: CloudProviderId
  label: string
  // Provider name GraphRAG passes to LiteLLM ("<provider>/<model>").
  litellmProvider: 'openai' | 'anthropic' | 'gemini'
  envKey: string
  keyUrl: string
  keyPlaceholder: string
  defaultCompletionModel: string
  // The provider's own embedding API, or null when it has none.
  embedding: { model: string; dimensions: number } | null
  // Claude can also run through the Claude Code CLI login instead of a key.
  keyOptional: boolean
}

// Free, private embeddings that run on this computer (fastembed, CPU).
// Override with EMBED_MODEL / EMBED_DIMENSIONS in .env.
export const LOCAL_EMBEDDING = {
  model: 'BAAI/bge-base-en-v1.5',
  dimensions: 768,
} as const

export const PROVIDER_ADAPTERS: Record<CloudProviderId, ProviderAdapter> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    litellmProvider: 'openai',
    envKey: 'OPENAI_API_KEY',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-…',
    defaultCompletionModel: 'gpt-5.4-mini',
    embedding: { model: 'text-embedding-3-small', dimensions: 1536 },
    keyOptional: false,
  },
  claude: {
    id: 'claude',
    label: 'Claude',
    litellmProvider: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyPlaceholder: 'sk-ant-…',
    defaultCompletionModel: 'claude-sonnet-5-5',
    embedding: null,
    keyOptional: true,
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    litellmProvider: 'gemini',
    envKey: 'GEMINI_API_KEY',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyPlaceholder: 'AIza…',
    defaultCompletionModel: 'gemini-flash-latest',
    embedding: { model: 'gemini-embedding-001', dimensions: 3072 },
    keyOptional: false,
  },
}

export const CLOUD_PROVIDER_IDS = Object.keys(PROVIDER_ADAPTERS) as CloudProviderId[]

export const BUILD_PROVIDER_LABELS: Record<BuildProvider, string> = {
  local: 'Ollama',
  openai: 'OpenAI',
  claude: 'Claude',
  gemini: 'Gemini',
}

// 'cloud' is what older versions stored for the Claude preset.
export function normalizeBuildProvider(value: unknown): BuildProvider | null {
  if (value === 'cloud') return 'claude'
  if (value === 'local' || value === 'openai' || value === 'claude' || value === 'gemini') return value
  return null
}
