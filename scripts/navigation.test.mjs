import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHooks, harness, bandInput, rowInput, whole, heavy } from './hook-harness.mjs'

const source = new URL('../plugins/prompt-rail/hooks/index.tsx', import.meta.url).pathname

for (const route of ['command', 'click']) {
  test(`${route}: a new turn after a jump retains unchanged whole viewport rows`, async t => {
    const loaded = await loadHooks(source)
    t.after(loaded.dispose)
    const host = harness()
    host.register('prompt-rail', loaded.module)
    for (let n = 1; n <= 4; n++) await host.dispatch('ui.render', rowInput(`p${n}`, n === 1 ? null : whole))
    if (route === 'command') await host.dispatch('command.run', { command: 'prompt-rail', args: 'last' })
    else await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-3' })
    assert.deepEqual(host.scrolls, [{ to: { requestId: 'p4' }, block: 'start' }])
    await host.advance(200)
    assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 3)
    await host.dispatch('turn.start', { text: 'fifth', turnId: 'turn-5' })
    assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 1)
  })
}

test('a departed jump target leaves a retained whole row at the top', async t => {
  const loaded = await loadHooks(source)
  t.after(loaded.dispose)
  const host = harness()
  host.register('prompt-rail', loaded.module)
  for (let n = 1; n <= 4; n++) await host.dispatch('ui.render', rowInput(`p${n}`, n < 3 ? null : whole))
  await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-2' })
  await host.advance(200)
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 2)
  await host.dispatch('turn.start', { text: 'fifth', turnId: 'turn-5' })
  await host.dispatch('ui.render', rowInput('p3', null))
  await host.dispatch('ui.render', rowInput('p5', whole))
  await host.advance(200)
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 3)
})

test('a far jump still retires rows confirmed above the viewport', async t => {
  const loaded = await loadHooks(source)
  t.after(loaded.dispose)
  const host = harness()
  host.register('prompt-rail', loaded.module)
  for (let n = 1; n <= 8; n++) await host.dispatch('ui.render', rowInput(`p${n}`, n <= 2 ? whole : null))
  await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-6' })
  await host.dispatch('ui.render', rowInput('p7', { first: 1, last: 2, of: 3 }))
  await host.advance(200)
  await host.dispatch('ui.render', rowInput('p7', whole))
  await host.dispatch('turn.start', { text: 'ninth', turnId: 'turn-9' })
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 6)
  await host.dispatch('ui.render', rowInput('p7', null))
  await host.dispatch('ui.render', rowInput('p3', whole))
  await host.advance(200)
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 2)
})

test('a refused jump leaves the actual viewport marker unchanged', async t => {
  const loaded = await loadHooks(source)
  t.after(loaded.dispose)
  const host = harness()
  const engine = host.register('prompt-rail', loaded.module)
  engine.ui.scroll = async () => ({ deny: 'the window moved meanwhile' })
  for (let n = 1; n <= 3; n++) await host.dispatch('ui.render', rowInput(`p${n}`, n === 2 ? whole : null))
  await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-2' })
  await host.advance(200)
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 1)
})

for (const route of ['click', 'command']) {
  test(`${route}: a missing terminal row opens the exact archived prompt without moving the reading marker`, async t => {
    const loaded = await loadHooks(source)
    t.after(loaded.dispose)
    const host = harness()
    const engine = host.register('prompt-rail', loaded.module)
    engine.ui.scroll = async args => {
      host.scrolls.push(args)
      return { deny: 'nothing drawn under that requestId' }
    }
    engine.process.run = async argv => {
      host.processes.push([...argv])
      const value = argv[2] === 'get'
        ? { id: 'fixture-session', agent: 'claude', transcript_revision: '1', web_url: 'http://127.0.0.1:45678/sessions/fixture-session' }
        : { transcript_revision: '1', messages: [{ session_id: 'fixture-session', ordinal: 42, role: 'user', source_uuid: 'p1', content: 'prompt p1' }], last_ordinal: 42 }
      return { exitCode: 0, stdout: argv[0] === '/usr/bin/open' ? '' : JSON.stringify(value), stderr: '' }
    }
    await host.dispatch('ui.render', rowInput('p1', null))
    await host.dispatch('ui.render', rowInput('p2', whole))
    if (route === 'click') await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-0' })
    else await host.dispatch('command.run', { command: 'prompt-rail', args: '1' })
    assert.deepEqual(host.processes.filter(argv => argv[0] === '/usr/bin/open'), [
      ['/usr/bin/open', '-a', 'Google Chrome', 'http://127.0.0.1:45678/sessions/fixture-session?msg=42'],
    ])
    assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 1)
    assert.equal(host.notices.some(text => text.includes('nothing drawn')), false)
  })
}

const deferred = () => {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

async function archiveHost(t, options = {}) {
  const loaded = await loadHooks(source)
  t.after(loaded.dispose)
  const host = harness()
  const engine = host.register('prompt-rail', loaded.module, options)
  engine.ui.scroll = async args => {
    host.scrolls.push(args)
    return { deny: 'nothing drawn under that requestId' }
  }
  engine.process.run = async argv => {
    host.processes.push([...argv])
    const value = argv[2] === 'get'
      ? { id: 'fixture-session', agent: 'claude', transcript_revision: '1', web_url: 'http://localhost:45678/sessions/fixture-session' }
      : { transcript_revision: '1', messages: [{ session_id: 'fixture-session', ordinal: 42, role: 'user', source_uuid: 'p1', content: 'prompt p1' }] }
    return { exitCode: 0, stdout: argv[0] === '/usr/bin/open' ? '' : JSON.stringify(value), stderr: '' }
  }
  await host.dispatch('ui.render', rowInput('p1', null))
  await host.dispatch('ui.render', rowInput('p2', whole))
  const click = index => host.dispatch('ui.press', { plugin: 'prompt-rail', element: `jump-${index}` })
  return { host, engine, click }
}

test('native success never reads the archive or launches a browser', async t => {
  const { host, engine, click } = await archiveHost(t)
  engine.ui.scroll = async args => { host.scrolls.push(args); return {} }
  await click(0)
  assert.deepEqual(host.processes, [])
  assert.equal(heavy(await host.dispatch('ui.render', bandInput)), 0)
})

test('a disabled archive fallback leaves navigation terminal-only', async t => {
  const { host, click } = await archiveHost(t, { agentsViewFallback: false })
  await click(0)
  assert.deepEqual(host.processes, [])
  assert.equal(host.notices.length, 1)
})

for (const command of ['prompt-rail-prev', 'prompt-rail']) {
  test(`${command}: previous-prompt stepping never launches a browser`, async t => {
    const { host } = await archiveHost(t)
    await host.dispatch('command.run', { command, args: command === 'prompt-rail' ? 'prev' : '' })
    assert.equal(host.scrolls.length, 1)
    assert.deepEqual(host.processes, [])
  })
}

test('other scroll refusals do not use AgentsView', async t => {
  const { host, engine, click } = await archiveHost(t)
  engine.ui.scroll = async () => ({ deny: 'transcript scrolling is not supported here' })
  await click(0)
  assert.deepEqual(host.processes, [])
  assert.equal(host.notices.some(text => text.includes('AgentsView')), false)
})

test('repeated clicks during a lookup coalesce to one Chrome launch', async t => {
  const { host, engine, click } = await archiveHost(t)
  const started = deferred(), resume = deferred()
  const run = engine.process.run
  engine.process.run = async argv => {
    if (argv[2] === 'get') { started.resolve(); await resume.promise }
    return run(argv)
  }
  const first = click(0)
  await started.promise
  await click(0)
  resume.resolve()
  await first
  assert.equal(host.scrolls.length, 1)
  assert.equal(host.processes.filter(argv => argv[0] === '/usr/bin/open').length, 1)
})

for (const change of ['new click', 'clear session']) {
  test(`${change} cancels an older archive completion`, async t => {
    const { host, engine, click } = await archiveHost(t)
    const started = deferred(), resume = deferred()
    const run = engine.process.run
    engine.process.run = async argv => {
      if (argv[2] === 'get') { started.resolve(); await resume.promise }
      return run(argv)
    }
    const first = click(0)
    await started.promise
    if (change === 'new click') {
      engine.ui.scroll = async () => ({})
      await click(1)
    } else {
      await host.dispatch('classic.SessionStart', { source: 'clear', session_id: 'new-session', transcript_path: '/fixture/new.jsonl' })
    }
    resume.resolve()
    await first
    assert.equal(host.processes.some(argv => argv[0] === '/usr/bin/open'), false)
    assert.equal(host.notices.some(text => /superseded|Opened the archived/.test(text)), false)
  })
}

test('a jump superseded during its redraw cannot change the reading target', async t => {
  const loaded = await loadHooks(source, ['jumpTo'])
  t.after(loaded.dispose)
  const started = deferred(), resume = deferred()
  let current = true
  const engine = {
    ui: { scroll: async () => ({}) },
    state: { get: async () => { started.resolve(); await resume.promise; return { value: 0 } }, set: async () => {} },
  }
  const jump = loaded.module.jumpTo(engine, 'p1', 'p1', new Set(['p1']), { isUnscrollableSaid: false }, undefined, () => current)
  await started.promise
  current = false
  resume.resolve()
  assert.equal(await jump, false)
})
