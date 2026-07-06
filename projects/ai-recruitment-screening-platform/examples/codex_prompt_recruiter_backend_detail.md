# Prompt para Codex — Conectar recruiter dashboard a backend real y recuperar detalle de entrevistas

## Contexto

El proyecto actual es un MVP funcional de un **agente de voz conversacional para entrevistas iniciales de personal**.

La pantalla del candidato ya quedó integrada con una visual profesional y el flujo de preguntas simples funciona. Ahora necesito corregir la parte recruiter y la captura/persistencia de la información recolectada del entrevistado.

## Problemas actuales

1. La pantalla recruiter quedó visualmente bien, pero no está correctamente conectada a un backend real.
2. El acceso por password ya no funciona correctamente o quedó como lógica débil de frontend.
3. Antes podía ver la información recolectada del entrevistado y ahora no aparece.
4. La entrevista debe capturar nombre y apellido de la persona.
5. El email del candidato debe quedar asociado a la sesión.
6. En el futuro, la entrevista podría dispararse desde un link enviado por email al candidato, por eso conviene dejar preparado el modelo para token/link de entrevista.

## Objetivo general

Implementar una corrección de producto/backend para:

- Conectar el recruiter dashboard a datos reales.
- Permitir ver el detalle de cada entrevista.
- Persistir nombre, apellido, email, puesto/interés, respuestas, transcripción y resumen.
- Corregir el acceso recruiter sin usar password hardcodeada en frontend.
- Mantener el flujo de voz y la UI candidate-facing que ya funcionan.
- Mantener arquitectura simple, modular, segura y extensible.
- No convertir este MVP en un ATS completo.

---

# Principios de arquitectura

Mantener separación clara de responsabilidades:

```text
Candidate UI
→ Session API
→ Interview Agent
→ Tools
→ Interview Engine
→ Storage
→ Recruiter Dashboard
→ Email Service
```

## Reglas de capa

### UI candidate-facing

Responsable de:

- Renderizar experiencia visual del candidato.
- Iniciar/finalizar entrevista.
- Mostrar estados.
- Mostrar pantalla final.

No debe:

- Persistir directo en DB.
- Exponer API keys.
- Enviar emails directamente.
- Tomar decisiones de negocio.

### UI recruiter-facing

Responsable de:

- Renderizar dashboard recruiter.
- Consumir datos reales del backend.
- Mostrar KPIs.
- Mostrar entrevistas recientes.
- Permitir abrir detalle de entrevista.
- Mostrar resumen, transcript y estado de automatizaciones.

No debe:

- Calcular datos críticos si el backend puede entregarlos.
- Usar mocks como si fueran datos reales.
- Guardar password hardcodeada.
- Decidir si una persona avanza o no.

### Session API

Responsable de:

- Crear sesiones.
- Generar tokens efímeros para voz/realtime.
- Coordinar inicio/finalización.
- Exponer endpoints al frontend.
- Mantener secretos server-side.

### Interview Agent

Responsable de:

- Conversación.
- Preguntas.
- Repreguntas.
- Llamadas a tools.
- Resumen neutral.

No debe:

- Escribir directo en DB.
- Enviar emails directamente.
- Decidir contratación.
- Hacer scoring definitivo.
- Preguntar datos sensibles.

### Interview Engine

Responsable de:

- Estado de sesión.
- Persistencia.
- Validaciones determinísticas.
- Guardado de turnos.
- Guardado de eventos.
- Guardado de resumen.
- Trigger de email al completar sesión.
- Datos agregados para recruiter dashboard si encaja con la estructura actual.

### Email Service

Responsable de:

- Renderizar templates.
- Validar destinatarios.
- Enviar o simular email.
- Registrar estado.
- Mantener idempotencia.
- No bloquear el cierre de entrevista ante fallos.

---

# Reglas generales de implementación

Antes de modificar:

- Inspeccionar estructura actual del proyecto.
- Identificar frontend web, session-api, interview-engine, agente, tools, storage/migrations y docker-compose.
- Revisar rutas reales existentes.
- Revisar nombres reales de tablas.
- Revisar si hay migraciones pendientes.
- Revisar si hay scripts en `package.json`.

No hacer:

- No reescribir toda la app.
- No romper la UI candidate-facing que ya quedó bien.
- No romper el flujo de voz.
- No implementar autenticación compleja.
- No implementar scoring automático.
- No implementar decisión automática de contratación.
- No implementar ATS completo.
- No implementar gestión completa de puestos.
- No implementar calendario.
- No implementar Kubernetes.
- No hardcodear secretos.
- No inventar rutas si existe una convención clara en el proyecto.

Sí hacer:

- Aplicar cambios mínimos y coherentes.
- Conectar dashboard a backend real.
- Persistir datos del entrevistado.
- Recuperar detalle de entrevistas.
- Corregir acceso recruiter.
- Dejar preparado el modelo para links/token de entrevista.
- Actualizar README y `.env.example`.
- Mantener Docker Compose funcionando.

---

# Parte 1 — Captura de datos del entrevistado

La entrevista debe capturar explícitamente:

```text
candidate_first_name
candidate_last_name
candidate_email
target_role
```

Si actualmente solo se guarda `candidate_display_name`, mantenerlo por compatibilidad.

Derivar `candidate_display_name` así:

```text
candidate_display_name = candidate_first_name + " " + candidate_last_name
```

Si el candidato solo da un nombre, guardar lo que haya y dejar apellido como `null`.

## Preguntas requeridas

Agregar o ajustar el flujo para preguntar de forma natural:

```text
Para comenzar, ¿podés decirme tu nombre y apellido?
```

Luego:

```text
¿A qué correo podemos enviarte la confirmación de la entrevista?
```

Luego continuar con:

```text
¿Qué puesto o área te interesa?
```

O respetar la pregunta actual equivalente si ya existe.

## Reglas para email

- Validar formato de email con Zod.
- Si el candidato no quiere compartir email, continuar sin bloquear.
- No insistir más de una vez.
- Guardar email únicamente si parece válido.
- Asociar el email a la sesión.

## Reglas de seguridad

No preguntar:

- edad;
- estado civil;
- salud;
- nacionalidad;
- religión;
- política;
- embarazo;
- familia;
- discapacidad;
- origen étnico;
- otros datos sensibles o discriminatorios.

---

# Parte 2 — Persistencia

Revisar migraciones existentes.

Si faltan campos en `interview_sessions`, agregar migración segura.

Migración sugerida, adaptar a la estructura real:

```sql
ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS candidate_first_name TEXT,
ADD COLUMN IF NOT EXISTS candidate_last_name TEXT,
ADD COLUMN IF NOT EXISTS candidate_email TEXT,
ADD COLUMN IF NOT EXISTS candidate_display_name TEXT,
ADD COLUMN IF NOT EXISTS target_role TEXT,
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
```

Si ya existen campos equivalentes, reutilizarlos.

## Datos que deben persistirse

Asegurar que se pueda recuperar:

```text
session_id
candidate_first_name
candidate_last_name
candidate_email
candidate_display_name
target_role
status
created_at
started_at
completed_at
summary
turns/transcript
email events
```

La información recolectada no debe vivir solo en memoria ni solo en el frontend.

---

# Parte 3 — Token/link de entrevista preparado para futuro

Dejar preparado el modelo para que una entrevista pueda tener token/link.

Si no existe, agregar:

```sql
ALTER TABLE interview_sessions
ADD COLUMN IF NOT EXISTS interview_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interview_sessions_interview_token
ON interview_sessions(interview_token)
WHERE interview_token IS NOT NULL;
```

Esto permite que en el futuro el candidato reciba un link como:

```text
/interview/:token
```

Para este ajuste no hace falta implementar un flujo completo de invitaciones si no existe.

Pero sí dejar claro en el modelo:

- si una entrevista nace desde un email, el email ya puede estar preasociado;
- aun así el agente debe confirmar nombre y apellido durante la entrevista;
- no duplicar sesiones si el token ya existe.

---

# Parte 4 — Tools del agente

Si existe estructura de tools, agregar o ajustar tools para:

```text
save_candidate_identity
save_candidate_email
record_interview_turn
complete_interview
create_interview_summary
```

## Tool `save_candidate_identity`

Debe recibir:

```ts
{
  sessionId: string;
  firstName?: string;
  lastName?: string;
  displayName?: string;
}
```

Responsabilidad:

- Validar payload.
- Guardar nombre/apellido/displayName llamando al engine/API.
- No escribir directo en DB desde el agente.

## Tool `save_candidate_email`

Debe recibir:

```ts
{
  sessionId: string;
  email: string;
}
```

Responsabilidad:

- Validar email con Zod.
- Guardar email llamando al engine/API.
- Si el email es inválido, devolver error controlado.
- No bloquear toda la entrevista.

## Tool `complete_interview`

Debe:

- cerrar la sesión;
- persistir estado final;
- generar o guardar resumen;
- disparar flujo de email desde backend/engine;
- no enviar email directamente desde el agente.

---

# Parte 5 — Dashboard recruiter conectado a backend real

La pantalla recruiter debe dejar de depender de datos mockeados dentro del componente.

Crear o corregir endpoint:

```http
GET /recruiter/dashboard
```

Si el proyecto ya tiene una convención distinta de rutas, respetar la convención existente.

## Respuesta esperada

```ts
export type RecruiterDashboard = {
  counters: {
    openPositions: number;
    applications: number;
    interviews: number;
    advancing: number;
    inReview: number;
    notAdvancing: number;
  };
  funnel: Array<{
    label: string;
    count: number;
    percentage: number;
  }>;
  recentInterviews: Array<{
    id: string;
    candidateName: string | null;
    candidateEmail: string | null;
    positionTitle: string | null;
    status: "completed" | "in_review" | "advancing" | "not_advancing";
    createdAt: string;
    completedAt: string | null;
    nextAction: string;
  }>;
  automations: {
    thankYouEmail: {
      enabled: boolean;
      sentCount: number;
      failedCount: number;
    };
  };
};
```

## Cálculo de contadores

Para contadores que todavía no tengan modelo real:

- `interviews`: contar sesiones reales.
- `inReview`: contar sesiones `completed` o `in_review`.
- `advancing`: contar solo si existe estado manual; si no, `0`.
- `notAdvancing`: contar solo si existe estado manual; si no, `0`.
- `applications`: si no hay tabla real, usar cantidad de sesiones como fallback.
- `openPositions`: si no hay tabla real, usar `0` o seed demo claramente aislado.

No hardcodear números en frontend.

Si se usa fallback demo:

- encapsularlo en backend;
- dejar comentario claro;
- no mezclarlo con datos reales de forma confusa.

---

# Parte 6 — Detalle de entrevista para recruiter

Agregar endpoint:

```http
GET /recruiter/interviews/:sessionId
```

Debe devolver:

```ts
export type RecruiterInterviewDetail = {
  session: {
    id: string;
    status: string;
    candidateFirstName: string | null;
    candidateLastName: string | null;
    candidateDisplayName: string | null;
    candidateEmail: string | null;
    targetRole: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  summary: {
    profileSummary: string | null;
    experienceSummary: string | null;
    toolsSummary: string | null;
    availabilitySummary: string | null;
    humanReviewNotes: string | null;
  } | null;
  turns: Array<{
    id: string;
    turnIndex: number;
    speaker: "agent" | "candidate" | "system";
    content: string;
    createdAt: string;
  }>;
  emailEvents: Array<{
    id: string;
    templateName: string;
    recipientEmail: string;
    provider: string;
    status: string;
    messageId: string | null;
    errorMessage: string | null;
    createdAt: string;
    sentAt: string | null;
  }>;
};
```

## UI de detalle

La pantalla recruiter debe permitir abrir cada entrevista reciente y ver:

- nombre y apellido;
- email;
- puesto/interés;
- estado;
- resumen;
- información recolectada;
- transcript/turnos;
- estado del email de agradecimiento.

Puede ser una ruta simple:

```text
/recruiter/interviews/:sessionId
```

O un panel lateral/modal si la estructura actual lo facilita.

Priorizar ruta simple si es más mantenible.

---

# Parte 7 — Acceso recruiter

Eliminar password hardcodeada en frontend.

Para MVP local, implementar una opción simple controlada por backend.

## Configuración recomendada

Permitir dashboard sin auth cuando:

```env
RECRUITER_AUTH_ENABLED=false
```

Proteger endpoints recruiter cuando:

```env
RECRUITER_AUTH_ENABLED=true
RECRUITER_ACCESS_TOKEN=change-me
```

Si `RECRUITER_AUTH_ENABLED=true`, los endpoints recruiter deben exigir header:

```http
Authorization: Bearer <RECRUITER_ACCESS_TOKEN>
```

## Variables de entorno

Agregar a `.env.example`:

```env
RECRUITER_AUTH_ENABLED=false
RECRUITER_ACCESS_TOKEN=
```

## Frontend

En frontend:

- no usar password fija escrita en código;
- si auth está deshabilitada, cargar dashboard normal;
- si backend devuelve `401`, mostrar pantalla simple para ingresar token;
- guardar token solo en memoria o localStorage para MVP;
- enviar token en header `Authorization`;
- no implementar login con usuarios todavía.

---

# Parte 8 — UI recruiter conectada

Actualizar dashboard para leer datos reales desde:

```http
GET /recruiter/dashboard
```

La tabla de entrevistas recientes debe usar datos reales.

Cada fila debe tener acción:

```text
Ver detalle
```

Al hacer click, abrir detalle real.

## Estado vacío

Si no hay datos, mostrar estado vacío profesional:

```text
Todavía no hay entrevistas registradas.
```

No mostrar datos inventados como si fueran reales.

---

# Parte 9 — UI detalle entrevista

Crear pantalla o componente:

```text
RecruiterInterviewDetail
```

Debe mostrar secciones claras.

## Datos del candidato

Mostrar:

```text
Nombre y apellido
Email
Puesto/interés
Estado
Fecha de inicio
Fecha de finalización
```

## Resumen

Mostrar:

```text
Perfil general
Experiencia mencionada
Herramientas o tareas mencionadas
Disponibilidad
Puntos para revisión humana
```

Si no hay resumen:

```text
Todavía no hay resumen disponible para esta entrevista.
```

## Transcripción

Mostrar turnos ordenados:

```text
Agente
Candidato
Sistema
```

No mostrar JSON crudo salvo en sección debug.

## Automatizaciones

Mostrar:

```text
Email de agradecimiento
Estado: enviado / simulado / fallido / omitido
Proveedor
Fecha de envío
Error si existiera
```

---

# Parte 10 — Email de agradecimiento

Mantener o corregir el flujo:

- se dispara al completar entrevista;
- usa `candidate_email` si existe;
- no se envía duplicado;
- registra evento;
- no bloquea cierre de entrevista.

Si no hay email:

- no intentar enviar;
- registrar omitido si el modelo actual lo permite;
- o simplemente no crear evento, según convención actual.

El dashboard debe mostrar conteo real de emails enviados/fallidos si existe tabla `interview_email_events`.

---

# Parte 11 — Estados de entrevista

Estados sugeridos:

```text
created
consent_pending
in_progress
completed
in_review
advancing
not_advancing
cancelled
failed
```

Si el proyecto actual tiene menos estados, no migrar todo de golpe salvo que sea necesario.

Mantener compatibilidad.

## Significado

- `completed`: entrevista terminada por candidato/agente.
- `in_review`: pendiente de revisión humana.
- `advancing`: estado manual o demo; no generado automáticamente por IA.
- `not_advancing`: estado manual o demo; no generado automáticamente por IA.
- `cancelled`: entrevista cancelada.
- `failed`: error técnico.

No generar `advancing` o `not_advancing` automáticamente desde el agente.

---

# Parte 12 — Skills, routines y knowledge

Si el proyecto tiene carpetas de skills/routines/knowledge, actualizarlas.

## Routine

Actualizar rutina para incluir:

```text
greeting
consent
candidate_identity
candidate_email
target_role
relevant_experience
tools_or_tasks
behavioral_question
availability
candidate_questions
closing
summary
thank_you_email
```

`candidate_email` puede ser opcional.

## Knowledge

Actualizar question bank si existe:

```json
{
  "id": "candidate_identity",
  "text": "Para comenzar, ¿podés decirme tu nombre y apellido?",
  "required": true,
  "sensitive": false
}
```

```json
{
  "id": "candidate_email",
  "text": "¿A qué correo podemos enviarte la confirmación de la entrevista?",
  "required": false,
  "sensitive": false
}
```

## Skills

Actualizar skill de cierre si existe:

```text
closing.skill.md
```

Debe indicar que al finalizar:

- se agradece al candidato;
- se aclara que no es una decisión final;
- se registra la sesión;
- se informa que puede enviarse confirmación por email si compartió su correo.

---

# Parte 13 — Endpoints sugeridos

Respetar estructura existente. Si no hay endpoint equivalente, agregar:

```http
GET /health
POST /sessions
POST /sessions/:sessionId/realtime-token
POST /sessions/:sessionId/end
GET /sessions/:sessionId
GET /recruiter/dashboard
GET /recruiter/interviews/:sessionId
```

Para email, no exponer endpoint público salvo que sea necesario.

El envío debería dispararse internamente al completar la sesión.

---

# Parte 14 — Validación de datos

Usar Zod o la librería de validación ya existente.

Validar:

- `sessionId`;
- `candidate_first_name`;
- `candidate_last_name`;
- `candidate_email`;
- `target_role`;
- statuses;
- payloads de tools;
- respuestas de endpoints recruiter.

No confiar en datos del frontend.

---

# Parte 15 — Seguridad mínima

No exponer:

- `OPENAI_API_KEY`;
- `DEEPGRAM_API_KEY`;
- `RECRUITER_ACCESS_TOKEN`;
- secrets de email;
- credenciales de base.

No guardar tokens sensibles en código.

No loguear API keys.

No loguear datos personales innecesarios en logs productivos.

Para local está permitido loguear de forma acotada información útil para debug, pero evitar exceso.

---

# Parte 16 — Docker

Mantener Docker Compose funcionando.

Si se agregan variables nuevas:

- actualizar `.env.example`;
- revisar `docker-compose.yml`;
- no hardcodear secretos.

Validar:

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

---

# Parte 17 — README

Actualizar README con:

1. Cómo correr local.
2. Cómo correr con Docker Compose.
3. Cómo abrir pantalla candidato.
4. Cómo abrir dashboard recruiter.
5. Cómo abrir detalle de entrevista.
6. Cómo funciona `RECRUITER_AUTH_ENABLED`.
7. Cómo configurar `RECRUITER_ACCESS_TOKEN`.
8. Cómo se captura nombre/apellido/email.
9. Cómo se prueba email automático.
10. Limitaciones actuales.
11. Roadmap recomendado.

---

# Criterios de aceptación

La tarea está completa si:

1. La UI candidate-facing sigue funcionando.
2. La entrevista pregunta nombre y apellido.
3. La entrevista captura email si el candidato lo da.
4. La sesión guarda nombre, apellido, email y puesto/interés.
5. El dashboard recruiter consume backend real.
6. Los contadores ya no dependen de mocks frontend.
7. La tabla recruiter lista entrevistas reales.
8. Se puede abrir una entrevista y ver la información recolectada.
9. Se puede ver resumen y transcript.
10. Se puede ver estado del email de agradecimiento.
11. No hay password hardcodeada en frontend.
12. El acceso recruiter queda controlado por backend o deshabilitado explícitamente para local.
13. Docker Compose sigue funcionando.
14. No se rompe el flujo de voz.
15. No se agregan decisiones automáticas de contratación.
16. No se implementa ATS completo.
17. El README queda actualizado.

---

# Validaciones a ejecutar

Ejecutar:

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

Revisar logs:

```bash
docker compose logs -f session-api
```

Si existe engine separado:

```bash
docker compose logs -f interview-engine
```

Si existen scripts:

```bash
npm run build
npm run lint
npm test
```

No inventar scripts si no existen. Revisar `package.json` primero.

---

# Validación manual

Validar manualmente:

1. Abrir pantalla candidato.
2. Iniciar entrevista.
3. Responder nombre y apellido.
4. Responder email.
5. Responder puesto/interés.
6. Completar entrevista.
7. Confirmar pantalla final.
8. Confirmar que el email se envió o simuló.
9. Abrir recruiter dashboard.
10. Confirmar que aparece la entrevista real.
11. Confirmar KPIs.
12. Abrir detalle.
13. Confirmar que se ve:
    - nombre;
    - apellido;
    - email;
    - puesto/interés;
    - resumen;
    - turnos/transcripción;
    - email event.
14. Confirmar que no aparece password hardcodeada.
15. Confirmar que si `RECRUITER_AUTH_ENABLED=false`, el dashboard abre en local.
16. Confirmar que si `RECRUITER_AUTH_ENABLED=true`, sin token devuelve `401`.
17. Confirmar que no hay errores críticos en logs.

---

# Entrega final esperada de Codex

Al finalizar, reportar:

- Archivos modificados.
- Migraciones agregadas.
- Endpoints agregados/corregidos.
- Cambios en UI recruiter.
- Cambios en detalle de entrevista.
- Cambios en captura de identidad del candidato.
- Cambios en auth recruiter.
- Cambios en email automático.
- Variables de entorno nuevas.
- Cómo probar flujo completo.
- Limitaciones pendientes.
- Próximos pasos recomendados.

---

# Roadmap fuera de alcance

No implementar ahora. Dejar como próximos pasos:

1. Autenticación real recruiter.
2. Gestión real de puestos.
3. Gestión real de solicitudes.
4. Cambio manual de estado por recruiter.
5. Scheduling de entrevistas.
6. Invitaciones por email con link real.
7. Panel de detalle más avanzado.
8. Exportación de reportes.
9. Integración con ATS externo.
10. Observabilidad avanzada.
11. Deploy Kubernetes.
12. Multi-tenant.
13. RBAC.
14. Auditoría avanzada.

---

# Restricción crítica final

No convertir este MVP en un ATS completo.

La mejora actual es:

```text
Backend real para recruiter dashboard
+ detalle real de entrevistas
+ captura de nombre/apellido/email
+ corrección de acceso recruiter
+ preparación para links de entrevista
+ mantener UI candidate-facing y agente de voz funcionando
```

Todo lo demás debe quedar como roadmap.
