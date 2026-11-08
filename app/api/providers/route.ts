import { NextResponse } from 'next/server'
import { getProviderStatus, removeCloudKey, saveCloudConfig, saveLocalConfig } from '@/lib/server/providerConfig'
import { normalizeBuildProvider, type EmbeddingSource } from '@/lib/providers'

export async function GET() {
  return NextResponse.json(await getProviderStatus())
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      provider?: string
      apiKey?: string
      completionModel?: string
      embeddingSource?: EmbeddingSource
      embeddingModel?: string
      embeddingVectorSize?: number
    }
    const provider = normalizeBuildProvider(body.provider)
    if (!provider) return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
    if (provider === 'local') {
      await saveLocalConfig({ completionModel: body.completionModel, embeddingModel: body.embeddingModel, embeddingVectorSize: body.embeddingVectorSize })
    } else {
      await saveCloudConfig(provider, { apiKey: body.apiKey, completionModel: body.completionModel, embeddingSource: body.embeddingSource })
    }
    return NextResponse.json(await getProviderStatus())
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to save provider' }, { status: 400 })
  }
}

export async function DELETE(request: Request) {
  const provider = normalizeBuildProvider(new URL(request.url).searchParams.get('provider'))
  if (!provider || provider === 'local') return NextResponse.json({ error: 'Unknown provider' }, { status: 400 })
  await removeCloudKey(provider)
  return NextResponse.json(await getProviderStatus())
}
