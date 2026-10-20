export type AgentRow = {
  id: string
  name: string
  model: string
  task: string
  why: string
  tokens: number
  cacheRead: number
  cost?: number
  opusCost?: number
  startedAt: number
  endedAt?: number
  status: 'running' | 'done' | 'failed'
  log: string[]
}

export type UiState = { filter: 'todos' | 'running' | 'done' | 'failed'; open: string[] }

declare module 'claude-code' {
  interface PluginState {
    'agent-router': { agents: AgentRow[]; ui: UiState; main: { cost: number }; streak: { browser: number; work: number; direct: number } }
  }
}
