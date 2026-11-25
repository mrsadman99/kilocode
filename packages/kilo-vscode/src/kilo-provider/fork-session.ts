import type { Session } from "@kilocode/sdk/v2/client"
import type { KiloConnectionService } from "../services/cli-backend"
import { forkSession } from "../agent-manager/fork-session"

export interface ForkContext {
  connection: KiloConnectionService
  post: (message: { type: "error"; message: string }) => void
  register: (session: Session) => void
  forked: (session: Session, sourceID: string) => void
  directory: (sessionID: string) => string
}

export async function handleForkSession(ctx: ForkContext, sessionId: string, messageId?: string): Promise<void> {
  // Forking snapshots the transcript at the fork point even while the source is
  // running: the CLI copies the messages present at that moment, drops transient
  // parts and detaches in-flight tasks, so the fork opens in the same state the
  // dialog was in — just like forking an idle session.
  await forkSession(
    {
      getClient: () => ctx.connection.getClient(),
      state: undefined,
      directory: ctx.directory(sessionId),
      postError: (message) => ctx.post({ type: "error", message }),
      registerWorktreeSession: () => {},
      pushState: () => {},
      notifyForked: (session) => {
        ctx.register(session)
        ctx.forked(session, sessionId)
      },
      registerSession: () => {},
      log: (...args) => console.log("[Kilo New] KiloProvider:", ...args),
    },
    sessionId,
    undefined,
    messageId,
  )
}
