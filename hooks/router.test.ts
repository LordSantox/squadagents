import { test, expect } from 'claude-code/testing'

import { pickModel, fmtTok, fmtDur, groupOf, bar, groupAgents, shouldBlock, isExempt, parseStrict } from './router'

test('Explore usa haiku', () => {
  expect(pickModel('Explore', 'cualquier cosa').model).toBe('haiku')
})

test('Plan usa opus', () => {
  expect(pickModel('Plan', 'x').model).toBe('opus')
})

test('planificar o decidir usa opus', () => {
  expect(pickModel('general-purpose', 'Diseña la arquitectura del modulo').model).toBe('opus')
  expect(pickModel('general-purpose', 'decide which approach is better').model).toBe('opus')
})

test('buscar o leer corto usa haiku', () => {
  expect(pickModel('general-purpose', 'Busca donde se define crew_stamina').model).toBe('haiku')
})

test('implementar usa sonnet', () => {
  expect(pickModel('general-purpose', 'Implementa el endpoint y agrega tests').model).toBe('sonnet')
})

test('Explore que verifica contra el codigo usa sonnet', () => {
  expect(pickModel('Explore', 'Determina cuales pendientes siguen abiertos. Verifica contra el codigo').model).toBe('sonnet')
})

test('validar o investigar una divergencia usa opus', () => {
  expect(pickModel('general-purpose', 'verificar si el bot reproduce el backtest e investiga la causa').model).toBe('opus')
})

test('correr tests usa sonnet aunque diga listar', () => {
  expect(pickModel('general-purpose', 'Corre pytest y lista los tests fallidos').model).toBe('sonnet')
})

test('formatos', () => {
  expect(fmtTok(1530)).toBe('1.5k')
  expect(fmtTok(900)).toBe('900')
  expect(fmtDur(75000)).toBe('1m15s')
})

test('grupo por primera palabra con guion o digito', () => {
  expect(groupOf('SMC-P1 1.2 swings')).toBe('SMC-P1')
  expect(groupOf('Fase2 revisar')).toBe('Fase2')
  expect(groupOf('Busca algo')).toBe('otros')
  expect(groupOf('')).toBe('otros')
})

test('barra de avance', () => {
  expect(bar(1, 2, 10)).toBe('█████░░░░░')
  expect(bar(0, 0, 4)).toBe('░░░░')
  expect(bar(9, 3, 4)).toBe('████')
})

test('agrupa en orden de aparicion', () => {
  const g = groupAgents([{ task: 'A-1 x' }, { task: 'hola' }, { task: 'A-1 y' }])
  expect(g.map(([k, v]) => [k, v.length])).toEqual([['A-1', 2], ['otros', 1]])
})

test('modo estricto: shouldBlock e isExempt', () => {
  expect(shouldBlock('Bash', 6, true, 6)).toBe(true)
  expect(shouldBlock('Bash', 5, true, 6)).toBe(false)
  expect(shouldBlock('Bash', 9, false, 6)).toBe(false)
  expect(shouldBlock('Read', 9, true, 6)).toBe(false)
  expect(shouldBlock('Agent', 9, true, 6)).toBe(false)
  expect(shouldBlock('mcp__Claude_Browser__navigate', 6, true, 6)).toBe(true)
  expect(isExempt('mcp__ccd_turn__wrap_up')).toBe(true)
  expect(isExempt('Skill')).toBe(true)
  expect(isExempt('Bash')).toBe(false)
})

test('parseStrict', () => {
  expect(parseStrict('estricto off')).toEqual({ strict: false })
  expect(parseStrict('estricto on')).toEqual({ strict: true })
  expect(parseStrict('estricto 8')).toEqual({ limit: 8 })
  expect(parseStrict('estricto x')).toBeUndefined()
})
