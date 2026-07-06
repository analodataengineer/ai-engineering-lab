# Prompt para Codex — Mejora visual, dashboard recruiter y email automático

## Contexto

Estoy trabajando en un MVP funcional de un **agente de voz conversacional para entrevistas iniciales de personal**.

La versión actual ya funciona con preguntas simples, registra la entrevista y tiene una pantalla básica para candidato y una pantalla básica para recruiter. Ahora quiero mejorar la experiencia visual y sumar funcionalidades mínimas de producto para que parezca una plataforma profesional de recruiting asistida por voz.

Usar como referencia visual estas imágenes, que voy a guardar dentro del repo:

```text
docs/design/candidate-target.png
docs/design/recruiter-target.png
```

Estas imágenes representan el objetivo visual. No copiar marcas, logos ni layouts externos exactos. Usarlas solo como dirección estética.

---

## Objetivo general

Modificar el proyecto actual para lograr:

1. Una pantalla de candidato más profesional, elegante y moderna.
2. Una pantalla recruiter tipo dashboard con métricas claras.
3. Contadores para puestos, solicitudes, entrevistas y estados.
4. Visualización simple del embudo o avance de candidatos.
5. Tabla/lista de entrevistas recientes.
6. Card de automatizaciones.
7. Envío automático de email de agradecimiento al candidato cuando finaliza la entrevista.
8. Mantener el flujo de voz existente funcionando.
9. Mantener arquitectura simple, modular, segura y portable.
10. No convertir este MVP en un ATS completo todavía.

---

## Prioridades de implementación

Implementar en este orden:

1. Revisar estructura actual del proyecto.
2. Mejorar UI candidate-facing.
3. Mejorar UI recruiter-facing.
4. Agregar endpoint o capa de agregados para dashboard recruiter.
5. Agregar persistencia mínima necesaria si falta.
6. Agregar email automático de agradecimiento.
7. Actualizar `.env.example`.
8. Actualizar README.
9. Validar con Docker Compose.
10. Reportar cambios y limitaciones.

---

## Reglas generales

### Antes de modificar

Inspeccionar la estructura actual del proyecto e identificar:

- UI web.
- Session API.
- Interview engine.
- Interview agent.
- Skills.
- Routines.
- Tools.
- Knowledge.
- Storage/migrations.
- Docker Compose.
- Variables de entorno.
- Scripts disponibles en `package.json`.

No asumir rutas. Primero revisar el repo.

### No hacer

No implementar:

- ATS completo.
- Scoring automático de candidatos.
- Decisiones automáticas de contratación.
- Aprobación o rechazo automático basado en IA.
- Autenticación compleja.
- Kubernetes.
- Multi-tenancy.
- Calendario real.
- Envío real por Gmail/Google Workspace.
- Integraciones externas innecesarias.
- Dashboard avanzado con filtros complejos.
- Sistema de permisos.
- Analytics avanzados.
- Reescritura completa del frontend.
- Migración de framework frontend salvo que sea estrictamente necesario.

### Sí hacer

Implementar:

- Mejoras visuales.
- Componentización simple.
- Tokens de diseño reutilizables.
- Dashboard recruiter básico.
- Contadores.
- Embudo visual.
- Tabla de entrevistas recientes.
- Card de automatización de email.
- Provider de email desacoplado.
- Provider `log` por defecto para desarrollo local.
- Registro del intento de envío de email.
- Idempotencia para evitar duplicar emails.
- Actualización de documentación.

---

## Principios de arquitectura

Mantener separación clara de responsabilidades:

```text
UI web
→ Session API
→ Interview Agent
→ Tools
→ Interview Engine
→ Storage
→ Email Service
```

### Reglas de capa

#### UI web

Responsable de:

- Renderizar pantalla candidato.
- Renderizar recruiter dashboard.
- Consumir APIs.
- Mostrar estados.
- Mostrar datos agregados.
- Mostrar feedback visual.

No debe:

- Contener reglas críticas de negocio.
- Escribir directo en DB.
- Exponer API keys.
- Enviar emails directamente.
- Decidir si un candidato avanza o no.

#### Session API

Responsable de:

- Crear sesiones.
- Generar tokens efímeros para voz/realtime.
- Coordinar inicio/finalización de entrevista.
- Exponer endpoints para frontend.
- Mantener secretos server-side.

No debe:

- Exponer `OPENAI_API_KEY`.
- Exponer `DEEPGRAM_API_KEY`.
- Guardar lógica visual.
- Generar decisiones de contratación.

#### Interview Agent

Responsable de:

- Conversación.
- Preguntas.
- Repreguntas.
- Llamadas a tools.
- Resumen neutral.

No debe:

- Decidir contratación.
- Hacer scoring definitivo.
- Escribir directo en DB.
- Enviar email directamente.
- Preguntar datos sensibles.

#### Interview Engine

Responsable de:

- Estado de sesión.
- Persistencia.
- Validaciones determinísticas.
- Guardado de turnos.
- Guardado de eventos.
- Guardado de resumen.
- Trigger de email al completar sesión.
- Datos agregados para dashboard, si esa responsabilidad encaja con la estructura existente.

No debe:

- Conversar.
- Usar LLM para reglas determinísticas.
- Mezclar UI con negocio.

#### Email Service

Responsable de:

- Renderizar templates.
- Validar destinatarios.
- Enviar o simular email.
- Registrar estado del envío.
- Mantener idempotencia.
- No bloquear el cierre de entrevista ante fallos.

---

## Dirección visual general

Adoptar una identidad visual premium tipo SaaS moderno para recruiting con agente de voz.

La estética debe ser similar en intención a las imágenes objetivo:

- Fondo off-white / warm gray muy claro.
- Acentos lilas, violetas y púrpuras.
- Tipografía clara, elegante y profesional.
- Texto principal en color ink / forest dark.
- Cards blancas con bordes sutiles.
- Sombras suaves.
- Bordes redondeados.
- Layout limpio, con mucho aire.
- Animaciones sutiles.
- Visual central tipo voice orb / voice wave.
- Dashboard recruiter claro y ejecutivo.
- Nada de apariencia administrativa antigua.

---

## Design tokens sugeridos

Crear o ajustar un archivo de tema, por ejemplo:

```text
interfaces/web/src/styles/theme.css
```

O usar el archivo equivalente según la estructura actual.

Tokens sugeridos:

```css
:root {
  --color-bg: #fbfaf7;
  --color-bg-soft: #f6f1ff;
  --color-surface: #ffffff;
  --color-surface-soft: #faf7ff;

  --color-text: #10231d;
  --color-text-strong: #071711;
  --color-muted: #6b7280;
  --color-muted-2: #9ca3af;
  --color-border: rgba(17, 24, 39, 0.08);

  --color-primary: #7c3aed;
  --color-primary-soft: #ede9fe;
  --color-primary-strong: #5b21b6;
  --color-primary-glow: rgba(124, 58, 237, 0.24);

  --color-success: #16a34a;
  --color-success-soft: #dcfce7;

  --color-warning: #f59e0b;
  --color-warning-soft: #fef3c7;

  --color-danger: #dc2626;
  --color-danger-soft: #fee2e2;

  --shadow-card: 0 18px 50px rgba(15, 23, 42, 0.08);
  --shadow-soft: 0 10px 30px rgba(124, 58, 237, 0.14);
  --shadow-orb: 0 32px 90px rgba(124, 58, 237, 0.28);

  --radius-card: 24px;
  --radius-md: 16px;
  --radius-sm: 10px;
  --radius-pill: 999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
}
```

Si el proyecto ya tiene tokens, no duplicar sin necesidad. Extender lo existente.

---

# Pantalla candidato

## Objetivo

Rediseñar la pantalla de entrevista para que se vea como un producto premium de entrevista por voz.

Referencia:

```text
docs/design/candidate-target.png
```

La pantalla debe sentirse:

- elegante;
- simple;
- clara;
- centrada en la voz;
- profesional;
- confiable;
- moderna.

---

## Contenido requerido

### Fondo

Usar fondo claro con gradientes suaves.

Ejemplo conceptual:

- fondo `off-white`;
- manchas radiales muy suaves en lila;
- curvas o halos tenues;
- sin exceso de decoración.

### Pill superior

Mostrar un pill superior centrado con texto:

```text
Recursos Humanos · Entrevista inicial
```

Puede incluir un ícono simple si ya hay librería de íconos. Si no, usar solo texto.

### Visual central: voice orb

Crear un componente visual central tipo:

```text
VoiceOrb
```

Debe tener:

- círculo grande;
- gradiente lila/violeta;
- glow suave;
- ondas, líneas o barras animadas;
- apariencia premium;
- estados visuales.

Estados visuales mínimos:

```text
idle
listening
speaking
processing
completed
```

Comportamiento sugerido:

- `idle`: orb estático con glow suave.
- `listening`: ondas o barras con animación más activa.
- `speaking`: wave animada con mayor intensidad.
- `processing`: pulso lento.
- `completed`: glow más calmo y estado final.

No hace falta usar Canvas. Puede resolverse con CSS.

### Status pill

Mostrar un status compacto debajo o cerca del orb.

Textos posibles:

```text
Asistente listo
Escuchando
Procesando
Entrevista finalizada
```

Debe reflejar el estado real disponible en la app actual.

### Título

Reemplazar cualquier texto tipo:

```text
Charla breve de selección
```

Por:

```text
Entrevista inicial
```

### Subtítulo

Usar:

```text
Una breve conversación guiada para conocer tu perfil profesional.
```

### Cards informativas

Mostrar dos cards pequeñas:

```text
Duración estimada
Menos de 5 minutos
```

```text
Entrevista privada
Tus datos están protegidos
```

Pueden incluir íconos si ya existen.

### CTA principal

Botón primario:

```text
Comenzar
```

Debe verse como botón pill lila/violeta con buen contraste.

Si ya existe librería de íconos, incluir ícono de micrófono. Si no existe, no agregar dependencia solo por eso.

### Acción secundaria

Agregar una acción secundaria sutil:

```text
Continuar más tarde
```

o:

```text
Permitir micrófono
```

Usar lo que tenga más sentido según el flujo existente.

---

## Pantalla durante entrevista

Durante la entrevista:

- Mantener el orb visible.
- Mostrar estado actual.
- Mostrar una indicación simple de que el usuario puede hablar.
- Mostrar controles mínimos:
  - finalizar;
  - pausar o cancelar solo si ya existe lógica.
- Evitar mostrar demasiado detalle técnico.

Si hoy se muestra JSON o historial crudo, moverlo a:

```text
Detalle técnico
```

Y dejarlo colapsado o visible solo en modo debug.

---

## Pantalla final candidato

Cuando la entrevista termina, mostrar:

Título:

```text
Entrevista finalizada
```

Texto:

```text
Gracias. La entrevista fue registrada y será revisada por el equipo de recruiting.
```

Texto opcional:

```text
Te enviaremos una confirmación por email si registraste tu correo.
```

Mostrar estado:

```text
Cerrada
```

o:

```text
Registrada
```

No usar más:

```text
Charla breve de selección
```

---

# Pantalla recruiter

## Objetivo

Rediseñar la pantalla recruiter para que se vea como un dashboard profesional y ejecutivo.

Referencia:

```text
docs/design/recruiter-target.png
```

Debe permitir al recruiter entender rápidamente:

- cuántos puestos hay;
- cuántas solicitudes existen;
- cuántas entrevistas se realizaron;
- qué casos avanzan;
- qué casos están en revisión;
- qué casos no avanzan;
- qué entrevistas recientes hay;
- si la automatización de email está activa.

---

## Header recruiter

Título principal:

```text
Panel de recruiting
```

Subtítulo:

```text
Gestiona tus puestos, entrevistas y candidatos en un solo lugar.
```

Agregar search bar:

```text
Buscar candidatos, puestos o entrevistas…
```

Agregar botón primario:

```text
Nuevo puesto
```

Este botón puede ser placeholder en esta iteración. No implementar creación real de puestos salvo que ya exista backend.

Agregar filtro simple:

```text
Últimos 30 días
```

Puede ser visual si todavía no existe lógica de filtros.

---

## KPI cards

Agregar una fila de cards con los siguientes contadores:

1. `Puestos vacantes`
2. `Solicitudes`
3. `Entrevistas`
4. `Avanzan`
5. `En revisión`
6. `No avanzan`

Cada card debe tener:

- label;
- número grande;
- ícono opcional;
- variación opcional vs período anterior solo si hay dato o si es demo;
- color visual coherente.

Estados visuales sugeridos:

- Puestos vacantes: lila.
- Solicitudes: lila suave.
- Entrevistas: violeta.
- Avanzan: verde.
- En revisión: amarillo/naranja.
- No avanzan: rojo suave.

---

## Datos del dashboard

Los contadores deben salir de datos reales si ya existen en DB.

Si todavía no existen modelos de puestos o solicitudes, crear una capa mínima de agregados con fallback demo controlado.

No hardcodear números directamente en el componente si se puede evitar.

Endpoint sugerido:

```http
GET /recruiter/dashboard
```

Si el proyecto tiene otra convención, respetar la convención existente.

Respuesta sugerida:

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

---

## Embudo de candidatos

Agregar una card principal titulada:

```text
Embudo de candidatos
```

Debe mostrar barras o visual simple con:

- Solicitudes
- Entrevistas
- En revisión
- Avanzan
- No avanzan

No usar una librería pesada de charts si no hace falta.

Puede implementarse con CSS:

- barras verticales;
- porcentajes;
- labels;
- contadores;
- gradientes lilas.

Debe verse profesional y alineado con la estética general.

---

## Tabla de entrevistas recientes

Agregar una sección:

```text
Entrevistas recientes
```

Mostrar tabla o cards con columnas:

- Candidato
- Puesto
- Estado
- Fecha
- Siguiente acción

Estados visuales:

```text
Entrevista completa
En revisión
Avanza
No avanza
```

Acciones posibles:

```text
Revisar
Evaluar
Ver detalles
```

Importante:

El sistema no debe decidir automáticamente `Avanza` o `No avanza` basado en IA.

Esos estados pueden ser:

- manuales;
- demo/seed;
- definidos por recruiter en una etapa futura.

El resumen del agente solo puede dejar:

```text
Puntos para revisión humana
```

No generar decisión de contratación automática.

---

## Card de automatizaciones

Agregar una card lateral o secundaria:

```text
Automatizaciones
```

Dentro debe aparecer:

```text
Email de agradecimiento
Activado
Se envía automáticamente al finalizar la entrevista al correo del candidato.
```

Agregar botón/link:

```text
Gestionar automatizaciones
```

Puede quedar como placeholder.

La card debe mostrar también si hubo emails enviados o fallidos si el backend ya puede calcularlo:

```text
Enviados
Fallidos
```

---

## Widgets opcionales

Agregar solo si no complica:

```text
Próximas entrevistas
```

```text
Tasa de respuesta
```

Si requiere demasiado cambio, dejar para roadmap.

Prioridad real:

1. KPIs.
2. Embudo.
3. Tabla.
4. Automatización de email.

---

# Email automático de agradecimiento

## Objetivo

Cuando una entrevista pasa a estado `completed`, el sistema debe intentar enviar un email de agradecimiento al candidato.

El envío debe ser seguro, desacoplado e idempotente.

---

## Requisitos funcionales

1. El candidato debe tener email registrado.
2. Si hoy no se pide email en la entrevista, agregar una pregunta simple y segura:

```text
¿A qué correo podemos enviarte la confirmación de la entrevista?
```

3. Validar formato de email con Zod.
4. Guardar `candidate_email` en la sesión.
5. Al completar la entrevista, crear un evento o registro de email pendiente/enviado.
6. Enviar email usando un provider desacoplado.
7. No enviar dos veces para la misma sesión.
8. Usar `session_id + template_name` como clave única.
9. Si no hay provider externo configurado, usar modo `log`.
10. No bloquear el cierre de la entrevista si falla el email.
11. Registrar estado del envío.
12. Exponer el estado en el dashboard recruiter.

---

## Abstracción de email

Crear una interfaz:

```ts
export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
};

export type SendEmailResult = {
  provider: string;
  messageId?: string;
  status: "sent" | "skipped" | "failed";
  error?: string;
};
```

---

## Providers de email

Implementar:

```text
log-email.provider.ts
```

Preparar, si no complica:

```text
smtp-email.provider.ts
resend-email.provider.ts
```

Para el MVP, `log-email.provider.ts` debe funcionar por defecto.

### Provider `log`

Debe:

- No enviar email real.
- Loguear destinatario, asunto e idempotency key.
- Devolver `status: "sent"` o `status: "skipped"` según idempotencia.
- Permitir demostrar el flujo sin configurar SMTP ni APIs externas.

### Provider SMTP o Resend

Puede quedar como stub o implementación preparada si no requiere agregar complejidad.

No agregar secretos reales.

---

## Variables de entorno de email

Agregar a `.env.example`:

```env
EMAIL_PROVIDER=log
EMAIL_FROM="Recruiting <no-reply@example.com>"

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=

RESEND_API_KEY=
```

No subir secretos reales.

---

## Template de email

Crear template separado, por ejemplo:

```text
services/email/templates/thank-you-email.ts
```

O en la carpeta equivalente según estructura actual.

Asunto:

```text
Gracias por completar tu entrevista inicial
```

Texto plano:

```text
Hola {{candidateName}},

Gracias por completar la entrevista inicial.

Tu información fue registrada correctamente y será revisada por el equipo de recruiting.

Este mensaje no representa una decisión final del proceso.

Saludos,
Equipo de Recruiting
```

Si no hay nombre:

```text
Hola,
```

HTML simple:

```html
<p>Hola {{candidateName}},</p>

<p>Gracias por completar la entrevista inicial.</p>

<p>Tu información fue registrada correctamente y será revisada por el equipo de recruiting.</p>

<p><strong>Este mensaje no representa una decisión final del proceso.</strong></p>

<p>Saludos,<br />Equipo de Recruiting</p>
```

---

## Persistencia para email

Si ya existen tablas, extender sin romper.

Agregar campos mínimos si faltan.

En `interview_sessions`:

```text
candidate_email
candidate_display_name
target_role
status
completed_at
```

Agregar tabla si no existe:

```text
interview_email_events
```

Campos sugeridos:

```text
id
session_id
template_name
recipient_email
provider
status
idempotency_key
message_id
error_message
created_at
sent_at
```

Agregar índice único:

```sql
UNIQUE(session_id, template_name)
```

O equivalente para evitar duplicados.

---

## Idempotencia de email

La clave de idempotencia debe basarse en:

```text
session_id + template_name
```

Template inicial:

```text
thank_you_email
```

Si el email ya fue enviado o registrado como enviado para esa sesión, no reenviar.

Registrar estado `skipped` o devolver evento existente según convención del proyecto.

---

## Fallos de email

Si el provider falla:

- registrar error;
- mantener entrevista como finalizada;
- no romper flujo del candidato;
- mostrar en logs;
- reflejar fallos en dashboard si corresponde.

El email es una automatización secundaria, no debe bloquear el cierre de la entrevista.

---

# Pregunta de email dentro de la entrevista

Si todavía no se captura email del candidato, ajustar el flujo de entrevista.

Agregar pregunta segura:

```text
¿A qué correo podemos enviarte la confirmación de la entrevista?
```

Reglas:

- Validar formato de email.
- Si el candidato no quiere compartirlo, continuar sin bloquear.
- Si no hay email, no intentar enviar.
- No insistir más de una vez.
- Guardar email únicamente si parece válido.

---

# Skills, routines y knowledge

Si el proyecto tiene carpetas de skills/routines/knowledge, actualizarlas.

## Routine

Actualizar la rutina para incluir paso opcional de email:

```text
greeting
consent
candidate_name
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

El paso `candidate_email` puede ser opcional.

## Knowledge

Actualizar question bank si existe:

```json
{
  "id": "candidate_email",
  "text": "¿A qué correo podemos enviarte la confirmación de la entrevista?",
  "required": false,
  "sensitive": false
}
```

## Skills

Actualizar o crear skill de cierre:

```text
closing.skill.md
```

Debe indicar que al finalizar:

- se agradece al candidato;
- se aclara que no es una decisión final;
- se registra la sesión;
- se informa que puede enviarse confirmación por email si compartió su correo.

---

# Tools del agente

Si existe estructura de tools, agregar o ajustar:

```text
record_interview_turn
get_next_question
mark_consent
save_candidate_email
complete_interview
create_interview_summary
```

La tool `save_candidate_email` debe:

- recibir email;
- validar formato;
- llamar al engine/API;
- no guardar si es inválido.

La tool `complete_interview` debe:

- cerrar la sesión;
- generar o persistir resumen;
- disparar flujo de email desde backend/engine;
- no enviar email directamente desde el agente.

---

# Guardrails

Mantener o agregar validaciones para:

- No pedir datos sensibles.
- No tomar decisiones de contratación.
- No generar puntajes definitivos.
- Mantener idioma español.
- Hacer una pregunta por vez.
- No alargar la entrevista innecesariamente.
- Redirigir conversación si el usuario comparte datos sensibles.

Ejemplo de redirección:

```text
Gracias. Para esta entrevista vamos a enfocarnos solo en tu experiencia laboral, herramientas, disponibilidad y expectativas profesionales.
```

---

# Estados de entrevista

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

Importante:

- `completed`: entrevista terminada por el candidato/agente.
- `in_review`: pendiente de revisión humana.
- `advancing`: estado manual o demo; no generado automáticamente por IA.
- `not_advancing`: estado manual o demo; no generado automáticamente por IA.

---

# Endpoints sugeridos

Respetar estructura existente. Si no hay endpoint equivalente, agregar:

```http
GET /health
POST /sessions
POST /sessions/:sessionId/realtime-token
POST /sessions/:sessionId/end
GET /sessions/:sessionId
GET /recruiter/dashboard
```

Para email, no exponer endpoint público salvo que sea necesario.

El envío debería dispararse internamente al completar la sesión.

---

# Componentización frontend

Crear componentes reutilizables según el framework actual.

Si el proyecto usa React:

```text
interfaces/web/src/components/CandidateHero.tsx
interfaces/web/src/components/VoiceOrb.tsx
interfaces/web/src/components/StatusPill.tsx
interfaces/web/src/components/MetricCard.tsx
interfaces/web/src/components/FunnelChart.tsx
interfaces/web/src/components/RecruiterTable.tsx
interfaces/web/src/components/AutomationCard.tsx
interfaces/web/src/components/Layout.tsx
```

Si el proyecto usa vanilla TypeScript, usar `.ts` y funciones que devuelvan HTML string o DOM nodes.

No migrar a React solo por estética.

---

# Estilos frontend

Crear o reorganizar estilos:

```text
interfaces/web/src/styles/theme.css
interfaces/web/src/styles/candidate.css
interfaces/web/src/styles/recruiter.css
```

O equivalente según estructura actual.

Usar animaciones suaves:

- glow del voice orb;
- wave animation;
- button hover;
- card hover muy sutil.

No abusar de animaciones.

Debe verse profesional y liviano.

---

# Dashboard data fallback

Si faltan datos reales para `Puestos vacantes` y `Solicitudes`, crear fallback demo controlado.

Ejemplo:

```ts
const demoDashboardFallback = {
  openPositions: 3,
  applications: interviewsCount + 12,
}
```

Pero encapsularlo en backend, no en UI.

Marcar claramente en código que es fallback para MVP.

No mezclar datos demo de forma confusa si existen datos reales.

---

# Docker

Mantener Docker Compose funcionando.

Si se agregan variables nuevas:

- actualizar `.env.example`;
- revisar `docker-compose.yml`;
- no hardcodear secretos.

No agregar un servicio nuevo solo para email si puede estar dentro del backend/engine actual.

Validar:

```bash
docker compose down
docker compose up -d --build
docker compose ps
```

---

# README

Actualizar README con:

1. Cómo correr local.
2. Cómo correr con Docker Compose.
3. Cómo abrir pantalla candidato.
4. Cómo abrir dashboard recruiter.
5. Cómo configurar email.
6. Cómo funciona `EMAIL_PROVIDER=log`.
7. Variables de entorno nuevas.
8. Limitaciones actuales.
9. Roadmap recomendado.

---

# Criterios de aceptación

La modificación está completa si:

1. La pantalla del candidato se ve alineada con `docs/design/candidate-target.png`.
2. La pantalla recruiter se ve alineada con `docs/design/recruiter-target.png`.
3. La pantalla candidato no usa más `Charla breve de selección`.
4. El dashboard muestra:
   - Puestos vacantes.
   - Solicitudes.
   - Entrevistas.
   - Avanzan.
   - En revisión.
   - No avanzan.
5. El dashboard tiene:
   - embudo o estado de casos;
   - tabla de entrevistas recientes;
   - card de automatización de email.
6. Al finalizar entrevista:
   - se guarda la sesión;
   - se genera resumen;
   - se intenta enviar email de agradecimiento;
   - se registra el resultado del envío.
7. Si no hay proveedor real de email, el sistema funciona con `EMAIL_PROVIDER=log`.
8. No se expone ninguna API key en frontend.
9. Docker Compose sigue levantando el sistema.
10. No se rompe el flujo de voz que ya funciona.
11. El README queda actualizado.
12. No se implementa scoring ni decisión automática de contratación.

---

# Validaciones a ejecutar

Después de implementar:

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

Validar manualmente:

1. Abrir pantalla candidato.
2. Iniciar entrevista.
3. Confirmar que el orb cambia de estado.
4. Responder preguntas.
5. Confirmar que se pregunta email si corresponde.
6. Finalizar entrevista.
7. Confirmar que aparece pantalla final elegante.
8. Confirmar que se guarda la entrevista.
9. Confirmar que se genera resumen.
10. Confirmar que se registra o simula email de agradecimiento.
11. Abrir recruiter dashboard.
12. Confirmar que aparece la entrevista.
13. Confirmar KPIs.
14. Confirmar embudo.
15. Confirmar card de automatización.
16. Confirmar que no hay errores críticos en logs.

Si existen scripts:

```bash
npm run lint
npm test
npm run build
```

No inventar scripts si no existen. Revisar `package.json` primero.

---

# Entrega final esperada de Codex

Al finalizar, reportar:

- Archivos modificados.
- Componentes nuevos.
- Endpoints nuevos.
- Migraciones nuevas.
- Variables de entorno nuevas.
- Cómo probar la pantalla candidato.
- Cómo probar recruiter dashboard.
- Cómo probar email automático.
- Limitaciones pendientes.
- Próximos pasos recomendados.

---

# Roadmap fuera de alcance

Dejar como próximos pasos, no implementar ahora:

1. Autenticación recruiter.
2. Gestión real de puestos.
3. Gestión real de solicitudes.
4. Revisión manual con cambio de estado.
5. Scheduling de entrevistas.
6. Integración real con Gmail/SendGrid/Resend.
7. Panel de detalle por candidato.
8. Exportación de reportes.
9. Observabilidad avanzada.
10. Deploy Kubernetes.
11. Multi-tenant.
12. RBAC.
13. Auditoría avanzada.
14. Integración con ATS externo.

---

# Restricción crítica final

No convertir este MVP en un ATS completo.

La mejora actual es:

```text
UI profesional
+ dashboard recruiter básico
+ email automático de agradecimiento
+ mantener arquitectura limpia
+ no romper el agente de voz existente
```

Todo lo demás debe quedar como roadmap.
