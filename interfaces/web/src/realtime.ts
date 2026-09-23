import type { TranscriptHandlingResult } from "./consent-response";
import { CONSENT_REQUEST } from "./interview-workflow";
import { extractRealtimeUsage } from "./realtime-usage";

export type RealtimeCloseReason = "completed" | "cancelled" | "declined" | "session_error";
export type RealtimeConnection = {
  readonly closed: boolean;
  canProcess(): boolean;
  beginTerminalTransition(): void;
  close(reason: RealtimeCloseReason): void;
};

type SpeechState = "idle" | "listening" | "speaking" | "thinking";

type RealtimeHandlers = {
  model: string;
  onLifecycle?: (connection: RealtimeConnection) => void;
  onStatus: (status: string) => void;
  isConsentGranted: () => boolean;
  canFinishInterview: () => boolean;
  onTranscript: (speaker: "agent" | "candidate", content: string) => Promise<TranscriptHandlingResult> | TranscriptHandlingResult;
  onTranscriptError: (error: unknown) => void;
  onFinishInterview?: (callId: string, argumentsJson: string) => Promise<unknown> | unknown;
  onSpeechState?: (state: SpeechState) => void;
  onError?: (message: string) => void;
  onOperationalEvent?: (event: {
    name: "realtime.connected" | "response.requested" | "response.completed" | "terminal.begin" | "microphone.stopped" | "realtime.closed";
    reason?: RealtimeCloseReason;
    durationMs?: number;
    responseId?: string;
    model?: string;
    responseStatus?: string;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    inputUncachedTokens?: number;
    inputCachedTokens?: number;
    inputTextTokens?: number;
    inputAudioTokens?: number;
    inputTextCachedTokens?: number;
    inputAudioCachedTokens?: number;
    inputTextUncachedTokens?: number;
    inputAudioUncachedTokens?: number;
    outputTextTokens?: number;
    outputAudioTokens?: number;
    responseStartedAtMs?: number;
    responseCompletedAtMs?: number;
  }) => void;
};

export function createRealtimeLifecycle(
  peer: RTCPeerConnection,
  audio: HTMLAudioElement,
  handlers: Pick<RealtimeHandlers, "onStatus" | "onSpeechState" | "onOperationalEvent">,
  stopOutput: (channel: RTCDataChannel | null) => void = () => {},
  // Temporary diagnostics: read the connection's response state without owning it.
  readResponseInFlight: () => boolean | undefined = () => undefined
) {
  let stream: MediaStream | null = null;
  let channel: RTCDataChannel | null = null;
  let closed = false;
  let transitioning = false;
  let terminalStartedAt: number | null = null;

  return {
    get closed() { return closed; },
    canProcess() { return !closed && !transitioning; },
    beginTerminalTransition() {
      if (closed || transitioning) return;
      transitioning = true;
      terminalStartedAt = performance.now();
      handlers.onOperationalEvent?.({ name: "terminal.begin" });
      stream?.getTracks().forEach((track) => track.stop());
      handlers.onOperationalEvent?.({ name: "microphone.stopped" });
            audio.pause();
      stopOutput(channel);
      handlers.onSpeechState?.("idle");
    },
    setStream(value: MediaStream) {
      if (closed || transitioning) value.getTracks().forEach((track) => track.stop());
      else stream = value;
    },
    setChannel(value: RTCDataChannel) {
      if (closed || transitioning) value.close();
      else channel = value;
    },
    close(reason: RealtimeCloseReason) {
            if (closed) return;
      closed = true;
      if (channel) {
        channel.onopen = null;
        channel.onmessage = null;
      }
      peer.ontrack = null;
      stream?.getTracks().forEach((track) => track.stop());
            if (channel && channel.readyState !== "closed") channel.close();
      if (peer.signalingState !== "closed") peer.close();
      audio.pause();
      audio.srcObject = null;
      stream = null;
      channel = null;
      handlers.onSpeechState?.("idle");
      handlers.onStatus(reason);
      handlers.onOperationalEvent?.({
        name: "realtime.closed",
        reason,
        durationMs: terminalStartedAt === null ? undefined : performance.now() - terminalStartedAt
      });
    }
  };
}

export async function connectRealtime(clientSecret: string, handlers: RealtimeHandlers, signal?: AbortSignal) {
  const peer = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.setAttribute("playsinline", "true");
  let responseInFlight = false;
  let responseStartedAt: number | null = null;
  let responseStartedAtMs: number | null = null;
  const lifecycle = createRealtimeLifecycle(peer, audio, handlers, (activeChannel) => {
    if (activeChannel?.readyState !== "open") return;
    if (responseInFlight) {
            activeChannel.send(JSON.stringify({ type: "response.cancel" }));
      responseInFlight = false;
    }
    // Playback may still be buffered even after response.done.
        activeChannel.send(JSON.stringify({ type: "output_audio_buffer.clear" }));
  }, () => responseInFlight);
  handlers.onLifecycle?.(lifecycle);
  const abortConnection = () => {
    if (!lifecycle.closed) lifecycle.close("session_error");
  };
  signal?.addEventListener("abort", abortConnection, { once: true });
  if (signal?.aborted) abortConnection();

  try {
    if (lifecycle.closed) throw new DOMException("Realtime connection closed", "AbortError");
    peer.ontrack = (event) => {
      if (lifecycle.canProcess()) audio.srcObject = event.streams[0];
    };

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    lifecycle.setStream(stream);
    if (lifecycle.closed) throw new DOMException("Realtime connection closed", "AbortError");
    stream.getTracks().forEach((track) => peer.addTrack(track, stream));

    const channel = peer.createDataChannel("oai-events");
    lifecycle.setChannel(channel);
    const candidateItems = new Set<string>();
    const terminalCallIds = new Set<string>();
    let greetingRequested = false;
    const pendingResponses: Array<{ action: "greeting" } | Exclude<TranscriptHandlingResult, { action: "suppress" }>> = [];
    // Only the greeting and successfully handled candidate turns enqueue responses.
    const sendNextResponse = () => {
      if (!lifecycle.canProcess() || channel.readyState !== "open" || responseInFlight || pendingResponses.length === 0) return;
      const next = pendingResponses.shift()!;
      if (next.action === "respond" && !handlers.isConsentGranted()) {
        throw new Error("consent_required: normal Realtime response blocked without confirmed consent");
      }
      responseInFlight = true;
      responseStartedAt = performance.now();
      responseStartedAtMs = Date.now();
      handlers.onOperationalEvent?.({ name: "response.requested" });
            channel.send(JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions: next.action === "greeting" ? CONSENT_REQUEST : next.instructions,
          tool_choice: "none"
        }
      }));
    };
    channel.onopen = () => {
      if (!lifecycle.canProcess() || greetingRequested) return;
      greetingRequested = true;
      handlers.onStatus("voice_connected");
      handlers.onOperationalEvent?.({ name: "realtime.connected" });
      handlers.onSpeechState?.("speaking");
      pendingResponses.push({ action: "greeting" });
      sendNextResponse();
    };

    const handleMessage = async (event: MessageEvent) => {
      if (!lifecycle.canProcess()) return;
      const payload: Record<string, any> = JSON.parse(event.data);
            if (payload.type === "error") {
        throw new Error(payload.error?.message ?? "Realtime error");
      }
      if (payload.type === "response.output_item.done" &&
          payload.item?.type === "function_call" &&
          payload.item.status === "completed" &&
          payload.item.name === "finish_interview" &&
          typeof payload.item.call_id === "string" && payload.item.call_id) {
        const item = payload.item;
                if (terminalCallIds.has(item.call_id)) return;
        terminalCallIds.add(item.call_id);
        lifecycle.beginTerminalTransition();
        if (!handlers.isConsentGranted()) {
          throw new Error("consent_required: finish_interview blocked without confirmed consent");
        }
        if (!handlers.canFinishInterview()) {
          throw new Error("invalid_workflow_step: finish_interview blocked before workflow completion");
        }
        if (!handlers.onFinishInterview) throw new Error("Missing finish_interview handler");
        await handlers.onFinishInterview(item.call_id, item.arguments ?? "{}");
        // Terminal tool: the application confirms completion and closes the connection.
        // No function output or additional model response is needed.
        return;
      }
      if (payload.type === "input_audio_buffer.speech_started") handlers.onSpeechState?.("listening");
      if (payload.type === "input_audio_buffer.speech_stopped") handlers.onSpeechState?.("thinking");
      if (
        (payload.type === "response.output_audio_transcript.done" || payload.type === "response.audio_transcript.done") &&
        payload.transcript
      ) {
        handlers.onSpeechState?.("listening");
        await handlers.onTranscript("agent", payload.transcript);
      }
      if (
        (payload.type === "conversation.item.input_audio_transcription.completed" || payload.type === "input_audio_transcription.completed") &&
        payload.transcript
      ) {
        const itemId = payload.item_id ?? payload.event_id;
        if (typeof itemId !== "string") throw new Error("Candidate transcription is missing its item ID");
        const key = `${itemId}:${payload.content_index ?? 0}`;
        if (candidateItems.has(key)) return;
        candidateItems.add(key);
        const result = await handlers.onTranscript("candidate", payload.transcript);
        if (!lifecycle.canProcess()) return;
        if (!result || result.action === "suppress") return;
        pendingResponses.push(result);
        sendNextResponse();
      }
      if (payload.type === "response.created") {
        responseInFlight = true;
        handlers.onSpeechState?.("speaking");
      }
      if (payload.type === "response.done") {
        const usage = extractRealtimeUsage(payload);
        responseInFlight = false;
        handlers.onOperationalEvent?.({
          name: "response.completed",
          durationMs: responseStartedAt === null ? undefined : performance.now() - responseStartedAt,
          responseId: usage?.responseId,
          model: handlers.model,
          responseStatus: usage?.status,
          inputTokens: usage?.inputTokens,
          outputTokens: usage?.outputTokens,
          totalTokens: usage?.totalTokens,
          inputUncachedTokens: usage?.inputUncachedTokens,
          inputCachedTokens: usage?.inputCachedTokens,
          inputTextTokens: usage?.inputTextTokens,
          inputAudioTokens: usage?.inputAudioTokens,
          inputTextCachedTokens: usage?.inputTextCachedTokens,
          inputAudioCachedTokens: usage?.inputAudioCachedTokens,
          inputTextUncachedTokens: usage?.inputTextUncachedTokens,
          inputAudioUncachedTokens: usage?.inputAudioUncachedTokens,
          outputTextTokens: usage?.outputTextTokens,
          outputAudioTokens: usage?.outputAudioTokens,
          responseStartedAtMs: responseStartedAtMs ?? undefined,
          responseCompletedAtMs: Date.now()
        });
        responseStartedAt = null;
        responseStartedAtMs = null;
        handlers.onSpeechState?.("listening");
        sendNextResponse();
      }
    };
    channel.onmessage = (event) => {
      void handleMessage(event).catch((error: unknown) => {
        lifecycle.close("session_error");
        try {
          handlers.onTranscriptError(error);
        } catch (handlerError) {
          console.error("Failed to handle Realtime error", handlerError);
        }
      });
    };

    const offer = await peer.createOffer();
    await peer.setLocalDescription(offer);
    const response = await fetch("https://api.openai.com/v1/realtime/calls", {
      method: "POST",
      headers: { Authorization: `Bearer ${clientSecret}`, "Content-Type": "application/sdp" },
      body: offer.sdp ?? "",
      signal
    });
    if (!response.ok) throw new Error(await response.text());
    await peer.setRemoteDescription({ type: "answer", sdp: await response.text() });
    if (lifecycle.closed) throw new DOMException("Realtime connection closed", "AbortError");
    return lifecycle;
  } catch (error) {
    lifecycle.close("session_error");
    throw error;
  }
}
