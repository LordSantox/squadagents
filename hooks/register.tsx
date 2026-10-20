import type { Register } from 'claude-code'

import type { AgentRow, UiState } from '../types'
import { fmtDur, fmtTok, bar, fmtUsd, bumpStreak, groupAgents, pickModel, resolveModel, shortModel, spawnNote, stepCost } from './router'

const PANE = 'squadagents'
const AGENTS = { plugin: 'squadagents', key: 'agents' } as const
const MAX_ROWS = 30
const MAX_LOG = 12
const MAIN = { plugin: 'squadagents', key: 'main' } as const
const UI = { plugin: 'squadagents', key: 'ui' } as const
const FILTERS: Array<[UiState['filter'], string]> = [['todos', 'Todos'], ['running', 'Corriendo'], ['done', 'Terminados'], ['failed', 'Fallados']]
const STOP_MSG = 'Detente despues del paso actual y reporta tu estado.'

// Lee y escribe con ifVersion (reintenta si otro evento escribio en medio).
async function mutate($: any, fn: (list: AgentRow[]) => AgentRow[]) {
  for (let i = 0; i < 5; i++) {
    const held = await $.state.get(AGENTS)
    const r = await $.state.set(AGENTS, fn(held.value ?? []), { ifVersion: held.version })
    if (r.isSet) return
  }
}

// Agentes que no pasaron por agent.spawn (retomados con SendMessage, o de antes de
// cargar el mod): se dan de alta con lo que diga $.agent.list() al ver su actividad.
async function patch($: any, id: string, fn: (a: AgentRow) => AgentRow, model?: string) {
  const list: AgentRow[] = (await $.state.get(AGENTS)).value ?? []
  if (!list.some(a => a.id === id)) {
    let info: any = null
    try { info = ((await $.agent.list()) || []).find((x: any) => x.id === id) } catch {}
    const row: AgentRow = {
      id, name: info?.name || info?.type || 'agente', model: model ? shortModel(model) : '?',
      task: info?.description || '', why: 'retomado', tokens: 0, cacheRead: 0,
      startedAt: Date.now(), status: 'running', log: ['retomado'],
    }
    await mutate($, l => (l.some(a => a.id === id) ? l : [...l, row].slice(-MAX_ROWS)))
  }
  await mutate($, l => l.map(a => (a.id === id ? fn(a) : a)))
}

const total = (list: AgentRow[]) => list.reduce((s, a) => s + a.tokens, 0)
const usd = (list: AgentRow[]) => list.reduce((s, a) => s + (a.cost || 0), 0)
const saved = (list: AgentRow[]) => list.reduce((s, a) => s + Math.max(0, (a.opusCost || 0) - (a.cost || 0)), 0)

async function refreshStatus($: any) {
  const list: AgentRow[] = (await $.state.get(AGENTS)).value ?? []
  const vivos = list.filter(a => a.status === 'running').length
  $.ui.status(list.length ? `🤖 ${vivos}/${list.length} · ${fmtUsd(usd(list))} · ahorro ${fmtUsd(saved(list))}` : undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'squad', description: 'Panel de subagentes: modelo, tarea, tokens, tiempo y log' })
    return next(e)
  })

  on('command.run', { command: 'squad' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Agentes' })
    return { text: 'Panel squadagents abierto.' }
  })

  // Elige el modelo antes de arrancar el subagente. Respeta un `model` explicito y los forks.
  on('agent.spawn', async ($, e, next) => {
    // Las reglas mandan: un `model` explicito solo se respeta si es igual o mas barato.
    let why = 'fork'
    let model = e.model
    if (!e.fork) {
      const r = resolveModel(pickModel(e.subagentType, `${e.description}\n${e.prompt}`), e.model, e.parentModel)
      model = r.model
      why = r.why
    }
    const r = await next(e.fork ? e : { ...e, model })
    if ('deny' in r && r.deny) return r
    const row: AgentRow = {
      id: r.agentId ?? e.tool_use_id,
      name: e.name || e.subagentType,
      model: shortModel(r.model || model || e.parentModel),
      task: e.description,
      why: e.fork ? 'fork (hereda modelo)' : why,
      tokens: 0,
      cacheRead: 0,
      startedAt: Date.now(),
      status: 'running',
      log: [`inicio · ${why}`],
    }
    await mutate($, list => [...list, row].slice(-MAX_ROWS))
    await refreshStatus($)
    void $.ui.open({ id: PANE, title: 'Agentes' })
    return r
  })

  // Tras cada Agent, una nota (solo para el modelo) con el modelo que se eligio.
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const r = await next(e)
    if (r.deny !== undefined) return r
    const a = e as any
    if (a.subagent_type === 'fork') return r
    const note = spawnNote(
      pickModel(a.subagent_type ?? 'general-purpose', `${a.description ?? ''}\n${a.prompt ?? ''}`),
      a.model,
    )
    return { ...r, context: [...(r.context ?? []), note] }
  })

  // Aviso de racha: solo agente principal (sin agentId). Agent reinicia; nunca bloquea.
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    const ev = e as any
    if (ev.agentId || r.deny !== undefined) return r
    const name = String(ev.tool ?? ev.toolName ?? ev.name ?? '')
    const key = { plugin: 'squadagents', key: 'streak' } as const
    const cur = ((await ($ as any).state.get(key)).value ?? { browser: 0, work: 0, direct: 0 })
    const direct = cur.direct
    const { s, note } = name === 'Agent' ? { s: { browser: 0, work: 0, direct }, note: undefined } : bumpStreak(cur, name)
    await ($ as any).state.set(key, s)
    return note ? { ...r, context: [...(r.context ?? []), note] } : r
  })

  // Retomar un agente con SendMessage no pasa por agent.spawn: se registra aqui.
  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const r = await next(e)
    const to = String((e as any).to ?? '')
    if (to && r.deny === undefined) {
      try {
        const info = ((await $.agent.list()) || []).find((x: any) => x.id === to || x.name === to)
        if (info) {
          await patch($, info.id, a => ({ ...a, status: 'running', endedAt: undefined,
            log: [...a.log, 'retomado (SendMessage)'].slice(-MAX_LOG) }))
          await refreshStatus($)
          void $.ui.open({ id: PANE, title: 'Agentes' })
        }
      } catch {}
    }
    return r
  })

  // Tokens por paso del subagente: dato que el motor ya trae, sin llamadas extra.
  on('turn.step', async function* ($, e, next) {
    const r = yield* next(e)
    if (!e.agentId && r && 'usage' in r && r.usage) {
      const c = stepCost(e.model, r.usage).cost
      for (let i = 0; i < 5; i++) {
        const h = await ($ as any).state.get(MAIN)
        const v = h.value ?? { cost: 0 }
        if ((await ($ as any).state.set(MAIN, { cost: v.cost + c }, { ifVersion: h.version })).isSet) break
      }
    }
    if (e.agentId && r && 'usage' in r && r.usage) {
      const u = r.usage
      const c = stepCost(e.model, u)
      await patch($, e.agentId, a => ({
        ...a,
        model: a.model === '?' ? shortModel(e.model) : a.model,
        // Retomado tras terminar: vuelve a estar trabajando.
        status: 'running', endedAt: undefined,
        tokens: a.tokens + u.input_tokens + u.output_tokens + u.cache_creation_input_tokens,
        cacheRead: a.cacheRead + u.cache_read_input_tokens,
        cost: (a.cost || 0) + c.cost,
        opusCost: (a.opusCost || 0) + c.opus,
      }), e.model)
      await refreshStatus($)
    }
    return r
  })


  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    if (e.agentId) {
      const ok = e.reason === 'answer'
      await patch($, e.agentId, a => ({
        ...a, status: ok ? 'done' : 'failed', endedAt: Date.now(),
        log: [...a.log, ok ? 'terminado' : `fin: ${e.reason}`].slice(-MAX_LOG),
      }))
      await refreshStatus($)
    }
    return r
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list: AgentRow[] = (await $.state.get(AGENTS)).value ?? []
    const ui: UiState = (await $.state.get(UI)).value ?? { filter: 'todos', open: [] }
    const main = (await ($ as any).state.get(MAIN)).value ?? { cost: 0 }
    const direct = ((await ($ as any).state.get({ plugin: 'squadagents', key: 'streak' })).value ?? { direct: 0 }).direct
    const now = Date.now()
    const frame = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'[Math.floor(now / 200) % 10] // sin elemento Spinner en la API de paneles: glifo por reloj
    const color = (m: string) => (m === 'opus' ? 'magenta' : m === 'sonnet' ? 'cyan' : 'green')
    const setUi = (fn: (u: UiState) => UiState) => $.state.set(UI, fn(ui))
    const shown = list.filter(a => ui.filter === 'todos' || a.status === ui.filter)
    const groups = groupAgents(shown.slice().reverse())
    return (
      <Box flexDirection="column">
        <Text color="yellow">principal: {fmtUsd(main.cost)} · acciones directas: {direct}</Text>
        <Text bold>
          {list.length} agentes · {fmtUsd(usd(list))} · ahorro {fmtUsd(saved(list))} vs opus
        </Text>
        <Box>
          {FILTERS.map(([f, label]) => (
            <Button key={`f-${f}`} variant={ui.filter === f ? 'primary' : undefined} onPress={() => void setUi(u => ({ ...u, filter: f }))}>{label}</Button>
          ))}
          <Button key="clear" dimColor onPress={() => void mutate($, l => l.filter(a => a.status !== 'done')).then(() => refreshStatus($))}>Limpiar terminados</Button>
        </Box>
        {shown.length === 0 && <Text dimColor>{list.length ? 'Nada con ese filtro.' : 'Sin subagentes todavia. Se listan al lanzarse.'}</Text>}
        {groups.map(([g, items]) => {
          const fin = items.filter(a => a.status !== 'running').length
          return (
            <Box flexDirection="column" marginTop={1}>
              <Text bold>{g} <Text dimColor>{bar(fin, items.length)} {fin}/{items.length} · {fmtUsd(usd(items))}</Text></Text>
              {items.map(a => {
                const isOpen = ui.open.includes(a.id)
                return (
                  <Box flexDirection="column">
                    <Box>
                      <Button key={`x-${a.id}`} plain onPress={() => void setUi(u => ({ ...u, open: isOpen ? u.open.filter(i => i !== a.id) : [...u.open, a.id] }))}>{isOpen ? '▾' : '▸'}</Button>
                      <Text>
                        {' '}
                        <Text color={a.status === 'running' ? 'yellow' : a.status === 'done' ? 'green' : 'red'}>
                          {a.status === 'running' ? `${frame} ` : a.status === 'done' ? '✓ ' : '✗ '}
                        </Text>
                        <Text bold>{a.name}</Text>
                        <Text> · </Text>
                        <Text color={color(a.model)}>{a.model}</Text>
                        <Text dimColor>
                          {' '}· {fmtUsd(a.cost || 0)}{(a.opusCost || 0) > (a.cost || 0) ? ` (ahorro ${fmtUsd((a.opusCost || 0) - (a.cost || 0))})` : ''} · {fmtTok(a.tokens)} tok · {fmtDur((a.endedAt ?? now) - a.startedAt)}
                        </Text>
                      </Text>
                      {a.status === 'running' && (
                        <Button key={`s-${a.id}`} dimColor onPress={() => void $.session.send({ to: { agentId: a.id }, text: STOP_MSG })}>Pedir que frene</Button>
                      )}
                    </Box>
                    <Text dimColor>  {a.task}</Text>
                    {a.why?.startsWith('forzado') && <Text color="yellow">  ⚠ {a.why}</Text>}
                    {isOpen && (
                      <Box flexDirection="column">
                        <Text dimColor>  modelo: {a.why} · cache: {fmtTok(a.cacheRead)} tok · inicio {new Date(a.startedAt).toLocaleTimeString()}</Text>
                        {a.log.map(l => <Text dimColor>  · {l}</Text>)}
                      </Box>
                    )}
                  </Box>
                )
              })}
            </Box>
          )
        })}
      </Box>
    )
  })
}
