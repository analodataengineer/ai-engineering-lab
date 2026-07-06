import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  createRealtimeToken,
  createSession,
  createSummary,
  endSession,
  getRecruiterDashboard,
  getRecruiterInterviewDetail,
  getSession,
  markConsent,
  recordTurn,
  type RecruiterDashboard,
  type RecruiterInterviewDetail,
  type SessionPayload
} from "./api";
import { connectRealtime } from "./realtime";
import "./styles.css";

const FINAL_AUDIO_GRACE_MS = 10000;

const statusCopy: Record<string, string> = {
  idle: "Asistente listo",
  creating_session: "Preparando",
  requesting_microphone: "Permitir micrófono",
  voice_connected: "Escuchando",
  text_fallback_ready: "Permiso requerido",
  completed: "Registrada",
  voice_disconnected: "Registrada"
};

function isAffirmativeConsent(text: string) {
  return /\b(si|sí|acepto|de acuerdo|continuar|consiento)\b/i.test(text);
}

function isClosingMessage(text: string) {
  return /(entrevista|charla).{0,40}(finaliz|termin)|finaliz.{0,40}(entrevista|charla)|gracias por participar/i.test(
    text
  );
}

function statusFromSpeech(state: "idle" | "listening" | "speaking" | "thinking", connectionStatus: string) {
  if (connectionStatus === "completed") return "Entrevista finalizada";
  if (state === "thinking") return "Procesando";
  if (state === "speaking") return "Asistente hablando";
  if (state === "listening") return "Escuchando";
  return statusCopy[connectionStatus] ?? "Asistente listo";
}

function CandidateInterview() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [speechState, setSpeechState] = useState<"idle" | "listening" | "speaking" | "thinking">("idle");
  const [lastMessage, setLastMessage] = useState("Una breve conversación guiada para conocer tu perfil profesional.");
  const [errorMessage, setErrorMessage] = useState("");
  const startedRef = useRef(false);
  const finishingRef = useRef(false);
  const stopVoiceRef = useRef<null | (() => void)>(null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startInterview();
  }, []);

  async function maybeMarkConsent(sessionId: string, text: string) {
    if (!isAffirmativeConsent(text)) return;
    const current = await getSession(sessionId);
    if (current.session.consent_status === "granted") return;
    const updated = await markConsent(sessionId, "granted");
    setSession(updated);
  }

  async function finishInterview(sessionId: string) {
    if (finishingRef.current) return;
    finishingRef.current = true;
    window.setTimeout(() => stopVoiceRef.current?.(), FINAL_AUDIO_GRACE_MS);

    const latest = await getSession(sessionId);
    const transcript = latest.turns.map((turn) => `${turn.speaker}: ${turn.content}`).join("\n");
    await createSummary(sessionId, {
      profileSummary: "Resumen neutral generado para revisión humana a partir de la sesión registrada.",
      experienceSummary: transcript.slice(0, 2500),
      toolsSummary: "Revisar herramientas, tareas o tecnologías mencionadas explícitamente.",
      availabilitySummary: "Revisar disponibilidad y modalidad si fueron informadas explícitamente.",
      humanReviewNotes: [
        "Este resumen no aprueba ni rechaza a la persona candidata.",
        "Profundizar motivación, interés por la empresa, experiencia y disponibilidad."
      ]
    });
    const ended = await endSession(sessionId);
    setSession(ended);
    setConnectionStatus("completed");
    setSpeechState("idle");
    setLastMessage("Gracias. La entrevista fue registrada y será revisada por el equipo de recruiting.");
  }

  async function startInterview() {
    setErrorMessage("");
    setConnectionStatus("creating_session");
    setSpeechState("thinking");

    const created = await createSession({});
    setSession(created);
    setLastMessage("Conectando con el asistente de voz...");

    try {
      setConnectionStatus("requesting_microphone");
      const token = await createRealtimeToken(created.id);
      if (!token.clientSecret) {
        throw new Error("No se recibió token efímero de Realtime.");
      }

      const stop = await connectRealtime(token.clientSecret, {
        onStatus: setConnectionStatus,
        onSpeechState: setSpeechState,
        onError: setErrorMessage,
        onTranscript: async (speaker, content) => {
          await recordTurn(created.id, { speaker, content });
          if (speaker === "candidate") {
            await maybeMarkConsent(created.id, content);
          }
          if (speaker === "agent" && isClosingMessage(content)) {
            await finishInterview(created.id);
            return;
          }
          setLastMessage(
            speaker === "agent"
              ? "Respondé con tranquilidad cuando el asistente termine de hablar."
              : "Respuesta registrada. El asistente continuará cuando detecte tu pausa."
          );
        }
      });
      stopVoiceRef.current = stop;
      setLastMessage("El asistente ya puede hablar y escuchar tus respuestas.");
    } catch (error) {
      setConnectionStatus("text_fallback_ready");
      setSpeechState("idle");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo conectar la voz.");
      setLastMessage("El navegador necesita que actives el micrófono para comenzar.");
    }
  }

  const isCompleted = session?.status === "completed";
  const isActive = Boolean(session && !isCompleted && connectionStatus !== "idle");
  const canStart = connectionStatus === "text_fallback_ready" || connectionStatus === "idle";

  return (
    <main className="candidate-shell">
      <section className="candidate-stage">
        <div className="brand-pill">Recursos Humanos · Entrevista inicial</div>

        <div className={`voice-orb ${speechState} ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}>
          <div className="orb-wave" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <div className="status-pill">
          <span />
          {statusFromSpeech(speechState, connectionStatus)}
        </div>

        <h1>{isCompleted ? "Entrevista finalizada" : "Entrevista inicial"}</h1>
        <p className="candidate-subtitle">
          {isCompleted
            ? "Gracias. La entrevista fue registrada y será revisada por el equipo de recruiting."
            : "Una breve conversación guiada para conocer tu perfil profesional."}
        </p>

        <div className="candidate-info-grid">
          <article>
            <span>⏱</span>
            <div>
              <strong>Duración estimada</strong>
              <p>Menos de 5 minutos</p>
            </div>
          </article>
          <article>
            <span>⌾</span>
            <div>
              <strong>Entrevista privada</strong>
              <p>Tus datos están protegidos</p>
            </div>
          </article>
        </div>

        {errorMessage ? <p className="error-message">{errorMessage}</p> : <p className="supporting-copy">{lastMessage}</p>}

        {!isCompleted && canStart ? (
          <button className="candidate-primary" onClick={startInterview}>
            <span>◉</span>
            Comenzar
          </button>
        ) : null}

        {!isCompleted ? <button className="candidate-secondary">Continuar más tarde</button> : null}
        {isCompleted ? <p className="candidate-note">Te enviaremos una confirmación por email si registraste tu correo.</p> : null}
      </section>
    </main>
  );
}

function MetricCard(props: { label: string; value: number; tone: string; trend?: string }) {
  return (
    <article className={`metric-card tone-${props.tone}`}>
      <div className="metric-icon">✦</div>
      <div>
        <span>{props.label}</span>
        <strong>{props.value}</strong>
        <p>{props.trend ?? "MVP actual"}</p>
      </div>
    </article>
  );
}

function formatCandidateName(detail: RecruiterInterviewDetail) {
  return (
    detail.session.candidateDisplayName ||
    [detail.session.candidateFirstName, detail.session.candidateLastName].filter(Boolean).join(" ") ||
    "Sin registrar"
  );
}

function RecruiterDashboardPage() {
  const [accessToken, setAccessToken] = useState(localStorage.getItem("recruiterAccessToken") ?? "");
  const [dashboard, setDashboard] = useState<RecruiterDashboard | null>(null);
  const [interviewDetail, setInterviewDetail] = useState<RecruiterInterviewDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadDashboard(token = accessToken) {
    setErrorMessage("");
    try {
      const result = await getRecruiterDashboard(token);
      localStorage.setItem("recruiterAccessToken", token);
      setDashboard(result);
    } catch {
      setErrorMessage("No se pudo acceder. Revisá el token de recruiter.");
      setDashboard(null);
    }
  }

  useEffect(() => {
    void loadDashboard(accessToken);
    const detailMatch = window.location.pathname.match(/^\/recruiter\/interviews\/([^/]+)$/);
    if (detailMatch?.[1]) {
      void openInterviewDetail(detailMatch[1]);
    }
  }, []);

  async function openInterviewDetail(sessionId: string) {
    setErrorMessage("");
    try {
      const detail = await getRecruiterInterviewDetail(sessionId, accessToken);
      setInterviewDetail(detail);
      window.history.pushState(null, "", `/recruiter/interviews/${sessionId}`);
    } catch {
      setErrorMessage("No se pudo cargar el detalle de entrevista.");
    }
  }

  const counters = dashboard?.counters;
  const responseRate =
    counters && counters.interviews > 0
      ? Math.round((counters.interviews / Math.max(counters.applications, 1)) * 100)
      : 0;

  return (
    <main className="recruiter-shell">
      <aside className="recruiter-sidebar">
        <div className="sidebar-logo">≋</div>
        <span>⌂</span>
        <span>▣</span>
        <span>♢</span>
        <span>☷</span>
        <span>⚙</span>
        <div className="sidebar-user">MR</div>
      </aside>

      <section className="recruiter-main">
        <header className="recruiter-header">
          <div>
            <p className="eyebrow">Recursos Humanos</p>
            <h1>Panel de recruiting</h1>
            <p>Gestiona tus puestos, entrevistas y candidatos en un solo lugar.</p>
          </div>
          <div className="recruiter-actions">
            <label className="search-box">
              <span>⌕</span>
              <input placeholder="Buscar candidatos, puestos o entrevistas..." />
            </label>
            <button className="new-position">+ Nuevo puesto</button>
            <button className="period-filter">Últimos 30 días</button>
          </div>
        </header>

        <form
          className="token-form"
          onSubmit={(event) => {
            event.preventDefault();
            void loadDashboard();
          }}
        >
          <input
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="Token de acceso recruiter"
            type="password"
          />
          <button>Acceder</button>
        </form>

        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}

        {dashboard ? (
          <>
            <section className="metrics-grid">
              <MetricCard label="Puestos vacantes" value={dashboard.counters.openPositions} tone="purple" />
              <MetricCard label="Solicitudes" value={dashboard.counters.applications} tone="lavender" />
              <MetricCard label="Entrevistas" value={dashboard.counters.interviews} tone="violet" />
              <MetricCard label="Avanzan" value={dashboard.counters.advancing} tone="green" />
              <MetricCard label="En revisión" value={dashboard.counters.inReview} tone="amber" />
              <MetricCard label="No avanzan" value={dashboard.counters.notAdvancing} tone="red" />
            </section>

            <section className="dashboard-grid">
              <article className="dashboard-card funnel-card">
                <div className="card-heading">
                  <h2>Embudo de candidatos</h2>
                  <span>Por etapas</span>
                </div>
                <div className="funnel-bars">
                  {dashboard.funnel.map((item) => (
                    <div className="funnel-item" key={item.label}>
                      <div className="bar-track">
                        <span style={{ height: `${Math.max(item.percentage, 8)}%` }} />
                      </div>
                      <strong>{item.count}</strong>
                      <p>{item.label}</p>
                      <small>{item.percentage}%</small>
                    </div>
                  ))}
                </div>
              </article>

              <aside className="dashboard-side">
                <article className="dashboard-card automation-card">
                  <div className="card-heading">
                    <h2>Automatizaciones</h2>
                    <span>Activado</span>
                  </div>
                  <h3>Email de agradecimiento</h3>
                  <p>Se envía automáticamente al finalizar la entrevista al correo del candidato.</p>
                  <div className="automation-stats">
                    <span>Enviados: {dashboard.automations.thankYouEmail.sentCount}</span>
                    <span>Fallidos: {dashboard.automations.thankYouEmail.failedCount}</span>
                  </div>
                  <button>Gestionar automatizaciones</button>
                </article>

                <article className="dashboard-card response-card">
                  <h2>Tasa de respuesta</h2>
                  <div className="response-ring" style={{ "--rate": `${responseRate * 3.6}deg` } as React.CSSProperties}>
                    <strong>{responseRate}%</strong>
                  </div>
                  <p>Entrevistas completadas: {dashboard.counters.interviews}</p>
                </article>
              </aside>
            </section>

            <section className="dashboard-card recent-card">
              <div className="card-heading">
                <h2>Entrevistas recientes</h2>
                <span>Ver todas las entrevistas</span>
              </div>
              <div className="interview-table">
                <div className="table-row table-head">
                  <span>Candidato</span>
                  <span>Puesto</span>
                  <span>Estado</span>
                  <span>Fecha</span>
                  <span>Siguiente acción</span>
                </div>
                {dashboard.recentInterviews.map((item) => (
                  <div className="table-row" key={item.id}>
                    <span>
                      <strong>{item.candidateName ?? "Sin nombre"}</strong>
                      <small>{item.candidateEmail ?? "Sin email"}</small>
                    </span>
                    <span>{item.positionTitle ?? "Puesto por definir"}</span>
                    <span className={`status-badge status-${item.status}`}>{item.status === "completed" ? "Entrevista completa" : "En revisión"}</span>
                    <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                    <button onClick={() => void openInterviewDetail(item.id)}>{item.nextAction}</button>
                  </div>
                ))}
              </div>
            </section>

            {interviewDetail ? (
              <section className="dashboard-card interview-detail-card">
                <div className="card-heading">
                  <h2>Detalle de entrevista</h2>
                  <button onClick={() => setInterviewDetail(null)}>Cerrar</button>
                </div>
                <div className="detail-grid">
                  <div>
                    <strong>Nombre y apellido</strong>
                    <p>{formatCandidateName(interviewDetail)}</p>
                  </div>
                  <div>
                    <strong>Email</strong>
                    <p>{interviewDetail.session.candidateEmail ?? "Sin registrar"}</p>
                  </div>
                  <div>
                    <strong>Puesto/interés</strong>
                    <p>{interviewDetail.session.targetRole ?? "Sin registrar"}</p>
                  </div>
                  <div>
                    <strong>Estado</strong>
                    <p>{interviewDetail.session.status}</p>
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Resumen</h3>
                  {interviewDetail.summary ? (
                    <>
                      <p>{interviewDetail.summary.profileSummary}</p>
                      <p>{interviewDetail.summary.experienceSummary}</p>
                      <p>{interviewDetail.summary.toolsSummary}</p>
                      <p>{interviewDetail.summary.availabilitySummary}</p>
                      <p>{interviewDetail.summary.humanReviewNotes}</p>
                    </>
                  ) : (
                    <p>Todavía no hay resumen disponible para esta entrevista.</p>
                  )}
                </div>

                <div className="detail-section">
                  <h3>Transcripción</h3>
                  <div className="turns-list">
                    {interviewDetail.turns.map((turn) => (
                      <article key={turn.id}>
                        <span>{turn.speaker}</span>
                        <p>{turn.content}</p>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="detail-section">
                  <h3>Automatizaciones</h3>
                  {interviewDetail.emailEvents.length > 0 ? (
                    interviewDetail.emailEvents.map((event) => (
                      <p key={event.id}>
                        Email de agradecimiento: {event.status} · {event.provider}
                        {event.sentAt ? ` · ${new Date(event.sentAt).toLocaleString()}` : ""}
                        {event.errorMessage ? ` · ${event.errorMessage}` : ""}
                      </p>
                    ))
                  ) : (
                    <p>Sin eventos de email para esta entrevista.</p>
                  )}
                </div>
              </section>
            ) : null}
          </>
        ) : (
          <section className="empty-dashboard">
            <h2>Ingresá el token recruiter para cargar el panel.</h2>
          </section>
        )}
      </section>
    </main>
  );
}

function App() {
  if (window.location.pathname.startsWith("/recruiter")) {
    return <RecruiterDashboardPage />;
  }

  return <CandidateInterview />;
}

createRoot(document.getElementById("root")!).render(<App />);
