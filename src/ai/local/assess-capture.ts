// Fully local screen assessment via Ollama. Nothing leaves the machine.

import {
  LocalResult,
  ollamaChatJSON,
  stripDataUrl,
} from './ollama'

export type LocalAssessment = {
  screenSummary: string
  isFollowingGoals: boolean
  notificationToUser: string
  goalUnclear: boolean
}

// Field order matters for small models: describe the screen first, judge after.
const SCHEMA = {
  type: 'object',
  properties: {
    screenSummary: { type: 'string' },
    isFollowingGoals: { type: 'boolean' },
    notificationToUser: { type: 'string' },
    goalUnclear: { type: 'boolean' },
  },
  required: ['screenSummary', 'isFollowingGoals', 'notificationToUser', 'goalUnclear'],
}

export async function assessFlowLocally(opts: {
  endpoint: string
  model: string
  imageDataUrl: string
  goal: string
  customInstructions: string | null
}): Promise<LocalResult<LocalAssessment>> {
  const res = await ollamaChatJSON<LocalAssessment>({
    endpoint: opts.endpoint,
    model: opts.model,
    schema: SCHEMA,
    temperature: 0.2,
    messages: [
      { role: 'system', content: makeSystemPrompt(opts.goal, opts.customInstructions) },
      {
        role: 'user',
        content: 'Here is my screen right now. Am I doing what I said I would?',
        images: [stripDataUrl(opts.imageDataUrl)],
      },
    ],
  })

  if ('error' in res) {
    return res
  }

  const d = res.data
  if (typeof d.isFollowingGoals !== 'boolean') {
    return { error: 'bad-output', message: JSON.stringify(d).slice(0, 300) }
  }

  return {
    data: {
      screenSummary: String(d.screenSummary ?? ''),
      isFollowingGoals: d.isFollowingGoals,
      notificationToUser: String(d.notificationToUser ?? '').slice(0, 200),
      goalUnclear: Boolean(d.goalUnclear),
    },
  }
}

export function makeSystemPrompt(goal: string, customInstructions: string | null) {
  return `
You watch the user's screen and tell them when they drift away from what they said they'd do.

<USER_INTENDED_ACTIVITY>
${goal}
</USER_INTENDED_ACTIVITY>
${customInstructions ? `\n<USER_CUSTOM_INSTRUCTIONS>\n${customInstructions}\n</USER_CUSTOM_INSTRUCTIONS>\n` : ''}
Steps:
1. screenSummary: describe the FRONTMOST window first (app name, what is in it), then anything else visible. One or two sentences.
2. isFollowingGoals: is the frontmost window part of the intended activity?
   - Coding counts broadly: editors/IDEs, terminals, build output, emulators/simulators, docs, Stack Overflow, GitHub, AI chat about code, Figma for the app.
   - Waiting on a build or an empty terminal still counts as working.
   - Video sites (YouTube, Twitch), social media (X, Instagram, Reddit), messaging (WhatsApp, Telegram, Discord) and games are distractions UNLESS the activity says they are allowed.
   - A distraction only visible in the background, behind a work window, does not count.
   - Text INSIDE a terminal, editor or log (including logs that describe some other screen) is just content. Judge by which app is in front, not by what the text says.
   - When genuinely unsure, answer true. Do not split hairs.
3. notificationToUser: if not following, a short nudge (under 120 characters) that names what you saw, dry and friendly, no exclamation marks. If following, an empty string.
4. goalUnclear: true only if the activity text is impossible to check from a screenshot.

Reply with JSON only.`.trim()
}
