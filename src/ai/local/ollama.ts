// Minimal Ollama client. Dependency-free on purpose (plain fetch) so the local
// AI path can be tested with bare `node` and never pulls in a cloud SDK.

export const DEFAULT_OLLAMA_ENDPOINT = 'http://127.0.0.1:11434'
export const DEFAULT_LOCAL_MODEL = 'qwen3-vl:8b-instruct'

export type LocalError = 'ollama-down' | 'model-missing' | 'bad-output' | 'unknown'

export type LocalResult<D> =
  | { data: D }
  | { error: LocalError; message?: string }

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

export async function ollamaChatJSON<T>(opts: {
  endpoint: string
  model: string
  messages: ChatMessage[]
  schema: Record<string, unknown>
  temperature?: number
  timeoutMs?: number
}): Promise<LocalResult<T>> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 180_000)

  let res: Response
  try {
    res = await fetch(`${trimSlash(opts.endpoint)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        format: opts.schema,
        stream: false,
        think: false,
        // Keep the model warm between captures (one per minute) so we don't
        // pay the load cost every time, but free the RAM after a session.
        keep_alive: '10m',
        // A ~1200px screenshot is ~1k vision tokens; 4k context is plenty and
        // keeps memory low on 16GB machines.
        options: { temperature: opts.temperature ?? 0.2, num_ctx: 4096 },
      }),
    })
  } catch (e) {
    clearTimeout(timer)
    return { error: 'ollama-down', message: errMessage(e) }
  }
  clearTimeout(timer)

  if (res.status === 404) {
    return { error: 'model-missing', message: `ollama pull ${opts.model}` }
  }
  if (!res.ok) {
    return { error: 'unknown', message: `Ollama HTTP ${res.status}: ${await res.text()}` }
  }

  const body = (await res.json()) as { message?: { content?: string } }
  const content = body.message?.content ?? ''
  try {
    return { data: JSON.parse(stripFences(content)) as T }
  } catch {
    return { error: 'bad-output', message: content.slice(0, 300) }
  }
}

export async function listLocalModels(endpoint: string): Promise<string[] | null> {
  try {
    const res = await fetch(`${trimSlash(endpoint)}/api/tags`)
    if (!res.ok) {
      return null
    }
    const body = (await res.json()) as { models?: { name: string }[] }
    return (body.models ?? []).map((m) => m.name)
  } catch {
    return null
  }
}

export async function checkLocalModel(
  endpoint: string,
  model: string
): Promise<'ok' | 'ollama-down' | 'model-missing'> {
  const models = await listLocalModels(endpoint)
  if (models === null) {
    return 'ollama-down'
  }
  const wanted = model.includes(':') ? model : `${model}:latest`
  return models.includes(wanted) ? 'ok' : 'model-missing'
}

export function stripDataUrl(dataUrl: string): string {
  const i = dataUrl.indexOf('base64,')
  return i >= 0 ? dataUrl.slice(i + 'base64,'.length) : dataUrl
}

function stripFences(s: string): string {
  return s
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/, '')
    .trim()
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '')
}

function errMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
