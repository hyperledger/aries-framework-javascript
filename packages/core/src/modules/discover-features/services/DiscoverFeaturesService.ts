import { Lifecycle, scoped } from 'tsyringe'

import { Dispatcher } from '../../../agent/Dispatcher'
import { DiscoverFeaturesQueryMessage, DiscoverFeaturesDiscloseMessage } from '../messages'

@scoped(Lifecycle.ContainerScoped)
export class DiscoverFeaturesService {
  private dispatcher: Dispatcher

  public constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher
  }

  public async createQuery(options: { query: string; comment?: string }) {
    const queryMessage = new DiscoverFeaturesQueryMessage(options)

    return queryMessage
  }

  public async createDisclose(queryMessage: DiscoverFeaturesQueryMessage) {
    const { query } = queryMessage

    const messageTypes = this.dispatcher.supportedMessageTypes
    const messageFamilies = Array.from(new Set(messageTypes.map((m) => m.substring(0, m.lastIndexOf('/') + 1))))
    let protocols: string[] = []

    if (query === '*') {
      protocols = messageFamilies
    } else if (query.endsWith('*')) {
      const match = query.slice(0, -1)
      protocols = messageFamilies.filter((m) => m.startsWith(match))
    } else if (messageFamilies.includes(query)) {
      protocols = [query]
    }

    const discloseMessage = new DiscoverFeaturesDiscloseMessage({
      threadId: queryMessage.threadId,
      protocols: protocols.map((protocolId) => ({ protocolId })),
    })

    return discloseMessage
  }
}
