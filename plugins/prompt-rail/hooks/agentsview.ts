export type ArchivePrompt = { id: string; text: string; timestamp?: string; isTextUnique?: boolean }
export type ArchiveRun = (argv: string[], options: { timeoutMs: number }) => Promise<{ exitCode: number; stdout: string; stderr: string; isStdoutTruncated?: boolean }>
type Message = { ordinal: number; role: string; session_id: string; source_uuid?: string | null; timestamp?: string; content: string; is_system?: boolean; is_sidechain?: boolean }
type Page = { messages: Message[]; transcript_revision?: string }

const PAGE_SIZE = 64
const MAX_PAGES = 32
const MAX_BYTES = 16 * 1024 * 1024
const LOOKUP_MS = 12_000
const APP_CLI = '/Applications/AgentsView.app/Contents/MacOS/agentsview'
const normalize = (text: string) => text.replace(/\s+/g, ' ').trim()

export function archiveIdentity(prompt: ArchivePrompt, prompts: ArchivePrompt[]): ArchivePrompt {
  const text = normalize(prompt.text)
  return { ...prompt, isTextUnique: text.length >= 32 && prompts.filter(item => normalize(item.text) === text).length === 1 }
}

/** Only open the local session URL the CLI actually returned. */
export function localSessionUrl(value: unknown, sessionId: string): URL {
  if (typeof value !== 'string') throw new Error('AgentsView did not return a session link.')
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && !url.username && !url.password && decodeURIComponent(url.pathname) === `/sessions/${sessionId}`) return url
  } catch { /* Invalid URL or percent encoding. */ }
  throw new Error('AgentsView did not return a valid local session link.')
}

const isPerson = (message: Message) => message.role === 'user' && !message.is_system && !message.is_sidechain

/** Prefer UUID, then time plus text, then text unique in both legacy indexes. */
export function matchArchivedPrompt(messages: Message[], prompt: ArchivePrompt): Message | undefined {
  const people = messages.filter(isPerson)
  const byId = people.filter(message => message.source_uuid === prompt.id)
  if (byId.length === 1) return byId[0]
  if (byId.length > 1) throw new Error('AgentsView has more than one match for this message.')
  const at = Date.parse(prompt.timestamp ?? '')
  const legacy = people.filter(message => !message.source_uuid && normalize(message.content) === normalize(prompt.text))
  const matching = Number.isFinite(at) ? legacy.filter(message => Date.parse(message.timestamp ?? '') === at) : []
  if (matching.length > 1) throw new Error('AgentsView has more than one match for this message.')
  if (matching.length === 1) return matching[0]
  // Older AgentsView rows can lack source UUIDs, and rendered rail entries can
  // lack timestamps. A long full-text match is allowed only when both session
  // indexes agree it is unique and no known timestamps conflict.
  if (prompt.isTextUnique && normalize(prompt.text).length >= 32) {
    if (people.filter(message => normalize(message.content) === normalize(prompt.text)).length > 1) throw new Error('AgentsView has more than one match for this message.')
    const selected = legacy[0]
    if (selected && (!Number.isFinite(at) || !Number.isFinite(Date.parse(selected.timestamp ?? '')))) return selected
  }
  return undefined
}

// Chrome's text fragment corrects a measured variable-height scroll drift in
// AgentsView. Only use plain text unique across the complete user-message scan.
export function archiveMessageUrl(base: URL, selected: Message, messages: Message[]): string {
  const url = new URL(base.href)
  url.searchParams.set('msg', String(selected.ordinal))
  url.hash = ''
  const text = normalize(selected.content)
  const fragment = [...text].slice(0, 180).join('').replace(/\s+\S*$/, '').trim()
  if (fragment.length >= 32 && !/[`*<>\[\]{}]/.test(fragment) && messages.filter(message => normalize(message.content).toLowerCase().includes(fragment.toLowerCase())).length === 1) {
    url.hash = ':~:text=' + encodeURIComponent(fragment).replace(/-/g, '%2D')
  }
  return url.href
}

/** Read-only local CLI lookup; no archive mutation, model call or fixed port. */
export async function resolveArchiveLink(runCommand: ArchiveRun, sessionId: string, prompt: ArchivePrompt, isCurrent: () => boolean) {
  const deadline = Date.now() + LOOKUP_MS
  let bytes = 0
  let executable = 'agentsview'
  const check = () => {
    if (!isCurrent()) throw new Error('Archive navigation was superseded.')
    if (Date.now() >= deadline) throw new Error('AgentsView lookup timed out. Try the message again.')
  }
  const read = async (args: string[]): Promise<any> => {
    check()
    const run = () => runCommand([executable, 'session', ...args, '--json'], { timeoutMs: Math.max(1, Math.min(5000, deadline - Date.now())) })
    let result
    try {
      result = await run()
    } catch (error) {
      if (executable !== 'agentsview' || !/ENOENT|not found/i.test(String(error))) throw new Error('AgentsView is unavailable or its lookup timed out.')
      executable = APP_CLI
      try { result = await run() } catch { throw new Error('AgentsView is not available. Install it or disable the archive fallback in /config.') }
    }
    check()
    if (result.exitCode !== 0) throw new Error('AgentsView could not read this session. It may not be indexed yet.')
    bytes += new TextEncoder().encode(result.stdout).length
    if (result.isStdoutTruncated || bytes > MAX_BYTES) throw new Error('AgentsView lookup exceeded its read limit; no message was opened.')
    try { return JSON.parse(result.stdout) } catch { throw new Error('AgentsView returned an unreadable response.') }
  }

  const session = await read(['get', sessionId])
  if (session?.agent !== 'claude' || typeof session.id !== 'string' || (session.id !== sessionId && session.source_session_id !== sessionId)) throw new Error('AgentsView returned a different session; no message was opened.')
  const base = localSessionUrl(session.web_url, session.id)
  const messages: Message[] = []
  let from = 0
  let complete = false
  for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
    const page: Page = await read(['messages', session.id, '--role', 'user', '--from', String(from), '--limit', String(PAGE_SIZE)])
    if (!Array.isArray(page?.messages)) throw new Error('AgentsView returned an unreadable message list.')
    if (session.transcript_revision !== undefined && page.transcript_revision !== session.transcript_revision) {
      // Older CLI versions omit the revision on an empty terminal page. This
      // occurs at exact page-size multiples; confirm the session stayed stable
      // rather than accepting an unversioned or genuinely changed message page.
      const stale = () => new Error('AgentsView changed while finding this message. Click again to retry.')
      if (page.messages.length !== 0 || page.transcript_revision !== undefined) throw stale()
      const current = await read(['get', session.id])
      if (current?.id !== session.id || current.agent !== session.agent || current.transcript_revision !== session.transcript_revision) throw stale()
    }
    let last = from - 1
    for (const message of page.messages) {
      if (!Number.isSafeInteger(message?.ordinal) || message.ordinal <= last || message.session_id !== session.id || typeof message.content !== 'string') throw new Error('AgentsView returned inconsistent message coordinates.')
      last = message.ordinal
      messages.push(message)
    }
    if (page.messages.length < PAGE_SIZE) { complete = true; break }
    from = last + 1
  }
  if (!complete) throw new Error('AgentsView lookup reached its page limit; no message was opened.')
  const selected = matchArchivedPrompt(messages, prompt)
  if (!selected) throw new Error('This exact message was not found in AgentsView yet; no other message was opened.')
  check()
  return { url: archiveMessageUrl(base, selected, messages), ordinal: selected.ordinal }
}

export async function openArchivedPrompt(runCommand: ArchiveRun, sessionId: string, prompt: ArchivePrompt, isCurrent: () => boolean) {
  const link = await resolveArchiveLink(runCommand, sessionId, prompt, isCurrent)
  if (!isCurrent()) return
  let opened
  try { opened = await runCommand(['/usr/bin/open', '-a', 'Google Chrome', link.url], { timeoutMs: 5000 }) }
  catch { throw new Error('Could not open Google Chrome for this archived message.') }
  if (opened.exitCode !== 0) throw new Error('Could not open Google Chrome for this archived message.')
}
