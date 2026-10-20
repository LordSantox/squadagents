// Plantilla de decision: elige el modelo MAS BARATO que sirve para la tarea.
// Reglas locales (regex), cero llamadas al modelo: decidir no gasta tokens.
export type Pick = { model: 'haiku' | 'sonnet' | 'opus'; why: string }

// Por tipo de agente: lo que define el tipo manda (Explore se trata aparte).
const BY_TYPE: Record<string, Pick> = {
  'claude-code-guide': { model: 'haiku', why: 'consulta de documentacion' },
  'statusline-setup': { model: 'haiku', why: 'configuracion simple' },
  Plan: { model: 'opus', why: 'tipo Plan: planificar' },
}

// Opus para pensar: planificar, disenar, decidir, y VALIDAR/INVESTIGAR a fondo
// (cruzar codigo contra docs o un backtest, buscar por que algo diverge). Un
// haiku en esas tareas tiende a confirmar lo pedido sin encontrar el problema.
const OPUS = /\b(planif|plan de|arquitect|dise[nñ]|design|decid|decision|estrateg|trade.?off|audit|security review|revisi[oó]n profunda|root cause|causa ra[ií]z|verific|verify|valid|investig|diverg|reproduc|compar[ae]\w* contra|compare against|contrast)/i
// Ejecutar y diagnosticar (tests, fallos, implementar): sonnet, nunca haiku aunque diga "lista".
const SONNET = /\b(pytest|tests?\b|fallo|fallid|failing|diagnos|debug|traceback|implement|arregl|fix|entregables|migraci[oó]n|endpoint|componente)/i
// Haiku para lo mecanico: buscar, leer, listar, resumir, contar, traducir.
const HAIKU = /\b(busca|buscar|search|find|grep|localiza|locate|lista|listar|list|lee|leer|read|resum|summar|explor|cuenta|count|traduc|translat|renombra|rename|formatea|format)/i

// Pruebas de navegador con guion (clic, captura, recorrer UI): mecanico, haiku.
const BROWSER = /(navegador|browser|cl[ií]c|click|captura|screenshot|recorrer la UI|verificar en pantalla|playwright)/i
const WHY = /(por qu[eé]|why)/i

export function pickModel(subagentType: string, text: string): Pick {
  const t = BY_TYPE[subagentType]
  if (t) return t
  if (subagentType === 'Explore') {
    // Explore es solo lectura: haiku para ubicar, sonnet si debe verificar contra el codigo.
    return OPUS.test(text)
      ? { model: 'sonnet', why: 'Explore que verifica/cruza contra el codigo' }
      : { model: 'haiku', why: 'tipo Explore: buscar/leer' }
  }
  if (BROWSER.test(text)) {
    return SONNET.test(text) || WHY.test(text)
      ? { model: 'sonnet', why: 'navegador que ademas diagnostica' }
      : { model: 'haiku', why: 'pruebas de navegador con guion' }
  }
  // La intencion la marca la descripcion (1a linea). Un prompt de IMPLEMENTACION que
  // al final dice "verifica con tests" no es una tarea de pensar: manda sonnet.
  const desc = text.split(/\r?\n/)[0] ?? ''
  if (OPUS.test(desc) && !SONNET.test(desc)) return { model: 'opus', why: 'pensar/validar/investigar/decidir' }
  if (SONNET.test(text)) return { model: 'sonnet', why: 'ejecutar/diagnosticar/implementar' }
  if (OPUS.test(text)) return { model: 'opus', why: 'pensar/validar/investigar/decidir' }
  if (HAIKU.test(text) && text.length < 4000) return { model: 'haiku', why: 'tarea mecanica corta' }
  return { model: 'sonnet', why: 'implementar/editar/depurar' }
}

export const shortModel = (m: string) =>
  /haiku/i.test(m) ? 'haiku' : /sonnet/i.test(m) ? 'sonnet' : /opus/i.test(m) ? 'opus' : m

export const fmtTok = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`)

export const fmtDur = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s >= 60 ? `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s` : `${s}s`
}

// Lo que el modelo principal lee en su system prompt. Sin esto, una sesion
// asumio que los subagentes heredaban su modelo y le informo mal al usuario.
export const PROMPT_SECTION = [
  '# Mod squadagents (activo)',
  'Cuando lanzas un subagente con la herramienta Agent SIN el parametro `model`, el mod squadagents elige el modelo (haiku/sonnet/opus) con reglas sobre el tipo y el prompt; NO hereda el modelo de esta sesion.',
  'Reglas: Plan -> opus; Explore -> haiku (sonnet si debe verificar contra el codigo); planificar/disenar/decidir/validar/investigar/comparar contra -> opus; tests/diagnostico/implementar -> sonnet; buscar/leer/listar corto -> haiku; pruebas de navegador con guion (clic/captura/recorrer UI) -> haiku, sonnet si ademas diagnostica (se evalua antes que opus); resto -> sonnet.',
  'Si la tarea exige criterio y el prompt no lo deja claro, pasa `model` explicito: el mod lo respeta. Si llevas muchas acciones directas seguidas (navegador >3, Bash/Edit/Write >5) el mod te avisa: delega a un subagente. Tras cada Agent llega una nota "squadagents:" con el modelo elegido; usa ESE dato si el usuario pregunta, no lo supongas.',
].join('\n')

const RANK: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2 }
const rankOf = (m: string) => RANK[shortModel(m)] ?? 2 // desconocido o full id raro = el caro

// Las reglas mandan: un `model` explicito solo puede BAJAR el costo, nunca subirlo.
// Asi el agente principal no puede saltarse la plantilla pidiendo opus "por si acaso".
export function resolveModel(p: Pick, explicit?: string, parentModel?: string): { model: string; why: string } {
  if (!explicit) return { model: p.model, why: p.why }
  const asked = explicit === 'inherit' ? (parentModel || 'opus') : explicit
  if (rankOf(asked) <= (RANK[p.model] ?? 2)) return { model: shortModel(asked), why: `pedido ${shortModel(asked)} (≤ regla ${p.model})` }
  return { model: p.model, why: `forzado a ${p.model}: se pidio ${shortModel(asked)} pero la regla dice ${p.why}` }
}

export const spawnNote = (p: Pick, explicit?: string, parentModel?: string) => {
  const r = resolveModel(p, explicit, parentModel)
  return `squadagents: este subagente corre con ${r.model} (${r.why}). Las reglas mandan; un model explicito solo puede bajar el costo.`
}

// Precios oficiales USD por millón de tokens (skill claude-api, cache 2026-10-06).
// cache write = 1.25× input (TTL 5 min). Se elige por el id real que reporta la API.
type Price = { in: number; out: number; cw: number; cr: number }
const PRICES: Array<[RegExp, Price]> = [
  [/opus-5-5|opus/i, { in: 4, out: 20, cw: 5, cr: 0.2 }],
  [/sonnet-5-5|sonnet-5\b|sonnet/i, { in: 2, out: 10, cw: 2.5, cr: 0.2 }],
  [/haiku-5-5/i, { in: 0.1, out: 0.5, cw: 0.125, cr: 0.01 }],
  [/haiku/i, { in: 1, out: 5, cw: 1.25, cr: 0.1 }],
]
const OPUS_PRICE: Price = { in: 4, out: 20, cw: 5, cr: 0.2 }
const priceOf = (model: string): Price => (PRICES.find(([re]) => re.test(model)) || [null, OPUS_PRICE])[1]

export type Usage = { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number }
const costWith = (p: Price, u: Usage) =>
  (u.input_tokens * p.in + u.output_tokens * p.out + u.cache_creation_input_tokens * p.cw + u.cache_read_input_tokens * p.cr) / 1e6

// Costo real del paso y lo que habria costado en opus.
export const stepCost = (model: string, u: Usage) => ({ cost: costWith(priceOf(model), u), opus: costWith(OPUS_PRICE, u) })

export const fmtUsd = (n: number) => (n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(3)}`)

// Grupo = primera palabra de la descripcion si trae guion o digito ("SMC-P1 1.2 x" -> "SMC-P1"); si no, "otros".
export const groupOf = (task: string) => {
  const w = (task || '').trim().split(/\s+/)[0] || ''
  return /[-\d]/.test(w) ? w : 'otros'
}

// Barra de avance de texto: n de total, `width` celdas.
export const bar = (n: number, total: number, width = 10) => {
  const f = total > 0 ? Math.round((Math.min(n, total) / total) * width) : 0
  return '█'.repeat(f) + '░'.repeat(width - f)
}

// Agrupa conservando el orden de primera aparicion.
export function groupAgents<T extends { task: string }>(list: T[]): Array<[string, T[]]> {
  const m = new Map<string, T[]>()
  for (const a of list) {
    const g = groupOf(a.task)
    m.set(g, [...(m.get(g) ?? []), a])
  }
  return [...m]
}

// Racha de acciones directas del principal: avisa tras 3 de navegador o 5 de trabajo seguidas.
export type Streak = { browser: number; work: number; direct: number }
export const isBrowserTool = (n: string) => /^mcp__(Claude_Browser|claude-in-chrome)__/.test(n)
export const isWorkTool = (n: string) => /^(Bash|PowerShell|Edit|Write)$/.test(n)
export function bumpStreak(s: Streak, tool: string): { s: Streak; note?: string } {
  const b = isBrowserTool(tool), w = isWorkTool(tool)
  if (!b && !w) return { s }
  const n = { browser: b ? s.browser + 1 : 0, work: w ? s.work + 1 : 0, direct: s.direct + 1 }
  const k = b ? n.browser : n.work
  const note = (b ? k > 3 : k > 5)
    ? `squadagents: llevas ${k} acciones directas seguidas con el modelo principal; delega este trabajo a un subagente (navegador con guion → haiku; implementar/diagnosticar → sonnet)`
    : undefined
  return { s: n, note }
}
