// Local goal feedback. Small models are flaky at this classification, so
// duration is parsed deterministically and the model is only consulted for
// "is it clear which apps this involves".

import { LocalResult, ollamaChatJSON } from './ollama'

export type LocalGoalFeedback = {
  feedbackType: 'lacking-duration' | 'unclear-apps' | null
  activityDurationMins: number | null
  reasoning: string
}

export function parseDurationMins(goal: string): number | null {
  const g = goal.toLowerCase()
  let total = 0
  let found = false

  const h = g.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/)
  if (h) {
    total += parseFloat(h[1]) * 60
    found = true
  } else if (/\b(an|one|1)\s+hour\b/.test(g)) {
    total += 60
    found = true
  } else if (/\bhalf (an )?hour\b/.test(g)) {
    total += 30
    found = true
  }

  const m = g.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/)
  if (m) {
    total += parseInt(m[1], 10)
    found = true
  }

  return found ? Math.round(total) : null
}

export async function getGoalFeedbackLocally(opts: {
  endpoint: string
  model: string
  goal: string
}): Promise<LocalResult<LocalGoalFeedback>> {
  const activityDurationMins = parseDurationMins(opts.goal)

  const res = await ollamaChatJSON<{ appsClear: boolean; reasoning: string }>({
    endpoint: opts.endpoint,
    model: opts.model,
    temperature: 0.1,
    timeoutMs: 60_000,
    schema: {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        appsClear: { type: 'boolean' },
      },
      required: ['reasoning', 'appsClear'],
    },
    messages: [
      {
        role: 'system',
        content: `A focus app will check screenshots of the user's screen against their stated activity.
Decide if the activity is concrete enough to recognise on screen (which kind of apps or sites it involves).
"code", "fix the cart bug", "write emails", "design in Figma", "study physics on YouTube" are clear.
"work", "be productive", "take a nap", "think" are not.
Be lenient. Reply with JSON: reasoning (one short sentence), appsClear (boolean).`,
      },
      { role: 'user', content: opts.goal },
    ],
  })

  if ('error' in res) {
    return res
  }

  let feedbackType: LocalGoalFeedback['feedbackType'] = null
  if (!res.data.appsClear) {
    feedbackType = 'unclear-apps'
  } else if (activityDurationMins === null) {
    feedbackType = 'lacking-duration'
  }

  return {
    data: {
      feedbackType,
      activityDurationMins,
      reasoning: String(res.data.reasoning ?? ''),
    },
  }
}
