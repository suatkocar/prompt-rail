import { build } from 'esbuild'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Exercise the real hook modules with deterministic engine boundaries. This
// complements the official test kit; it does not emulate a terminal's paint.
globalThis.h = (type, props, ...children) => type({ ...props, ...(children.length ? { children: children.flat(Infinity) } : {}) })
globalThis.Fragment = ({ children }) => ({ type: 'Fragment', props: {}, children })

export async function loadHooks(path, extraExports = []) {
  const directory = await mkdtemp(join(tmpdir(), 'prompt-rail-module-'))
  const outfile = join(directory, 'hooks.mjs')
  const source = resolve(path)
  try {
    await build({
      entryPoints: [source], outfile, bundle: true, platform: 'node', format: 'esm',
      jsxFactory: 'h', jsxFragment: 'Fragment', logLevel: 'silent',
      footer: extraExports.length ? { js: `export { ${extraExports.join(', ')} };` } : undefined,
      plugins: [{ name: 'engine-state-boundary', setup(builder) {
        builder.onResolve({ filter: /^claude-code$/ }, () => ({ path: 'engine', namespace: 'fixture' }))
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: `
          export const atom = (ref, fallback) => ({ ...ref, fallback });
          export const read = async ($, ref) => (await $.state.get(ref)).value ?? ref.fallback;
          export const update = async ($, ref, change) => {
            const value = change(await read($, ref));
            await $.state.set(ref, value);
            return value;
          };
        ` }))
      } }],
    })
    return { module: await import(pathToFileURL(outfile)), dispose: () => rm(directory, { recursive: true, force: true }) }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export function harness() {
  const hooks = []
  const state = new Map()
  const timers = []
  const scrolls = []
  const notices = []
  const processes = []
  const panes = []
  const commands = []
  const stores = new Map()
  let now = 0
  const key = ref => `${ref.plugin}:${ref.key}`
  const nodes = new Proxy({}, { get: (_, type) => props => ({ type, props, children: props?.children ?? [] }) })
  const engines = new Map()
  const register = (name, module, options = {}) => {
    const engine = {
      state: { get: async ref => ({ value: state.get(key(ref)) }), set: async (ref, value) => state.set(key(ref), value) },
      ui: { resolve: () => nodes, scroll: async args => { scrolls.push(args); return {} }, toast: text => notices.push(text), open: async args => { panes.push({ name, ...args }); return { isPlaced: true } }, close: async () => {} },
      command: { register: async args => { commands.push({ plugin: name, ...args }); return {} } },
      tool: { register: async () => ({}) },
      config: { set: async () => ({}), list: async () => [] },
      session: { id: async () => 'fixture-session', cwd: async () => '/fixture', root: async () => '/fixture', surfaces: async () => ['terminal'], turns: async () => 0 },
      env: { get: async variable => variable === 'TERM_PROGRAM' ? 'ghostty' : undefined },
      process: { run: async argv => { processes.push([...argv]); return { exitCode: 1, stdout: '', stderr: 'No fixture repository' } } },
      model: { complete: async () => { throw new Error('A UI integration test must never call a model') } },
      store: { get: async k => stores.get(`${name}:${k}`), set: async (k, v) => stores.set(`${name}:${k}`, v), keys: async () => [...stores.keys()].filter(k => k.startsWith(`${name}:`)).map(k => k.slice(name.length + 1)), delete: async k => stores.delete(`${name}:${k}`) },
      clock: { now: async () => now, every: () => ({ cancel() {} }), after: (ms, fn) => { const timer = { at: now + ms, fn, cancelled: false }; timers.push(timer); return { cancel() { timer.cancelled = true } } } },
    }
    engines.set(name, engine)
    module.register((event, matcher, fn) => {
      if (typeof matcher === 'function') { fn = matcher; matcher = {} }
      hooks.push({ name, event, matcher, fn })
    }, options)
    return engine
  }
  const dispatch = async (event, input, bottom = () => ({})) => {
    const selected = hooks.filter(hook => hook.event === event && Object.entries(hook.matcher).every(([key, value]) => Array.isArray(value) ? value.includes(input[key]) : input[key] === value))
    const run = (index, current) => index === selected.length ? bottom(current) : selected[index].fn(engines.get(selected[index].name), current, next => run(index + 1, next))
    return run(0, input)
  }
  const advance = async ms => {
    now += ms
    for (let index = 0; index < timers.length; index++) {
      const timer = timers[index]
      if (!timer.cancelled && timer.at <= now) { timer.cancelled = true; await timer.fn() }
    }
  }
  return { register, dispatch, advance, state, engines, scrolls, notices, nodes, processes, panes, commands }
}

export const bandInput = { component: 'AbovePrompt', surface: 'terminal', requestId: 'above-prompt', viewport: { columns: 120, rows: 40, isFullscreen: true }, props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 120, scroll: { offset: 0, bodyRows: 20 }, view: {} } }
export const rowInput = (id, onScreen) => ({ component: 'UserMessage', surface: 'terminal', requestId: id, props: { text: `prompt ${id}`, origin: { kind: 'composer' }, onScreen } })
export const whole = { first: 0, last: 1, of: 2 }
export function flatten(tree) {
  if (tree == null) return []
  if (Array.isArray(tree)) return tree.flatMap(flatten)
  return [tree, ...flatten(typeof tree === 'object' ? tree.children : [])]
}
export const heavy = tree => flatten(tree).filter(node => node?.type === 'Button' && /^jump-/.test(node.props.key)).findIndex(node => node.props.label === '┃')
