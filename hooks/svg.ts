import type { AgentRow } from '../types'
import { fmtDur, fmtTok, fmtUsd } from './router'

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const W = 560

// Tema claro/oscuro por prefers-color-scheme dentro del SVG (marco aislado, sin script).
const STYLE = `<style>
:root{--card:#f8fafc;--bd:#e2e8f0;--tx:#0f172a;--mu:#64748b;--trk:#e2e8f0}
@media (prefers-color-scheme:dark){:root{--card:#111a2e;--bd:#24304a;--tx:#e5e7eb;--mu:#94a3b8;--trk:#24304a}}
text{font-family:system-ui,-apple-system,Segoe UI,sans-serif;fill:var(--tx);font-size:13px}
.mu{fill:var(--mu);font-size:11px}.big{font-size:22px;font-weight:700}.b{font-weight:600}
.card{fill:var(--card);stroke:var(--bd)}.k:hover{stroke:var(--mu)}
.ic{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
</style>`

// Iconos 16x16 dibujados a mano; solo paths, 100% locales al render del panel.
const ICONS: Record<string, string> = {
  coin: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5v7M10 6.3C9.5 5.6 6 5.4 6 7.2 6 9 10 8.2 10 10 10 11.6 6.6 11.5 6 10.5"/>',
  bolt: '<path d="M9 1.5 3.5 9H8l-1 5.5L12.5 7H8z"/>',
  clock: '<circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.5 1.5"/>',
  shield: '<path d="M8 1.5 13 3.5v4c0 3-2 5.3-5 7-3-1.7-5-4-5-7v-4z"/><path d="M5.8 8l1.6 1.6L10.5 6.5"/>',
  lock: '<rect x="3.5" y="7" width="9" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  check: '<circle cx="8" cy="8" r="6"/><path d="M5.3 8.2l1.9 1.9 3.6-3.8"/>',
  cross: '<circle cx="8" cy="8" r="6"/><path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4"/>',
  play: '<circle cx="8" cy="8" r="6"/><path d="M6.8 5.5v5l4-2.5z"/>',
  explore: '<circle cx="7" cy="7" r="4.5"/><path d="M10.3 10.3 14 14"/>',
  plan: '<path d="M3 3.5h10M3 8h10M3 12.5h6"/>',
  code: '<path d="M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5"/>',
  bot: '<rect x="3" y="5" width="10" height="8" rx="2"/><path d="M8 5V2.5M6 9h.01M10 9h.01"/>',
}
const icon = (n: string, x: number, y: number, col: string) =>
  `<g class="ic" transform="translate(${x} ${y})" stroke="${col}">${ICONS[n]}</g>`
const kind = (name: string) => (/explor/i.test(name) ? 'explore' : /plan/i.test(name) ? 'plan' : /general|code|impl/i.test(name) ? 'code' : 'bot')

const MC: Record<string, string> = { opus: '#a855f7', sonnet: '#06b6d4', haiku: '#22c55e' }
const ST: Record<string, string> = { running: '#f59e0b', done: '#22c55e', failed: '#ef4444' }
const wrap = (h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" width="${W}" height="${h}">${STYLE}${body}</svg>`

export function summarySvg(n: number, cost: number, saved: number, main: number, direct: number, strict: boolean, limit: number): string {
  const card = (x: number, w: number, ic: string, label: string, val: string, col: string, tip: string) =>
    `<g><title>${esc(tip)}</title><rect class="card k" x="${x}" y="0.5" width="${w}" height="63" rx="10"/>` +
    icon(ic, x + 12, 10, col) +
    `<text class="mu" x="${x + 34}" y="22">${esc(label)}</text><text class="big" x="${x + 12}" y="50" style="fill:${col}">${esc(val)}</text></g>`
  const lock = `<g><title>${esc(strict ? `Modo estricto: bloquea tras ${limit} acciones directas` : 'Modo estricto desactivado')}</title>${icon(strict ? 'lock' : 'shield', W - 30, 10, strict ? '#f59e0b' : '#94a3b8')}</g>`
  return wrap(64,
    card(0, 176, 'coin', `Costo (${n} agentes)`, fmtUsd(cost), '#06b6d4', 'Costo total de subagentes') +
    card(188, 176, 'bolt', 'Ahorro vs opus', fmtUsd(saved), '#22c55e', 'Lo que habria costado en opus, menos lo real') +
    card(376, 184, 'shield', 'Principal', fmtUsd(main), '#f59e0b', `acciones directas: ${direct}`) + lock)
}

export function agentSvg(a: AgentRow, maxTok: number, now: number): string {
  const mc = MC[a.model] ?? '#94a3b8'
  const sc = ST[a.status] ?? '#94a3b8'
  const save = Math.max(0, (a.opusCost || 0) - (a.cost || 0))
  const bw = Math.max(2, Math.round((a.tokens / Math.max(1, maxTok)) * 300))
  const stIcon = a.status === 'running'
    ? `<g>${icon('play', 10, 12, sc)}<circle cx="18" cy="20" r="3" fill="${sc}"><animate attributeName="opacity" values="1;.2;1" dur="1.2s" repeatCount="indefinite"/></circle></g>`
    : icon(a.status === 'done' ? 'check' : 'cross', 10, 12, sc)
  const chip = (x: number, ic: string, t: string, tip: string) =>
    `<g><title>${esc(tip)}</title><rect x="${x}" y="60" width="${t.length * 6.2 + 34}" height="22" rx="11" style="fill:var(--bd)"/>` +
    `<g class="ic" transform="translate(${x + 6} 64) scale(.8)" stroke="var(--mu)">${ICONS[ic]}</g>` +
    `<text class="mu" x="${x + 24}" y="75">${esc(t)}</text></g>`
  const c1 = fmtUsd(a.cost || 0), c2 = `${fmtTok(a.tokens)} tok`, c3 = fmtDur((a.endedAt ?? now) - a.startedAt)
  const x2 = 14 + c1.length * 6.2 + 34 + 8, x3 = x2 + c2.length * 6.2 + 34 + 8
  return wrap(96,
    `<g><title>${esc(a.task || a.name)}</title><rect class="card k" x="0.5" y="0.5" width="${W - 1}" height="94" rx="12"/>` +
    stIcon + icon(kind(a.name), 32, 10, 'var(--mu)') + `<text class="b" x="54" y="25">${esc(cut(a.name, 32))}</text>` +
    `<rect x="${W - 86}" y="9" width="70" height="22" rx="11" fill="${mc}" fill-opacity=".18" stroke="${mc}"/>` +
    `<text class="b" x="${W - 51}" y="24" text-anchor="middle" style="fill:${mc};font-size:12px">${esc(a.model)}</text>` +
    `<text class="mu" x="14" y="50">${esc(cut(a.task || '', 78))}</text>` +
    chip(14, 'coin', c1, 'costo') + chip(x2, 'bot', c2, `tokens (cache ${fmtTok(a.cacheRead)})`) + chip(x3, 'clock', c3, 'duracion') +
    (save > 0 ? icon('bolt', W - 110, 63, '#22c55e') + `<text class="mu" x="${W - 14}" y="75" text-anchor="end" style="fill:#22c55e">ahorro ${esc(fmtUsd(save))}</text>` : '') +
    `<rect x="14" y="87" width="${bw}" height="3" rx="1.5" fill="${mc}"><title>${esc(fmtTok(a.tokens))} tok</title></rect></g>`)
}
