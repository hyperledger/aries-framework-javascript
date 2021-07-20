import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { WireMessage } from '../../../types'
import type { BatchPickupMessage } from '../messages'

import { inject, scoped, Lifecycle } from 'tsyringe'

import { createOutboundMessage } from '../../../agent/helpers'
import { InjectionSymbols } from '../../../constants'
import { MessageRepository } from '../../../storage/MessageRepository'
import { BatchMessage, BatchMessageMessage } from '../messages'

@scoped(Lifecycle.ContainerScoped)
export class MessagePickupService {
  private messageRepository: MessageRepository

  public constructor(@inject(InjectionSymbols.MessageRepository) messageRepository: MessageRepository) {
    this.messageRepository = messageRepository
  }

  public async batch(messageContext: InboundMessageContext<BatchPickupMessage>) {
    // Assert ready connection
    const connection = messageContext.assertReadyConnection()

    const { message } = messageContext
    const messages = this.messageRepository.takeFromQueue(connection.id, message.batchSize)

    // TODO: each message should be stored with an id. to be able to conform to the id property
    // of batch message
    const batchMessages = messages.map(
      (msg) =>
        new BatchMessageMessage({
          message: msg,
        })
    )

    const batchMessage = new BatchMessage({
      messages: batchMessages,
    })

    return createOutboundMessage(connection, batchMessage)
  }

  public queueMessage(connectionId: string, message: WireMessage) {
    this.messageRepository.add(connectionId, message)
  }
}
