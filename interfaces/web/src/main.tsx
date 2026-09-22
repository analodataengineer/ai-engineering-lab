import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
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
import { connectRealtime, type RealtimeCloseReason, type RealtimeConnection } from "./realtime";
import { createTerminalTransition, type TerminalRequestStatus } from "./terminal-session";
import { classifyConsent, type ConsentDecision } from "./consent";
import { resolvePendingConsent, type TranscriptHandlingResult } from "./consent-response";
import { createInterviewWorkflow, questionResponse } from "./interview-workflow";
import "./styles.css";

type ApplicationSessionState = "pending_consent" | "interviewing" | "completing" | "completed" | "cancelling" | "cancelled" | "error";

const statusCopy: Record<string, string> = {
  idle: "Asistente listo",
  creating_session: "Preparando",
  requesting_microphone: "Permitir micrófono",
  voice_connected: "Escuchando",
  text_fallback_ready: "Permiso requerido",
  completed: "Registrada",
  declined: "Entrevista cancelada",
  cancelled: "Entrevista cancelada",
  voice_disconnected: "Registrada",
  session_error: "Entrevista detenida"
};

function statusFromSpeech(state: "idle" | "listening" | "speaking" | "thinking", connectionStatus: string, applicationState: ApplicationSessionState) {
  if (applicationState === "completed") return "Entrevista finalizada";
  if (applicationState === "cancelled") return "Entrevista cancelada";
  if (applicationState === "error") return "Entrevista detenida";
  if (applicationState === "completing") return "Finalizando";
  if (applicationState === "cancelling") return "Cancelando";
  if (["cancelled", "declined", "session_error"].includes(connectionStatus)) return statusCopy[connectionStatus];
  if (state === "thinking") return "Procesando";
  if (state === "speaking") return "Asistente hablando";
  if (state === "listening") return "Escuchando";
  return statusCopy[connectionStatus] ?? "Asistente listo";
}

function CandidateInterview() {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [connectionStatus, setConnectionStatus] = useState("idle");
  const [applicationState, setApplicationState] = useState<ApplicationSessionState>("pending_consent");
  const [speechState, setSpeechState] = useState<"idle" | "listening" | "speaking" | "thinking">("idle");
  const [lastMessage, setLastMessage] = useState("Una breve conversación guiada para conocer tu perfil profesional.");
  const [errorMessage, setErrorMessage] = useState("");
  const startedRef = useRef(false);
  const finishingRef = useRef(false);
  const stopVoiceRef = useRef<RealtimeConnection | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const terminalReasonRef = useRef<RealtimeCloseReason | null>(null);
  const transcriptFailedRef = useRef(false);
  const consentStatusRef = useRef<ConsentDecision>("pending");
  const workflowRef = useRef(createInterviewWorkflow());
  const consentUpdateRef = useRef<Promise<TranscriptHandlingResult> | null>(null);
  const terminalTransitionRef = useRef<ReturnType<typeof createTerminalTransition> | null>(null);

  function beginTerminalTransition(state: "completing" | "cancelling", reason: RealtimeCloseReason) {
        terminalReasonRef.current = reason;
    transcriptFailedRef.current = true;
    setApplicationState(state);
    stopVoiceRef.current?.beginTerminalTransition();
    setSpeechState("idle");
  }

  function closeActiveRealtime(reason: RealtimeCloseReason) {
        terminalReasonRef.current = reason;
    stopVoiceRef.current?.close(reason);
    stopVoiceRef.current = null;
    voiceAbortRef.current?.abort(reason);
    voiceAbortRef.current = null;
    setConnectionStatus(reason);
    setSpeechState("idle");
  }

  function failTerminalTransition(error: unknown) {
    console.error("[TERMINAL ERROR]", error);
    transcriptFailedRef.current = true;
    setApplicationState("error");
    closeActiveRealtime("session_error");
    setErrorMessage(error instanceof ApiError
      ? `${error.code} (HTTP ${error.status}): ${error.message}`
      : error instanceof Error ? error.message : "No se pudo completar la entrevista.");
  }

  function handleFatalError(error: unknown) {
    console.error("[FATAL ERROR]", error);
    if (terminalReasonRef.current) return;
    transcriptFailedRef.current = true;
    setApplicationState("error");
    closeActiveRealtime("session_error");
    setErrorMessage(error instanceof ApiError
      ? `${error.code} (HTTP ${error.status}): ${error.message}`
      : error instanceof Error ? error.message : "No se pudo registrar la entrevista.");
  }

  function applyTerminalSession(updated: SessionPayload) {
    return applyTerminalSessionWithReason(updated);
  }

  function requestTerminal(sessionId: string, status: TerminalRequestStatus, reason: RealtimeCloseReason) {
    if (!terminalTransitionRef.current) {
      terminalTransitionRef.current = createTerminalTransition({
        endSession,
        onConfirmed: (updated) => applyTerminalSessionWithReason(updated as SessionPayload, reason)
      });
    }
    return terminalTransitionRef.current.request(sessionId, status);
  }

  function applyTerminalSessionWithReason(updated: SessionPayload, reason?: RealtimeCloseReason) {
    if (updated.status === "completed") closeActiveRealtime("completed");
    else if (updated.status === "cancelled") closeActiveRealtime(reason ?? (updated.consent_status === "declined" ? "declined" : "cancelled"));
    else return false;
    setSession(updated);
    setApplicationState(updated.status === "completed" ? "completed" : "cancelled");
    return true;
  }

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void startInterview();
  }, []);

  useEffect(() => {
    if (!session?.id) return;
    const sessionId = session.id;
    let disposed = false;
    let polling = false;
    const timer = window.setInterval(async () => {
      if (polling || terminalReasonRef.current) return;
      polling = true;
      try {
        const latest = await getSession(sessionId);
        if (!disposed) applyTerminalSession(latest.session);
      } catch (error) {
        if (!disposed && error instanceof ApiError && error.status === 404) handleFatalError(error);
      } finally {
        polling = false;
      }
    }, 2000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [session?.id]);

  useEffect(() => () => {
    stopVoiceRef.current?.beginTerminalTransition();
    stopVoiceRef.current?.close("cancelled");
  }, []);

  async function finishInterview(sessionId: string) {
    if (finishingRef.current) return;
    if (consentStatusRef.current !== "granted") {
      const error = new Error("consent_required: cannot complete an interview without confirmed consent");
      failTerminalTransition(error);
      throw error;
    }
    if (!workflowRef.current.canFinish()) {
      const error = new Error("invalid_workflow_step: cannot finish before all interview steps");
      failTerminalTransition(error);
      throw error;
    }
    finishingRef.current = true;
    beginTerminalTransition("completing", "completed");

    try {
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
    await requestTerminal(sessionId, "completed", "completed");
    setLastMessage("Gracias. La entrevista fue registrada y será revisada por el equipo de recruiting.");
    } catch (error) {
      failTerminalTransition(error);
      throw error;
    }
  }

  async function cancelInterview() {
    if (!session || terminalReasonRef.current) return;
    finishingRef.current = true;
    beginTerminalTransition("cancelling", "cancelled");
    try {
      await requestTerminal(session.id, "cancelled", "cancelled");
      setLastMessage("La entrevista fue cancelada.");
    } catch (error) {
      failTerminalTransition(error);
    }
  }

  async function startInterview() {
    transcriptFailedRef.current = false;
    terminalReasonRef.current = null;
    terminalTransitionRef.current = null;
    finishingRef.current = false;
    setApplicationState("pending_consent");
    consentStatusRef.current = "pending";
    workflowRef.current = createInterviewWorkflow();
    consentUpdateRef.current = null;
    const voiceAbort = new AbortController();
    voiceAbortRef.current = voiceAbort;
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

      if (terminalReasonRef.current) return;
      const stop = await connectRealtime(token.clientSecret, {
        isConsentGranted: () => consentStatusRef.current === "granted",
        canFinishInterview: () => workflowRef.current.canFinish(),
        onLifecycle: (connection) => { stopVoiceRef.current = connection; },
        onStatus: (status) => { if (!terminalReasonRef.current) setConnectionStatus(status); },
        onSpeechState: (state) => { if (!terminalReasonRef.current) setSpeechState(state); },
        onError: setErrorMessage,
        onTranscriptError: handleFatalError,
        onFinishInterview: async () => {
          await finishInterview(created.id);
          return { status: "completed" };
        },
        onTranscript: async (speaker, content): Promise<TranscriptHandlingResult> => {
                    if (transcriptFailedRef.current || terminalReasonRef.current || finishingRef.current) return { action: "suppress" };
          const intent = speaker === "candidate" ? classifyConsent(content) : "pending";
          if (speaker === "candidate")           // Withdrawal preempts even an outstanding consent request.
          if ((intent === "declined" || intent === "stop_requested") &&
              (consentStatusRef.current === "granted" || consentUpdateRef.current)) {
            finishingRef.current = true;
            beginTerminalTransition("cancelling", "cancelled");
            try {
              await requestTerminal(created.id, "cancelled", "cancelled");
              setLastMessage("La entrevista fue cancelada.");
            } catch (error) {
              failTerminalTransition(error);
            }
            return { action: "suppress" };
          }
          if (consentUpdateRef.current) await consentUpdateRef.current;
          if (transcriptFailedRef.current || terminalReasonRef.current || finishingRef.current) return { action: "suppress" };
          if (consentStatusRef.current === "declined" || consentStatusRef.current === "stop_requested") return { action: "suppress" };
          if (consentStatusRef.current === "pending") {
            if (speaker !== "candidate") return { action: "suppress" };
            const decision = intent;
            const update = resolvePendingConsent(decision, {
              markConsent: (value) => markConsent(created.id, value),
              beginDecline: () => beginTerminalTransition("cancelling", decision === "declined" ? "declined" : "cancelled"),
              onConfirmed: (updated) => {
                                if (decision === "granted" && terminalReasonRef.current) return;
                consentStatusRef.current = decision;
                if (decision === "granted") workflowRef.current.confirmConsent(updated);
                                setSession(updated);
                if (decision === "granted") setApplicationState("interviewing");
                applyTerminalSessionWithReason(updated, decision === "declined" ? "declined" : "cancelled");
              }
            });
            consentUpdateRef.current = update;
            try {
              await update;
            } catch (error) {
              failTerminalTransition(error);
              throw error;
            }
            if (decision === "declined" || decision === "stop_requested") {
              setLastMessage("No continuaremos con la entrevista.");
            }
            return await update;
          }
          if (speaker === "candidate") {
            const next = await workflowRef.current.recordAnswer(
              () => recordTurn(created.id, { speaker, content }),
              () => !terminalReasonRef.current && !transcriptFailedRef.current && !finishingRef.current
            );
                        if (terminalReasonRef.current || transcriptFailedRef.current || finishingRef.current) return { action: "suppress" };
            if (next === "complete") {
              // Application-controlled finish_interview: no model turn is needed.
              await finishInterview(created.id);
              return { action: "suppress" };
            }
            if (next === "consent") return { action: "suppress" };
            return questionResponse(next);
          }
          await recordTurn(created.id, { speaker, content });
          setLastMessage(
            speaker === "agent"
              ? "Respondé con tranquilidad cuando el asistente termine de hablar."
              : "Respuesta registrada. El asistente continuará cuando detecte tu pausa."
          );
          return { action: "suppress" };
        }
      }, voiceAbort.signal);
      stopVoiceRef.current = stop;
      if (terminalReasonRef.current) {
        stop.close(terminalReasonRef.current);
        stopVoiceRef.current = null;
        return;
      }
      setLastMessage("El asistente ya puede hablar y escuchar tus respuestas.");
    } catch (error) {
      if (terminalReasonRef.current) return;
      voiceAbortRef.current = null;
      setConnectionStatus("text_fallback_ready");
      setSpeechState("idle");
      setErrorMessage(error instanceof Error ? error.message : "No se pudo conectar la voz.");
      setLastMessage("El navegador necesita que actives el micrófono para comenzar.");
    }
  }

  const isCompleted = applicationState === "completed" || session?.status === "completed";
  const isDeclined = applicationState === "cancelled" && session?.consent_status === "declined";
  const isCancelled = applicationState === "cancelled" || session?.status === "cancelled" || connectionStatus === "cancelled";
  const isActive = Boolean(session && !isCompleted && !isDeclined && !isCancelled && !["completing", "cancelling", "error"].includes(applicationState) && connectionStatus !== "idle" && connectionStatus !== "session_error");
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
          {statusFromSpeech(speechState, connectionStatus, applicationState)}
        </div>

        <h1>{isDeclined || isCancelled ? "Entrevista cancelada" : isCompleted ? "Entrevista finalizada" : applicationState === "error" ? "Entrevista detenida" : "Entrevista inicial"}</h1>
        <p className="candidate-subtitle">
          {isDeclined || isCancelled
            ? "Respetamos tu decisión de no continuar."
            : isCompleted
            ? "Gracias. La entrevista fue registrada y será revisada por el equipo de recruiting."
            : applicationState === "completing"
            ? "Estamos cerrando la entrevista."
            : "Una breve conversación guiada para conocer tu perfil profesional."}
        </p>

        <div className="candidate-info-grid">
          <article>
            <span>⏱</span>
            <div>
              <strong>Duración estimada</strong>
              <p>Aproximadamente 5 minutos</p>
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

        {!isCompleted && !isDeclined && !isCancelled && canStart ? (
          <button className="candidate-primary" onClick={startInterview}>
            <span>◉</span>
            Comenzar
          </button>
        ) : null}

        {session && !isCompleted && !isDeclined && !isCancelled && connectionStatus !== "session_error" ? <button className="candidate-secondary" onClick={() => void cancelInterview()}>Cancelar entrevista</button> : null}
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
