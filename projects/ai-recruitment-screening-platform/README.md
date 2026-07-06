# Voice Interview Agent

MVP portable de un agente conversacional por voz para entrevistas iniciales de personal.

El proyecto separa interfaz, API de sesión, engine determinístico, agente, skills, routines, knowledge base y storage. El agente no aprueba, rechaza ni puntúa candidatos; registra una entrevista breve y produce información neutral para revisión humana.

## Arquitectura

- `interfaces/web`: experiencia web para candidato y recruiter.
- `services/session-api`: sesiones, tokens efímeros de voz, coordinación de proveedores y acceso recruiter.
- `engines/interview`: estado determinístico, consentimiento, turnos, eventos y resúmenes.
- `agents/interview-agent`: definición del agente, tools, schemas y guardrails.
- `skills/interview`: capacidades reutilizables documentadas.
- `routines/interview`: flujo `default-interview`.
- `knowledge/interview`: preguntas, perfil general y política.
- `storage/migrations`: schema PostgreSQL inicial.
- `mcps/speech`: boundaries para OpenAI y Deepgram.

## Requisitos

- Docker y Docker Compose.
- `OPENAI_API_KEY` para voz con OpenAI Realtime.
- `RECRUITER_AUTH_ENABLED=false` para desarrollo local sin auth recruiter.
- `RECRUITER_ACCESS_TOKEN` para proteger la pantalla recruiter cuando `RECRUITER_AUTH_ENABLED=true`.
- `EMAIL_PROVIDER=log` para simular email de agradecimiento sin proveedor externo.

## Correr local

1. Crear un `.env` desde `.env.example`.
2. Completar `OPENAI_API_KEY`.
3. Dejar `RECRUITER_AUTH_ENABLED=false` para desarrollo local o definir `RECRUITER_AUTH_ENABLED=true` y un `RECRUITER_ACCESS_TOKEN`.
4. Dejar `EMAIL_PROVIDER=log` para desarrollo local.
5. Ejecutar:

```bash
docker compose up --build
```

Servicios:

- Candidato: `http://localhost:5173`
- Recruiter: `http://localhost:5173/recruiter`
- Session API: `http://localhost:3001`
- Interview Engine: `http://localhost:3002`

## Flujo candidato

1. El candidato abre `http://localhost:5173`.
2. La entrevista intenta iniciar automáticamente.
3. El navegador pide permiso de micrófono.
4. El agente saluda, aclara que la charla no debería tomar más de 5 minutos y pide consentimiento.
5. El agente pregunta nombre y apellido.
6. El agente puede pedir un correo opcional para enviar confirmación.
7. El agente pregunta puesto o área de interés y continúa el flujo laboral.
8. Luego de la última pregunta, el agente cierra la conversación.
9. La sesión queda guardada para revisión recruiter.

La pantalla candidato no muestra transcripción ni resumen.

## Flujo recruiter

1. Abrir `http://localhost:5173/recruiter`.
2. Ingresar el valor de `RECRUITER_ACCESS_TOKEN`.
3. Revisar KPIs, embudo, entrevistas recientes y automatización de email.
4. Abrir `Ver detalle` en una entrevista para ver identidad, email, puesto, resumen, transcript y eventos de email.

Si `RECRUITER_AUTH_ENABLED=false`, los endpoints recruiter no exigen token para desarrollo local.

Si `RECRUITER_AUTH_ENABLED=true`, los endpoints recruiter exigen:

```http
Authorization: Bearer <RECRUITER_ACCESS_TOKEN>
```

El endpoint `GET /recruiter/dashboard` usa el mismo token y devuelve los agregados del panel.

El endpoint `GET /recruiter/interviews/:sessionId` devuelve el detalle real de entrevista.

## Email automático

Cuando una sesión pasa a `completed`, el engine intenta enviar un email de agradecimiento si existe `candidate_email`.

Para desarrollo local:

```env
EMAIL_PROVIDER=log
```

El provider `log` no envía correo real. Registra destinatario, asunto e idempotency key en logs del `interview-engine`.

La idempotencia usa:

```text
session_id + thank_you_email
```

Si no hay email del candidato, se registra un evento interno y no se bloquea el cierre de entrevista.

## Endpoints principales

- `GET /health`
- `POST /sessions`
- `GET /sessions` con token recruiter
- `POST /sessions/:sessionId/realtime-token`
- `POST /sessions/:sessionId/end`
- `GET /sessions/:sessionId`
- `POST /sessions/:sessionId/consent`
- `POST /sessions/:sessionId/turns`
- `POST /sessions/:sessionId/summary`
- `POST /sessions/:sessionId/candidate-email`
- `POST /sessions/:sessionId/candidate-identity`
- `GET /recruiter/dashboard`
- `GET /recruiter/interviews/:sessionId`

## Modelo preparado para invitaciones

`interview_sessions` incluye `interview_token` con índice único parcial. Esto deja listo el modelo para links futuros del tipo:

```text
/interview/:token
```

El flujo completo de invitaciones por email queda fuera del MVP actual.

## Extender

- Cambiar preguntas en `knowledge/interview/question-bank.json`.
- Ajustar políticas en `knowledge/interview/policy.md`.
- Modificar flujo en `routines/interview/default-interview.routine.md`.
- Implementar Deepgram completando `services/session-api/src/providers/deepgram.provider.ts`.
- Agregar autenticación formal para recruiter antes de usarlo en producción.
- Implementar SMTP o Resend como provider real de email.
- Implementar invitaciones reales con `interview_token`.
- Agregar cambio manual de estado por recruiter.
