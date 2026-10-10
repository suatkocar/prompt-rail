import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHooks } from './hook-harness.mjs'

const loaded = await loadHooks(new URL('../plugins/prompt-rail/hooks/agentsview.ts', import.meta.url).pathname)
after(loaded.dispose)
const { archiveIdentity, localSessionUrl, matchArchivedPrompt, archiveMessageUrl, resolveArchiveLink, openArchivedPrompt } = loaded.module
const sessionId = 'fixture-session'
const base = `http://127.0.0.1:45678/sessions/${sessionId}`
const at = '2026-10-04T13:54:24.728Z'
const prompt = { id: 'original-uuid', text: 'Please show the archived decision and explain the next action.', timestamp: at }
const message = overrides => ({ session_id: sessionId, ordinal: 946, role: 'user', source_uuid: prompt.id, timestamp: at, content: prompt.text, ...overrides })
const metadata = { id: sessionId, agent: 'claude', transcript_revision: '22', web_url: base }
const result = value => ({ exitCode: 0, stdout: JSON.stringify(value), stderr: '' })
function fixture({ session = metadata, pages = [[message()]], run } = {}) {
  const calls = [], notices = []
  let page = 0
  const engine = {
    process: { run: async (argv, options) => {
      calls.push([...argv])
      assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 5000)
      if (run) return run(argv, options)
      if (argv[0] === '/usr/bin/open') return { exitCode: 0, stdout: '', stderr: '' }
      return result(argv[2] === 'get' ? session : { transcript_revision: '22', messages: pages[page++] ?? [] })
    } },
    ui: { toast: text => notices.push(text) },
  }
  return { engine, calls, notices }
}

test('UUID matching is exact and authoritative, including repeated or changed text', () => {
  const selected = message({ content: 'Rendered text can differ from stored text.' })
  assert.equal(matchArchivedPrompt([message({ ordinal: 2, source_uuid: 'other' }), selected], prompt), selected)
  assert.equal(matchArchivedPrompt([message({ source_uuid: 'original' })], prompt), undefined)
})

test('legacy rows require the full text and exact timestamp together', () => {
  const selected = message({ source_uuid: null, content: prompt.text.replaceAll(' ', '\n  ') })
  assert.equal(matchArchivedPrompt([message({ ordinal: 2, source_uuid: null, timestamp: '2026-10-04T13:54:24.729Z' }), selected], prompt), selected)
  assert.equal(matchArchivedPrompt([message({ source_uuid: null, content: prompt.text.slice(0, 30) })], prompt), undefined)
  assert.equal(matchArchivedPrompt([selected], { ...prompt, timestamp: undefined }), undefined)
  assert.equal(matchArchivedPrompt([message({ source_uuid: 'another-id' })], prompt), undefined)
})

test('ambiguous UUIDs and ambiguous legacy messages are rejected', () => {
  assert.throws(() => matchArchivedPrompt([message(), message({ ordinal: 950 })], prompt), /more than one/)
  assert.throws(() => matchArchivedPrompt([message({ source_uuid: null }), message({ ordinal: 950, source_uuid: null })], prompt), /more than one/)
})

test('missing timestamps can use full text unique in both indexes but known conflicts cannot', () => {
  const selected = message({ source_uuid: null, timestamp: '2026-10-04T06:00:00.000Z' })
  const withoutTime = { ...prompt, timestamp: undefined }
  const identity = archiveIdentity(withoutTime, [withoutTime])
  assert.equal(identity.isTextUnique, true)
  assert.equal(matchArchivedPrompt([selected], identity), selected)
  assert.equal(matchArchivedPrompt([selected], archiveIdentity(prompt, [prompt])), undefined)
  assert.equal(matchArchivedPrompt([selected], archiveIdentity(prompt, [prompt, { ...prompt, id: 'repeated' }])), undefined)
  assert.equal(archiveIdentity({ id: 'short', text: 'Continue' }, [{ id: 'short', text: 'Continue' }]).isTextUnique, false)
  assert.throws(() => matchArchivedPrompt([selected, message({ ordinal: 947, source_uuid: 'different', timestamp: '2026-10-04T06:00:01.000Z' })], identity), /more than one/)
})

test('source timestamps survive indexing ordinary and queued prompts', async t => {
  const rail = await loadHooks(new URL('../plugins/prompt-rail/hooks/index.tsx', import.meta.url).pathname, ['indexRows'])
  t.after(rail.dispose)
  const rows = [
    { uuid: 'ordinary', parentUuid: null, type: 'user', timestamp: at, message: { role: 'user', content: 'Ordinary prompt' } },
    { uuid: 'queued', parentUuid: 'ordinary', type: 'attachment', timestamp: '2026-10-04T13:55:24.728Z', attachment: { type: 'queued_command', prompt: 'Queued prompt' } },
  ]
  assert.deepEqual(rail.module.indexRows(rows).prompts.map(row => row.timestamp), rows.map(row => row.timestamp))
})

test('system, assistant and sidechain messages never match a prompt', () => {
  for (const overrides of [{ is_system: true }, { is_sidechain: true }, { role: 'assistant' }]) {
    assert.equal(matchArchivedPrompt([message(overrides)], prompt), undefined)
  }
})

test('only the returned same-session loopback URL can be opened', () => {
  for (const host of ['127.0.0.1', 'localhost', '[::1]']) assert.equal(localSessionUrl(base.replace('127.0.0.1', host), sessionId).hostname, host)
  for (const value of [undefined, 'not a URL', base.replace('http:', 'https:'), base.replace('127.0.0.1', 'example.com'), base + '/other', base.replace(sessionId, 'another-session'), base.replace('127.0.0.1', 'user:pass@127.0.0.1')]) {
    assert.throws(() => localSessionUrl(value, sessionId), /AgentsView.*session link/)
  }
})

test('links preserve the returned origin and query but replace stale navigation fragments', () => {
  const url = new URL(archiveMessageUrl(new URL(base + '?theme=dark&msg=1#old-fragment'), message({ content: 'short' }), [message()]))
  assert.equal(url.origin, 'http://127.0.0.1:45678')
  assert.equal(url.searchParams.get('theme'), 'dark')
  assert.equal(url.searchParams.get('msg'), '946')
  assert.equal(url.hash, '')
})

test('only unique plain text gets the Chrome scroll correction', () => {
  assert.ok(new URL(archiveMessageUrl(new URL(base), message(), [message()])).hash.startsWith('#:~:text='))
  for (const messages of [[message(), message({ ordinal: 947 })], [message(), message({ ordinal: 947, content: prompt.text.toUpperCase() })]]) {
    assert.equal(new URL(archiveMessageUrl(new URL(base), messages[0], messages)).hash, '')
  }
  for (const content of ['short', '**This Markdown phrase is not a plain DOM text segment long enough**']) {
    const selected = message({ content })
    assert.equal(new URL(archiveMessageUrl(new URL(base), selected, [selected])).hash, '')
  }
})

test('resolves ordinal gaps using the actual last ordinal, never the message count', async () => {
  const first = Array.from({ length: 64 }, (_, i) => message({ ordinal: i * 10, source_uuid: `other-${i}`, content: `Other prompt ${i}` }))
  const f = fixture({ pages: [first, [message()]] })
  const link = await resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true)
  assert.equal(link.ordinal, 946)
  assert.deepEqual(f.calls[2], ['agentsview', 'session', 'messages', sessionId, '--role', 'user', '--from', '631', '--limit', '64', '--json'])
  assert.equal(f.calls.some(argv => argv[0] === '/usr/bin/open'), false)
})

for (const count of [64, 128]) {
  test(`resolves ${count} user messages when the empty terminal page omits its revision`, async () => {
    const rows = Array.from({ length: count }, (_, i) => message({ ordinal: i * 10, source_uuid: `other-${i}`, content: `Other prompt ${i}` }))
    rows[count - 1] = message({ ordinal: count * 10 })
    let page = 0
    const f = fixture({ run: async argv => {
      if (argv[2] === 'get') return result(metadata)
      const messages = rows.slice(page++ * 64, page * 64)
      return result(messages.length ? { transcript_revision: '22', messages } : { messages: [] })
    } })
    const link = await resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true)
    assert.equal(link.ordinal, count * 10)
    assert.equal(f.calls.filter(argv => argv[2] === 'get').length, 2)
  })
}

test('an unversioned empty page requires a fresh matching session revision before opening', async () => {
  const rows = Array.from({ length: 64 }, (_, i) => message({ ordinal: i * 10, source_uuid: `other-${i}` }))
  rows[63] = message({ ordinal: 946 })
  let gets = 0, page = 0
  const f = fixture({ run: async argv => {
    if (argv[2] === 'get') return result({ ...metadata, transcript_revision: ++gets === 1 ? '22' : '23' })
    return result(page++ === 0 ? { transcript_revision: '22', messages: rows } : { messages: [] })
  } })
  await assert.rejects(openArchivedPrompt(f.engine.process.run, sessionId, prompt, () => true), /changed while finding/)
  assert.equal(gets, 2)
  assert.equal(f.calls.some(argv => argv[0] === '/usr/bin/open'), false)
})

test('a nonempty unversioned page cannot bypass revision validation', async () => {
  const f = fixture({ run: async argv => result(argv[2] === 'get' ? metadata : { messages: [message()] }) })
  await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), /changed while finding/)
})

test('opens Chrome with an argument vector only after the exact message is resolved', async () => {
  const f = fixture()
  await openArchivedPrompt(f.engine.process.run, sessionId, prompt, () => true)
  assert.deepEqual(f.calls.at(-1).slice(0, 3), ['/usr/bin/open', '-a', 'Google Chrome'])
  assert.equal(new URL(f.calls.at(-1)[3]).searchParams.get('msg'), '946')
})

test('a canonical archive session ID can differ only with a matching source session ID', async () => {
  const f = fixture({ session: { ...metadata, id: 'canonical-id', source_session_id: sessionId, web_url: base.replace(sessionId, 'canonical-id') }, pages: [[message({ session_id: 'canonical-id' })]] })
  assert.ok((await resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true)).url.includes('/sessions/canonical-id?msg=946'))
})

for (const [label, session, pages, expected] of [
  ['wrong agent', { ...metadata, agent: 'codex' }, undefined, /different session/],
  ['wrong session', { ...metadata, id: 'unrelated' }, undefined, /different session/],
  ['wrong host', { ...metadata, web_url: base.replace('127.0.0.1', 'example.com') }, undefined, /local session link/],
  ['no exact match', metadata, [[]], /exact message was not found/],
  ['wrong message session', metadata, [[message({ session_id: 'unrelated' })]], /inconsistent message coordinates/],
  ['invalid ordinal', metadata, [[message({ ordinal: -1 })]], /inconsistent message coordinates/],
  ['unordered ordinals', metadata, [[message(), message({ ordinal: 2 })]], /inconsistent message coordinates/],
]) {
  test(`${label} never opens a browser`, async () => {
    const f = fixture({ session, pages })
    await assert.rejects(openArchivedPrompt(f.engine.process.run, sessionId, prompt, () => true), expected)
    assert.equal(f.calls.some(argv => argv[0] === '/usr/bin/open'), false)
  })
}

for (const [label, page, expected] of [
  ['changed archive revision', { transcript_revision: '23', messages: [message()] }, /changed while finding/],
  ['missing message list', { transcript_revision: '22' }, /unreadable message list/],
]) {
  test(label, async () => {
    const f = fixture({ run: async argv => result(argv[2] === 'get' ? metadata : page) })
    await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), expected)
  })
}

for (const [label, output, expected] of [
  ['nonzero CLI exit', { exitCode: 1, stdout: '', stderr: 'no session' }, /may not be indexed/],
  ['truncated output', { ...result(metadata), isStdoutTruncated: true }, /read limit/],
  ['invalid JSON', { exitCode: 0, stdout: '{', stderr: '' }, /unreadable response/],
]) {
  test(label, async () => {
    const f = fixture({ run: async () => output })
    await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), expected)
    assert.equal(f.calls.length, 1)
  })
}

test('missing PATH executable uses the installed macOS app CLI', async () => {
  const f = fixture({ run: async argv => {
    if (argv[0] === 'agentsview') throw new Error('spawn agentsview ENOENT')
    return result(argv[2] === 'get' ? metadata : { transcript_revision: '22', messages: [message()] })
  } })
  assert.equal((await resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true)).ordinal, 946)
  assert.equal(f.calls[1][0], '/Applications/AgentsView.app/Contents/MacOS/agentsview')
})

test('an unavailable CLI fails clearly without opening a browser', async () => {
  const f = fixture({ run: async () => { throw new Error('ENOENT') } })
  await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), /not available/)
  assert.equal(f.calls.length, 2)
})

test('an archive read superseded during the process call stops before opening Chrome', async () => {
  let current = true
  const f = fixture({ run: async () => { current = false; return result(metadata) } })
  await assert.rejects(openArchivedPrompt(f.engine.process.run, sessionId, prompt, () => current), /superseded/)
  assert.equal(f.calls.length, 1)
})

test('the overall deadline is checked after a process returns', async () => {
  const original = Date.now
  let now = 0
  Date.now = () => now
  try {
    const f = fixture({ run: async () => { now = 12_001; return result(metadata) } })
    await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), /lookup timed out/)
    assert.equal(f.calls.length, 1)
  } finally { Date.now = original }
})

test('large scans stop at the page bound instead of opening a partial match', async () => {
  let page = 0
  const f = fixture({ run: async argv => {
    if (argv[2] === 'get') return result(metadata)
    const messages = Array.from({ length: 64 }, (_, i) => message({ ordinal: page * 64 + i, source_uuid: `p${page}-${i}` }))
    page++
    return result({ transcript_revision: '22', messages })
  } })
  await assert.rejects(resolveArchiveLink(f.engine.process.run, sessionId, prompt, () => true), /page limit/)
  assert.equal(page, 32)
})

test('Chrome failures do not produce a successful-open notice', async () => {
  const f = fixture({ run: async argv => argv[0] === '/usr/bin/open'
    ? { exitCode: 1, stdout: '', stderr: 'Chrome not installed' }
    : result(argv[2] === 'get' ? metadata : { transcript_revision: '22', messages: [message()] }) })
  await assert.rejects(openArchivedPrompt(f.engine.process.run, sessionId, prompt, () => true), /Could not open Google Chrome/)
  assert.deepEqual(f.notices, [])
})
