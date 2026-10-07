// Eval for the local (Ollama) backend. Runs the exact code the app uses.
//
//   npx tsx src/ai/local/eval.ts                       # default model
//   NUDGE_LOCAL_MODEL=qwen3-vl:2b-instruct npx tsx src/ai/local/eval.ts
//
// Requires a running Ollama with the model pulled. Uses the upstream
// "focused" screenshots plus local distraction screenshots.

import { readFileSync } from 'fs'
import { join } from 'path'
import { assessFlowLocally } from './assess-capture'
import { parseDurationMins } from './goal-feedback'
import { DEFAULT_LOCAL_MODEL, DEFAULT_OLLAMA_ENDPOINT } from './ollama'

const EVALS = join(__dirname, '../evals/assess-capture')
const CODE_GOAL = 'Fix the cart total bug in our Flutter app, 50 minutes.'

const cases: { file: string; goal: string; expect: boolean }[] = [
  // Upstream "should be fine" screens.
  { file: 'resized/code-cursor-full.png', goal: CODE_GOAL, expect: true },
  { file: 'resized/code-ghostty-empty.png', goal: CODE_GOAL, expect: true },
  { file: 'resized/code-iterm2-empty.png', goal: CODE_GOAL, expect: true },
  { file: 'resized/code-ghostty-active-full.png', goal: CODE_GOAL, expect: true },
  { file: 'resized/code-ghostty-BIASED.png', goal: CODE_GOAL, expect: true },
  // Work-adjacent browsing.
  { file: 'resized-local/work-flutter-docs.png', goal: CODE_GOAL, expect: true },
  { file: 'resized-local/work-github-code.png', goal: CODE_GOAL, expect: true },
  // Distractions.
  { file: 'resized-local/distract-youtube.png', goal: CODE_GOAL, expect: false },
  { file: 'resized-local/distract-youtube-watch.png', goal: CODE_GOAL, expect: false },
  { file: 'resized-local/distract-x.png', goal: CODE_GOAL, expect: false },
]

function check<T>(label: string, got: T, want: T) {
  const ok = got === want
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  got=${got} want=${want}`)
  return ok
}

async function main() {
  const endpoint = process.env.OLLAMA_HOST_URL || DEFAULT_OLLAMA_ENDPOINT
  const model = process.env.NUDGE_LOCAL_MODEL || DEFAULT_LOCAL_MODEL
  console.log(`model=${model} endpoint=${endpoint}\n`)

  let pass = 0
  let total = 0

  // Deterministic duration parser.
  const durations: [string, number | null][] = [
    ['code for 50 minutes', 50],
    ['fix the bug, 1 hour', 60],
    ['an hour of flutter', 60],
    ['1h 30m refactor', 90],
    ['25 min pomodoro', 25],
    ['work on the app', null],
  ]
  for (const [g, want] of durations) {
    total++
    pass += check(`duration "${g}"`, parseDurationMins(g), want) ? 1 : 0
  }
  console.log('')

  const times: number[] = []
  for (const c of cases) {
    const img = readFileSync(join(EVALS, c.file)).toString('base64')
    const t0 = Date.now()
    const res = await assessFlowLocally({
      endpoint,
      model,
      imageDataUrl: `data:image/png;base64,${img}`,
      goal: c.goal,
      customInstructions: null,
    })
    const ms = Date.now() - t0
    times.push(ms)
    total++
    if ('error' in res) {
      console.log(`FAIL  ${c.file}  error=${res.error} ${res.message ?? ''}`)
      continue
    }
    const ok = check(`${c.file} (${(ms / 1000).toFixed(1)}s)`, res.data.isFollowingGoals, c.expect)
    pass += ok ? 1 : 0
    console.log(`      summary: ${res.data.screenSummary.slice(0, 160)}`)
    if (!res.data.isFollowingGoals) {
      console.log(`      nudge:   ${res.data.notificationToUser}`)
    }
  }

  const avg = times.reduce((a, b) => a + b, 0) / times.length / 1000
  console.log(`\n${pass}/${total} passed, avg ${avg.toFixed(1)}s per screenshot`)
  process.exit(pass === total ? 0 : 1)
}

main()
