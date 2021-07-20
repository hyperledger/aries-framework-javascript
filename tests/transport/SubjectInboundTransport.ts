import type { InboundTransporter, Agent } from '../../packages/core/src'
import type { TransportSession } from '../../packages/core/src/agent/TransportService'
import type { WireMessage } from '../../packages/core/src/types'
import type { Subject, Subscription } from 'rxjs'

import { AgentConfig } from '../../packages/core/src/agent/AgentConfig'
import { uuid } from '../../packages/core/src/utils/uuid'

export type SubjectMessage = { message: WireMessage; replySubject?: Subject<SubjectMessage> }

export class SubjectInboundTransporter implements InboundTransporter {
  private subject: Subject<SubjectMessage>
  private subscription?: Subscription

  public constructor(subject: Subject<SubjectMessage>) {
    this.subject = subject
  }

  public async start(agent: Agent) {
    this.subscribe(agent)
  }

  public async stop() {
    this.subscription?.unsubscribe()
  }

  private subscribe(agent: Agent) {
    const logger = agent.injectionContainer.resolve(AgentConfig).logger

    this.subscription = this.subject.subscribe({
      next: async ({ message, replySubject }: SubjectMessage) => {
        logger.test('Received message')

        let session
        if (replySubject) {
          session = new SubjectTransportSession(`subject-session-${uuid()}`, replySubject)
        }

        await agent.receiveMessage(message, session)
      },
    })
  }
}

export class SubjectTransportSession implements TransportSession {
  public id: string
  public readonly type = 'subject'
  private replySubject: Subject<SubjectMessage>

  public constructor(id: string, replySubject: Subject<SubjectMessage>) {
    this.id = id
    this.replySubject = replySubject
  }

  public async send(wireMessage: WireMessage): Promise<void> {
    this.replySubject.next({ message: wireMessage })
  }
}
