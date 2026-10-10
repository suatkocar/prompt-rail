import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { loadHooks, harness, bandInput, rowInput, whole, flatten } from './hook-harness.mjs'

// Explicit paths keep local sibling checkouts out of the repository's contents.
assert.ok(process.env.INBOX_DIR, 'Set INBOX_DIR to the Inbox checkout under test')
assert.ok(process.env.IMAGE_VIEW_DIR, 'Set IMAGE_VIEW_DIR to the Image View checkout under test')
const sources = {
  'prompt-rail': new URL('../plugins/prompt-rail/hooks/index.tsx', import.meta.url).pathname,
  inbox: join(process.env.INBOX_DIR, 'hooks/register.tsx'),
  'image-view': join(process.env.IMAGE_VIEW_DIR, 'hooks/register.tsx'),
}
const permutations = values => values.length ? values.flatMap(value => permutations(values.filter(v => v !== value)).map(rest => [value, ...rest])) : [[]]
const text = tree => flatten(tree).filter(value => typeof value === 'string').join(' ')
const buttons = tree => flatten(tree).filter(node => node?.type === 'Button')
const hasImage = tree => flatten(tree).some(node => node?.type === 'Image')
const hasRail = tree => buttons(tree).some(node => node.props.key === 'jump-0')
const emptyLedger = { card: null, items: [], closed: [], findings: [], prs: [], nextId: 1, turn: 0, batchTurn: 0 }
const card = { goal: 'Review fixture changes', done: ['Read fixtures'], now: 'Ready for review', running: [], updatedAt: 0 }
const ledger = { ...emptyLedger, card, turn: 1 }

for (const order of permutations(Object.keys(sources))) {
  test(`real hooks coexist in order: ${order.join(' / ')}`, async t => {
    const loaded = Object.fromEntries(await Promise.all(order.map(async name => {
      const hooks = await loadHooks(sources[name])
      t.after(hooks.dispose)
      return [name, hooks.module]
    })))
    const host = harness()
    let draft = '[Image #1] Review this'
    for (const name of order) {
      const engine = host.register(name, loaded[name], { mode: 'horizontal' })
      engine.prompt = {
        read: async () => ({ text: draft }),
        fill: async ({ text }) => { draft = text; return { isFilled: true } },
      }
    }
    // Exercise startup without existing turns, saved state, real processes or a model.
    await host.dispatch('session.start', { cwd: '/fixture', surface: 'terminal', isInteractive: true })
    assert.deepEqual(host.commands.map(c => c.name).sort(), ['inbox', 'prompt-rail', 'prompt-rail-next', 'prompt-rail-prev'])
    host.state.set('inbox:ledger', structuredClone(ledger))
    host.state.set('image-view:images', [{ n: 1, path: '/fixture/1.png', source: '/fixture/1.png', size: { width: 800, height: 400 } }])
    for (let n = 1; n <= 3; n++) await host.dispatch('ui.render', rowInput(`p${n}`, n === 2 ? whole : null))
    const base = () => ({ type: 'Text', props: {}, children: ['Host band'] })
    const render = input => host.dispatch('ui.render', input ?? bandInput, base)
    const check = (tree, { rail = true, image = true, inbox = true } = {}) => {
      assert.equal(hasRail(tree), rail)
      assert.equal(hasImage(tree), image)
      assert.equal(text(tree).includes(card.goal), inbox)
      assert.ok(text(tree).includes('Host band'))
    }
    check(await render())
    check(await render({ ...bandInput, props: { ...bandInput.props, isWorking: true } }))
    check(await render({ ...bandInput, props: { ...bandInput.props, hasSurvey: true } }), { rail: false, image: false, inbox: false })

    // Jump routing stays with Prompt Rail; the other hooks pass it through.
    await host.dispatch('ui.press', { plugin: 'prompt-rail', element: 'jump-0', component: 'AbovePrompt', requestId: 'above-prompt' })
    assert.deepEqual(host.scrolls, [{ to: { requestId: 'p1' }, block: 'start' }])

    // Image View's actual pointer message and button closures preserve the two bands.
    await host.dispatch('ui.message', { component: 'AbovePrompt', surface: 'terminal', element: 'preview-1', module: 'hooks/thumbnail-pointer.tsx', data: 'open-preview' })
    let tree = await render()
    check(tree)
    assert.ok(flatten(tree).some(node => node?.props?.key === 'expanded-preview'))
    await buttons(tree).find(node => node.props.key === 'open-preview-original').props.onPress()
    assert.deepEqual(host.processes.at(-1), ['open', '/fixture/1.png'])
    await buttons(tree).find(node => node.props.key === 'close-preview').props.onPress()
    tree = await render()
    check(tree)
    assert.ok(flatten(tree).some(node => node?.props?.key === 'preview-1'))

    // Stop, return and empty states have separate Inbox render branches.
    host.state.set('inbox:stop', { kind: 'sign-in', detail: 'authentication_failed', resets: null, at: 0 })
    tree = await render()
    check(tree, { inbox: false })
    assert.ok(text(tree).includes('Stopped'))
    host.state.set('inbox:stop', null)
    host.state.set('inbox:ledger', structuredClone(emptyLedger))
    host.state.set('inbox:previous', { ledger: structuredClone(ledger), savedAt: 0, isBroughtIn: false })
    tree = await render()
    check(tree)
    assert.ok(text(tree).includes('Last session'))
    host.state.set('inbox:previous', null)
    check(await render(), { inbox: false })
    host.state.set('inbox:ledger', structuredClone(ledger))

    for (const mode of ['off', 'vertical', 'horizontal']) {
      await host.dispatch('command.run', { command: 'prompt-rail', args: mode })
      check(await render(), { rail: mode === 'horizontal' })
    }
    tree = await render()
    await buttons(tree).find(node => node.props.key === 'remove-1').props.onPress()
    assert.equal(draft, 'Review this')
    check(await render(), { image: false })
  })
}
