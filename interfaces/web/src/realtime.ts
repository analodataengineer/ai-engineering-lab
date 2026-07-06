type RealtimeHandlers = {
  onStatus: (status: string) => void;
  onTranscript: (speaker: "agent" | "candidate", content: string) => void;
  onSpeechState?: (state: "listening" | "speaking" | "thinking") => void;
  onError?: (message: string) => void;
};

export async function connectRealtime(clientSecret: string, handlers: RealtimeHandlers) {
  const peer = new RTCPeerConnection();
  const audio = document.createElement("audio");
  audio.autoplay = true;
  audio.setAttribute("playsinline", "true");

  peer.ontrack = (event) => {
    audio.srcObject = event.streams[0];
  };

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => peer.addTrack(track, stream));

  const channel = peer.createDataChannel("oai-events");
  channel.onopen = () => {
    handlers.onStatus("voice_connected");
    handlers.onSpeechState?.("speaking");
    channel.send(
      JSON.stringify({
        type: "response.create",
        response: {
          output_modalities: ["audio"],
          instructions:
            "Saludá ahora por voz. Decí que será una charla breve de hasta 5 minutos, explicá que la información será revisada por una persona y pedí consentimiento para continuar."
        }
      })
    );
  };

  channel.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "error") {
      handlers.onError?.(payload.error?.message ?? "Realtime error");
    }
    if (payload.type === "input_audio_buffer.speech_started") {
      handlers.onSpeechState?.("listening");
    }
    if (payload.type === "input_audio_buffer.speech_stopped") {
      handlers.onSpeechState?.("thinking");
    }
    if (
      (payload.type === "response.output_audio_transcript.done" ||
        payload.type === "response.audio_transcript.done") &&
      payload.transcript
    ) {
      handlers.onSpeechState?.("listening");
      handlers.onTranscript("agent", payload.transcript);
    }
    if (
      (payload.type === "conversation.item.input_audio_transcription.completed" ||
        payload.type === "input_audio_transcription.completed") &&
      payload.transcript
    ) {
      handlers.onTranscript("candidate", payload.transcript);
    }
    if (payload.type === "response.created") {
      handlers.onSpeechState?.("speaking");
    }
    if (payload.type === "response.done") {
      handlers.onSpeechState?.("listening");
    }
  };

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const response = await fetch("https://api.openai.com/v1/realtime/calls", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clientSecret}`,
      "Content-Type": "application/sdp"
    },
    body: offer.sdp ?? ""
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  await peer.setRemoteDescription({
    type: "answer",
    sdp: await response.text()
  });

  return () => {
    stream.getTracks().forEach((track) => track.stop());
    channel.close();
    peer.close();
    handlers.onStatus("voice_disconnected");
  };
}
