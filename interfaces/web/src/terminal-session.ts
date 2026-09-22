export type TerminalRequestStatus = "completed" | "cancelled";

export type TerminalSession = {
  status: string;
  [key: string]: unknown;
};

export function createTerminalTransition(deps: {
  endSession: (sessionId: string, status: TerminalRequestStatus) => Promise<TerminalSession>;
  onConfirmed: (session: TerminalSession, status: TerminalRequestStatus) => void;
}) {
  let terminal: TerminalSession | null = null;
  let inFlight: Promise<TerminalSession> | null = null;

  return {
    request(sessionId: string, status: TerminalRequestStatus) {
      if (terminal) return Promise.resolve(terminal);
      if (inFlight) return inFlight;
      inFlight = deps.endSession(sessionId, status).then((session) => {
        if (session.status !== status) throw new Error(`Session did not reach ${status}.`);
        terminal = session;
        deps.onConfirmed(session, status);
        return session;
      }).finally(() => {
        inFlight = null;
      });
      return inFlight;
    }
  };
}
