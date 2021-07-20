import type { Agent, Logger } from '../../packages/core/src'
import type { OutboundTransporter } from '../../packages/core/src/transport/OutboundTransporter'
import type { OutboundPackage } from '../../packages/core/src/types'
import type { SubjectMessage } from './SubjectInboundTransport'
import type { Subject } from 'rxjs'

import { InjectionSymbols, AriesFrameworkError } from '../../packages/core/src'

export class SubjectOutboundTransporter implements OutboundTransporter {
  private logger!: Logger
  private ourSubject: Subject<SubjectMessage>
  private subjectMap: { [key: string]: Subject<SubjectMessage> | undefined }

  public supportedSchemes = []

  public constructor(
    ourSubject: Subject<SubjectMessage>,
    subjectMap: { [key: string]: Subject<SubjectMessage> | undefined }
  ) {
    this.ourSubject = ourSubject
    this.subjectMap = subjectMap
  }

  public async start(agent: Agent): Promise<void> {
    this.logger = agent.injectionContainer.resolve(InjectionSymbols.Logger)
  }

  public async stop(): Promise<void> {
    // Nothing required to stop
  }

  public async sendMessage(outboundPackage: OutboundPackage) {
    this.logger.debug(`Sending outbound message to endpoint ${outboundPackage.endpoint}`, {
      endpoint: outboundPackage.endpoint,
    })
    const { payload, endpoint } = outboundPackage

    if (!endpoint) {
      throw new AriesFrameworkError('Cannot send message to subject without endpoint')
    }

    const subject = this.subjectMap[endpoint]

    if (!subject) {
      throw new AriesFrameworkError(`No subject found for endpoint ${endpoint}`)
    }

    subject.next({ message: payload, replySubject: this.ourSubject })
  }
}
