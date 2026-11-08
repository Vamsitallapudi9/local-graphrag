import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { EMBED_API_BASE, embedServerHealth, ensureEmbedServer } from './embedServer'
import { LLM_API_BASE, ensureLlmServer } from './llmServer'
import { resolveGraphRagEnv } from './graphragEnv'
import {
  CLOUD_PROVIDER_IDS,
  LOCAL_EMBEDDING,
  PROVIDER_ADAPTERS,
  normalizeBuildProvider,
  type BuildProvider,
  type CloudProviderId,
  type EmbeddingSource,
} from '../providers'

export type { BuildProvider } from '../providers'

const execFileAsync = promisify(execFile)
const configDir = () => path.join(process.cwd(), '.graphrag')
const configPath = () => path.join(configDir(), 'providers.json')

export const LOCAL_DEFAULTS = {
  completionModel: 'gemma4:latest',
  embeddingModel: 'embeddinggemma:latest',
  embeddingVectorSize: 768,
} as const

type StoredCloud = {
  apiKey?: string
  completionModel?: string
  embeddingSource?: EmbeddingSource
}

type StoredProviders = {
  lastBuild?: string
  local?: {
    completionModel?: string
    embeddingModel?: string
    embeddingVectorSize?: number
  }
  openai?: StoredCloud
  claude?: StoredCloud
  gemini?: StoredCloud
  // Written by older versions for the Claude Code preset; only the model is reused.
  anthropic?: { completionModel?: string }
}

export async function readProviderConfig(): Promise<StoredProviders> {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath(), 'utf8')) as StoredProviders
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

async function writeProviderConfig(config: StoredProviders) {
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 })
  await fs.writeFile(configPath(), JSON.stringify(config, null, 2), { mode: 0o600 })
  await fs.chmod(configPath(), 0o600)
}

export function localEmbedding() {
  const dimensions = Number.parseInt(process.env.EMBED_DIMENSIONS || '', 10)
  return {
    model: process.env.EMBED_MODEL?.trim() || LOCAL_EMBEDDING.model,
    dimensions: Number.isFinite(dimensions) && dimensions > 0 ? dimensions : LOCAL_EMBEDDING.dimensions,
  }
}

function storedCloud(stored: StoredProviders, id: CloudProviderId): StoredCloud {
  if (id === 'claude' && !stored.claude && stored.anthropic) return { completionModel: stored.anthropic.completionModel }
  return stored[id] ?? {}
}

// A key saved in the app wins over one from .env / the shell.
function resolveKey(stored: StoredProviders, id: CloudProviderId) {
  const saved = storedCloud(stored, id).apiKey?.trim()
  if (saved) return { key: saved, source: 'saved' as const }
  const fromEnv = process.env[PROVIDER_ADAPTERS[id].envKey]?.trim()
  if (fromEnv) return { key: fromEnv, source: 'env' as const }
  return { key: '', source: null }
}

function resolveCloudSettings(stored: StoredProviders, id: CloudProviderId) {
  const adapter = PROVIDER_ADAPTERS[id]
  const saved = storedCloud(stored, id)
  const embeddingSource: EmbeddingSource = saved.embeddingSource === 'provider' && adapter.embedding ? 'provider' : 'local'
  const embedding = embeddingSource === 'provider' && adapter.embedding ? adapter.embedding : localEmbedding()
  return {
    completionModel: saved.completionModel?.trim() || adapter.defaultCompletionModel,
    embeddingSource,
    embeddingModel: embedding.model,
    embeddingDimensions: embedding.dimensions,
  }
}

export async function saveCloudConfig(id: CloudProviderId, input: { apiKey?: string; completionModel?: string; embeddingSource?: EmbeddingSource }) {
  const current = await readProviderConfig()
  const adapter = PROVIDER_ADAPTERS[id]
  const previous = storedCloud(current, id)
  const apiKey = input.apiKey?.trim() || previous.apiKey
  const embeddingSource: EmbeddingSource = input.embeddingSource === 'provider' && adapter.embedding ? 'provider' : 'local'
  const next: StoredProviders = {
    ...current,
    [id]: {
      ...(apiKey ? { apiKey } : {}),
      completionModel: input.completionModel?.trim() || adapter.defaultCompletionModel,
      embeddingSource,
    },
  }
  if (id === 'claude') delete next.anthropic
  await writeProviderConfig(next)
}

export async function saveLocalConfig(input: { completionModel?: string; embeddingModel?: string; embeddingVectorSize?: number }) {
  const current = await readProviderConfig()
  await writeProviderConfig({
    ...current,
    local: {
      completionModel: input.completionModel?.trim() || LOCAL_DEFAULTS.completionModel,
      embeddingModel: input.embeddingModel?.trim() || LOCAL_DEFAULTS.embeddingModel,
      embeddingVectorSize: Number.isFinite(input.embeddingVectorSize) ? input.embeddingVectorSize : LOCAL_DEFAULTS.embeddingVectorSize,
    },
  })
}

export async function removeCloudKey(id: CloudProviderId) {
  const current = await readProviderConfig()
  const entry = current[id]
  if (entry) delete entry.apiKey
  await writeProviderConfig(current)
}

async function commandAvailable(command: string) {
  try {
    await execFileAsync(command, ['--version'], { timeout: 3000 })
    return true
  } catch {
    return false
  }
}

export async function getProviderStatus() {
  const stored = await readProviderConfig()
  let installed = false
  let version: string | null = null
  try {
    const result = await execFileAsync('ollama', ['--version'], { timeout: 3000 })
    installed = true
    version = result.stdout.trim() || result.stderr.trim() || null
  } catch {}

  let running = false
  let models: string[] = []
  try {
    const response = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(2500) })
    if (response.ok) {
      running = true
      const payload = await response.json() as { models?: Array<{ name?: string; model?: string }> }
      models = (payload.models ?? []).map(model => model.name || model.model || '').filter(Boolean)
    }
  } catch {}

  const localCompletionModel = stored.local?.completionModel || LOCAL_DEFAULTS.completionModel
  const localEmbeddingModel = stored.local?.embeddingModel || LOCAL_DEFAULTS.embeddingModel
  const hasModel = (name: string) => models.some(model => {
    if (name.includes(':')) return model === name
    return model === name || model === `${name}:latest`
  })

  const [embed, claudeCli] = await Promise.all([embedServerHealth(), commandAvailable('claude')])

  const cloud = Object.fromEntries(CLOUD_PROVIDER_IDS.map(id => {
    const { key, source } = resolveKey(stored, id)
    const settings = resolveCloudSettings(stored, id)
    // Without a key, Claude falls back to the Claude Code CLI login.
    const viaClaudeCode = id === 'claude' && !key
    return [id, {
      ready: Boolean(key) || (viaClaudeCode && claudeCli),
      keyStored: source === 'saved',
      keyFromEnv: source === 'env',
      viaClaudeCode,
      claudeCliInstalled: id === 'claude' ? claudeCli : undefined,
      ...settings,
    }]
  })) as Record<CloudProviderId, CloudStatus>

  return {
    local: {
      ready: installed && running && hasModel(localCompletionModel) && hasModel(localEmbeddingModel),
      installed,
      running,
      version,
      models,
      completionModel: localCompletionModel,
      embeddingModel: localEmbeddingModel,
      embeddingVectorSize: stored.local?.embeddingVectorSize || LOCAL_DEFAULTS.embeddingVectorSize,
      completionReady: hasModel(localCompletionModel),
      embeddingReady: hasModel(localEmbeddingModel),
    },
    ...cloud,
    localEmbedding: { ...localEmbedding(), running: embed.running },
  }
}

type CloudStatus = {
  ready: boolean
  keyStored: boolean
  keyFromEnv: boolean
  viaClaudeCode: boolean
  claudeCliInstalled?: boolean
  completionModel: string
  embeddingSource: EmbeddingSource
  embeddingModel: string
  embeddingDimensions: number
}

export async function resolveProviderEnv(provider: BuildProvider, source: NodeJS.ProcessEnv = process.env) {
  const stored = await readProviderConfig()
  const env = { ...source }
  if (provider === 'local') {
    env.GRAPHRAG_COMPLETION_PROVIDER = 'ollama'
    env.GRAPHRAG_COMPLETION_MODEL = stored.local?.completionModel || LOCAL_DEFAULTS.completionModel
    env.GRAPHRAG_COMPLETION_API_BASE = 'http://127.0.0.1:11434'
    env.GRAPHRAG_EMBEDDING_PROVIDER = 'ollama'
    env.GRAPHRAG_EMBEDDING_MODEL = stored.local?.embeddingModel || LOCAL_DEFAULTS.embeddingModel
    env.GRAPHRAG_EMBEDDING_API_BASE = 'http://127.0.0.1:11434'
    env.GRAPHRAG_API_KEY = 'ollama'
    env.GRAPHRAG_EMBEDDING_API_KEY = 'ollama'
    env.GRAPHRAG_CONCURRENT_REQUESTS = '1'
    env.GRAPHRAG_EMBEDDING_VECTOR_SIZE = String(stored.local?.embeddingVectorSize || LOCAL_DEFAULTS.embeddingVectorSize)
  } else {
    const adapter = PROVIDER_ADAPTERS[provider]
    const { key } = resolveKey(stored, provider)
    const settings = resolveCloudSettings(stored, provider)

    if (key) {
      // Direct API call through LiteLLM. An empty api_base becomes YAML null,
      // so LiteLLM uses the provider's official endpoint.
      env.GRAPHRAG_COMPLETION_PROVIDER = adapter.litellmProvider
      env.GRAPHRAG_COMPLETION_API_BASE = ''
      env.GRAPHRAG_API_KEY = key
    } else if (adapter.keyOptional) {
      // No Anthropic key: go through the local Claude Code CLI bridge,
      // which speaks the OpenAI protocol.
      env.GRAPHRAG_COMPLETION_PROVIDER = 'openai'
      env.GRAPHRAG_COMPLETION_API_BASE = LLM_API_BASE
      env.GRAPHRAG_API_KEY = 'local'
    } else {
      throw new Error(`${adapter.label} API key missing. Add it in Model settings or set ${adapter.envKey} in .env.`)
    }
    env.GRAPHRAG_COMPLETION_MODEL = settings.completionModel

    if (settings.embeddingSource === 'provider' && key) {
      env.GRAPHRAG_EMBEDDING_PROVIDER = adapter.litellmProvider
      env.GRAPHRAG_EMBEDDING_API_BASE = ''
      env.GRAPHRAG_EMBEDDING_API_KEY = key
    } else {
      // Local Hugging Face server speaking the OpenAI embeddings protocol.
      // Never send a provider key there.
      env.GRAPHRAG_EMBEDDING_PROVIDER = 'openai'
      env.GRAPHRAG_EMBEDDING_API_BASE = EMBED_API_BASE
      env.GRAPHRAG_EMBEDDING_API_KEY = 'local'
    }
    env.GRAPHRAG_EMBEDDING_MODEL = settings.embeddingModel
    env.GRAPHRAG_EMBEDDING_VECTOR_SIZE = String(settings.embeddingDimensions)
    env.GRAPHRAG_CONCURRENT_REQUESTS = source.GRAPHRAG_CONCURRENT_REQUESTS || '4'
  }
  // GraphRAG cache keys can collide across providers for the same input batch.
  // Keep provider/model results physically separate so one provider's response
  // can never be replayed into another provider's build.
  const cacheSignature = createHash('sha256').update([
    env.GRAPHRAG_COMPLETION_PROVIDER,
    env.GRAPHRAG_COMPLETION_API_BASE,
    env.GRAPHRAG_COMPLETION_MODEL,
    env.GRAPHRAG_EMBEDDING_PROVIDER,
    env.GRAPHRAG_EMBEDDING_MODEL,
    env.GRAPHRAG_EMBEDDING_VECTOR_SIZE,
  ].join('|')).digest('hex').slice(0, 12)
  env.GRAPHRAG_CACHE_DIR = `cache/${provider}-${cacheSignature}`
  return env
}

export async function rememberBuildProvider(provider: BuildProvider) {
  const current = await readProviderConfig()
  await writeProviderConfig({ ...current, lastBuild: provider })
}

// Queries must use the same bindings the index was built with, or the vector
// store rejects the query embeddings. Starts the local servers they need.
export async function resolveQueryEnv() {
  const provider = normalizeBuildProvider((await readProviderConfig()).lastBuild) ?? 'claude'
  const { env, embeddingModel } = resolveGraphRagEnv(await resolveProviderEnv(provider))
  if (env.GRAPHRAG_COMPLETION_API_BASE === LLM_API_BASE) await ensureLlmServer()
  if (env.GRAPHRAG_EMBEDDING_API_BASE === EMBED_API_BASE) await ensureEmbedServer(embeddingModel)
  return env
}
