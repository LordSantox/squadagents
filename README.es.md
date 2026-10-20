# squadagents

[English](README.md) | **Español**

Mod para Claude Code. Elige haiku/sonnet/opus para cada subagente con reglas locales (0 tokens) y muestra los agentes en vivo: modelo, tarea, tokens, costo, tiempo y log (`/squad`).

## Instalar

En una sesión de Claude Code:

```
/plugin install squadagents --marketplace LordSantox/squadagents
```

Responde `y` para añadir el marketplace y elige el alcance (usuario o proyecto).

Desde una terminal:

```bash
claude plugin install squadagents --marketplace LordSantox/squadagents
```

### Instalarlo pidiéndoselo a Claude

Pega esto en Claude Code:

> Instala el mod de https://github.com/LordSantox/squadagents siguiendo las instrucciones de su README.

## Qué hace

- **Ruteo de modelo**: si lanzas un subagente sin `model`, el mod lo elige por reglas (`hooks/router.ts`):
  Plan→opus · Explore→haiku (sonnet si verifica código) · validar/investigar/decidir/planificar→opus · tests/diagnóstico/implementar→sonnet · buscar/leer corto→haiku · resto→sonnet.
- Un `model` explícito solo se respeta si es igual o más barato que el de la regla.
- **Panel `/squad`**: subagentes en vivo con modelo, tarea, tokens, costo estimado, ahorro vs opus y log.
- **Aviso de racha**: si el agente principal hace muchas acciones directas seguidas (navegador >3, Bash/Edit/Write >5) añade una nota sugiriendo delegar.

## Desinstalar

```
/plugin uninstall squadagents
```

## Licencia

MIT
