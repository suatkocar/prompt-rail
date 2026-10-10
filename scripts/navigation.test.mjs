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
