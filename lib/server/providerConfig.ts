import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { EMBED_API_BASE, embedServerHealth, ensureEmbedServer } from './embedServer'
import { LLM_API_BASE, ensureLlmServer } from './llmServer'
import { resolveGraphRagEnv } from './graphragEnv'

const execFileAsync = promisify(execFile)
const configDir = () => path.join(process.cwd(), '.graphrag')
const configPath = () => path.join(configDir(), 'providers.json')

export const LOCAL_DEFAULTS = {
  completionModel: 'gemma4:latest',
  embeddingModel: 'embeddinggemma:latest',
  embeddingVectorSize: 768,
} as const

export const CLOUD_DEFAULTS = {
  // Claude does the extraction; Anthropic has no embedding API, so embeddings
  // run locally from Hugging Face (fastembed, CPU) — no Ollama needed.
  completionModel: 'claude-sonnet-5-5',
  embeddingModel: 'BAAI/bge-base-en-v1.5',
  embeddingVectorSize: 768,
} as const

type StoredProviders = {
  lastBuild?: BuildProvider
  anthropic?: {
    apiKey?: string
    completionModel?: string
    embeddingModel?: string
  }
  local?: {
    completionModel?: string
    embeddingModel?: string
    embeddingVectorSize?: number
  }
}

export type BuildProvider = 'local' | 'cloud'

export async function readProviderConfig(): Promise<StoredProviders> {
  try {
    const parsed = JSON.parse(await fs.readFile(configPath(), 'utf8')) as StoredProviders
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export async function saveCloudConfig(input: { apiKey: string; completionModel?: string; embeddingModel?: string }) {
  const current = await readProviderConfig()
  const apiKey = input.apiKey.trim()
  if (!apiKey) throw new Error('API key is required')
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 })
  await fs.writeFile(configPath(), JSON.stringify({
    ...current,
    anthropic: {
      apiKey,
      completionModel: input.completionModel?.trim() || CLOUD_DEFAULTS.completionModel,
      embeddingModel: input.embeddingModel?.trim() || CLOUD_DEFAULTS.embeddingModel,
    },
  }, null, 2), { mode: 0o600 })
  await fs.chmod(configPath(), 0o600)
}

export async function saveLocalConfig(input: { completionModel?: string; embeddingModel?: string; embeddingVectorSize?: number }) {
  const current = await readProviderConfig()
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 })
  await fs.writeFile(configPath(), JSON.stringify({
    ...current,
    local: {
      completionModel: input.completionModel?.trim() || LOCAL_DEFAULTS.completionModel,
      embeddingModel: input.embeddingModel?.trim() || LOCAL_DEFAULTS.embeddingModel,
      embeddingVectorSize: Number.isFinite(input.embeddingVectorSize) ? input.embeddingVectorSize : LOCAL_DEFAULTS.embeddingVectorSize,
    },
  }, null, 2), { mode: 0o600 })
  await fs.chmod(configPath(), 0o600)
}

export async function removeCloudKey() {
  const current = await readProviderConfig()
  delete current.anthropic
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 })
  await fs.writeFile(configPath(), JSON.stringify(current, null, 2), { mode: 0o600 })
  await fs.chmod(configPath(), 0o600)
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

  const embed = await embedServerHealth()
  const cloudEmbeddingModel = stored.anthropic?.embeddingModel || CLOUD_DEFAULTS.embeddingModel

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
    cloud: {
      // The local embedding server is started on demand by the build.
      // Claude runs through the local Claude Code CLI login; no key needed.
      ready: true,
      keyStored: true,
      completionModel: stored.anthropic?.completionModel || CLOUD_DEFAULTS.completionModel,
      embeddingModel: cloudEmbeddingModel,
      embeddingReady: embed.running,
    },
  }
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
    // Completions go through the local Claude CLI bridge (OpenAI protocol).
    env.GRAPHRAG_COMPLETION_PROVIDER = 'openai'
    env.GRAPHRAG_COMPLETION_MODEL = stored.anthropic?.completionModel || CLOUD_DEFAULTS.completionModel
    env.GRAPHRAG_COMPLETION_API_BASE = LLM_API_BASE
    env.GRAPHRAG_API_KEY = 'local'
    // Embeddings: local Hugging Face server speaking the OpenAI embeddings
    // protocol (Anthropic offers none). Never send the Claude key there.
    env.GRAPHRAG_EMBEDDING_PROVIDER = 'openai'
    env.GRAPHRAG_EMBEDDING_MODEL = stored.anthropic?.embeddingModel || CLOUD_DEFAULTS.embeddingModel
    env.GRAPHRAG_EMBEDDING_API_BASE = EMBED_API_BASE
    env.GRAPHRAG_EMBEDDING_API_KEY = 'local'
    env.GRAPHRAG_CONCURRENT_REQUESTS = '4'
    env.GRAPHRAG_EMBEDDING_VECTOR_SIZE = String(CLOUD_DEFAULTS.embeddingVectorSize)
  }
  // GraphRAG cache keys can collide across providers for the same input batch.
  // Keep provider/model results physically separate so a local response can
  // never be replayed into a cloud build (or the reverse).
  const cacheSignature = createHash('sha256').update([
    env.GRAPHRAG_COMPLETION_PROVIDER,
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
  await fs.mkdir(configDir(), { recursive: true, mode: 0o700 })
  await fs.writeFile(configPath(), JSON.stringify({ ...current, lastBuild: provider }, null, 2), { mode: 0o600 })
}

// Queries must use the same bindings the index was built with, or the vector
// store rejects the query embeddings. Starts the local servers they need.
export async function resolveQueryEnv() {
  const provider = (await readProviderConfig()).lastBuild ?? 'cloud'
  const { env, embeddingModel } = resolveGraphRagEnv(await resolveProviderEnv(provider))
  if (env.GRAPHRAG_COMPLETION_API_BASE === LLM_API_BASE) await ensureLlmServer()
  if (env.GRAPHRAG_EMBEDDING_API_BASE === EMBED_API_BASE) await ensureEmbedServer(embeddingModel)
  return env
}
