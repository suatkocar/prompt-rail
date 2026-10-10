import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { appendFile, mkdtemp, open, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { setTimeout as pause } from 'node:timers/promises'
import { loadHooks } from './hook-harness.mjs'

test('real large transcripts preserve prompts across appends, partial rows, rewrites and read failures', { timeout: 60_000 }, async t => {
  const loaded = await loadHooks(new URL('../plugins/prompt-rail/hooks/index.tsx', import.meta.url).pathname, ['unseen', 'readTranscript'])
  t.after(loaded.dispose)
  const directory = await mkdtemp(join(tmpdir(), 'prompt-rail-jsonl-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const path = join(directory, 'session with spaces.jsonl')
  const file = await open(path, 'w')
  const bulky = 'x'.repeat(64 * 1024)
  let parent = null
  for (let n = 0; n < 1024; n++) {
    const user = { uuid: `u${n}`, parentUuid: parent, type: 'user', message: { role: 'user', content: `Prompt ${n}: İstanbul 日本語 😀` } }
    const result = { uuid: `r${n}`, parentUuid: user.uuid, type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: bulky }, { type: 'image', source: { data: 'synthetic-image-data' } }] } }
    await file.write(`${JSON.stringify(user)}\n${JSON.stringify(result)}\n`)
    parent = result.uuid
  }
  await file.close()
  const calls = []
  const notices = []
  const children = new Set()
  let failSpawn = false
  let smallReads = 0
  const engine = {
    fs: {
      stat: path => stat(path),
      read: async path => { smallReads++; assert.ok((await stat(path)).size <= 4 * 1024 * 1024); return readFile(path, 'utf8') },
    },
    ui: { toast: text => notices.push(text) },
    process: { spawn({ argv }) {
      if (failSpawn) throw new Error('Synthetic reader failure')
      calls.push(argv)
      const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
      children.add(child)
      child.stdout.setEncoding('utf8')
      child.stderr.resume()
      const result = new Promise((resolve, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => { children.delete(child); resolve({ code, signal }) })
      })
      // A rewritten first row cancels iteration before the result is read.
      void result.catch(() => {})
      return { result, async *[Symbol.asyncIterator]() { for await (const text of child.stdout) yield { stream: 'stdout', text } } }
    } },
  }
  t.after(() => { for (const child of children) child.kill() })
  const seen = loaded.module.unseen()
  async function read() {
    let late
    const immediate = await loaded.module.readTranscript(engine, path, seen, value => { late = value })
    const deadline = Date.now() + 30_000
    while (seen.isReading) {
      assert.ok(Date.now() < deadline, 'Reader must settle within the fixture timeout')
      await pause(2)
    }
    return immediate ?? late
  }
  const start = performance.now()
  const initial = await read()
  const initialMs = performance.now() - start
  const size = (await stat(path)).size
  assert.ok(size > 64 * 1024 * 1024)
  assert.equal(initial.prompts.length, 1024)
  assert.equal(initial.prompts.at(-1).text, 'Prompt 1023: İstanbul 日本語 😀')
  assert.equal(smallReads, 0)
  assert.ok(JSON.stringify(seen.rows).length < 1024 * 1024, 'Do not retain image or tool-result payloads')
  const lastStart = seen.lastStart
  const next = { uuid: 'u1024', parentUuid: parent, type: 'user', message: { role: 'user', content: 'Appended: ğışçöü 日本語 😀' } }
  await appendFile(path, `${JSON.stringify(next)}\n`)
  const appendStart = performance.now()
  const appended = await read()
  const appendMs = performance.now() - appendStart
  assert.equal(appended.prompts.length, 1025)
  assert.equal(appended.prompts.at(-1).text, next.message.content)
  assert.equal(calls.at(-1)[2], `+${lastStart + 1}`)
  const callCount = calls.length
  assert.equal(await read(), undefined)
  assert.equal(calls.length, callCount, 'An unchanged transcript spawns no reader')

  const partial = JSON.stringify({ uuid: 'u1025', parentUuid: next.uuid, type: 'user', message: { role: 'user', content: 'Completed partial row' } })
  await appendFile(path, partial.slice(0, -12))
  assert.equal((await read()).prompts.length, 1025)
  await appendFile(path, `${partial.slice(-12)}\n`)
  assert.equal((await read()).prompts.length, 1026)

  const recovery = { uuid: 'u1026', parentUuid: 'u1025', type: 'user', message: { role: 'user', content: 'Recovered reader' } }
  await appendFile(path, `${JSON.stringify(recovery)}\n`)
  failSpawn = true
  assert.equal(await read(), undefined)
  assert.equal(await read(), undefined)
  assert.equal(notices.length, 1)
  failSpawn = false
  assert.equal((await read()).prompts.at(-1).text, 'Recovered reader')

  // A larger replacement must be detected by the remembered last-row UUID,
  // rather than relying only on truncation or the file size becoming smaller.
  const replacement = `${JSON.stringify({ uuid: 'replacement', parentUuid: null, type: 'user', message: { role: 'user', content: 'New branch' } })}\n`
  const out = await open(path, 'w')
  for (let n = 0; n < 1030; n++) await out.write(`${JSON.stringify({ uuid: `padding${n}`, type: 'progress', payload: bulky })}\n`)
  await out.write(replacement)
  await out.close()
  assert.deepEqual((await read()).prompts.map(prompt => prompt.text), ['New branch'])
  assert.equal(calls.at(-1)[2], '+1')

  await writeFile(path, replacement)
  assert.deepEqual((await read()).prompts.map(prompt => prompt.text), ['New branch'])
  assert.equal(smallReads, 1)
  for (let n = 0; children.size && n < 100; n++) await pause(5)
  assert.equal(children.size, 0, 'Every actual reader process must terminate')
  t.diagnostic(JSON.stringify({ transcriptBytes: size, prompts: 1024, initialMs: Math.round(initialMs), appendMs: Math.round(appendMs), retainedBytes: JSON.stringify(initial.prompts).length }))
})
