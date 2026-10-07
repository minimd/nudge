import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { checkLocalModel } from '../ipc'
import { LocalModelStatus as Status } from '../shared-types'

interface Props {
  model: string
  // Re-check whenever this changes (endpoint/model edits).
  refreshKey?: string
}

export function LocalModelStatus({ model, refreshKey }: Props) {
  const [status, setStatus] = useState<Status | 'loading'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    const t = setTimeout(async () => {
      const s = await checkLocalModel()
      if (!cancelled) {
        setStatus(s)
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [refreshKey, model])

  if (status === 'loading') {
    return (
      <div className="flex items-center gap-1.5 text-[12px] opacity-70">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking Ollama...
      </div>
    )
  }
  if (status === 'ok') {
    return (
      <div className="flex items-center gap-1.5 text-[12px] text-green-700 dark:text-green-300">
        <CheckCircle2 className="w-3.5 h-3.5" /> Ready. Screenshots never leave this Mac.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1 text-[12px] text-red-700 dark:text-red-300">
      <div className="flex items-center gap-1.5">
        <XCircle className="w-3.5 h-3.5" />
        {status === 'ollama-down' ? 'Ollama is not running.' : 'Model not downloaded yet.'}
      </div>
      <code className="text-[11px] opacity-80 select-text">
        {status === 'ollama-down' ? 'brew install ollama && ollama serve' : `ollama pull ${model}`}
      </code>
    </div>
  )
}
