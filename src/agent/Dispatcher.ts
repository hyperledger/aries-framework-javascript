import type { OutboundMessage, OutboundPackage } from '../types'
import type { AgentMessage } from './AgentMessage'
import type { Handler } from './Handler'
import type { InboundMessageContext } from './models/InboundMessageContext'

import { inject, Lifecycle, scoped } from 'tsyringe'

import { InjectionSymbols } from '../constants'
import { ReturnRouteTypes } from '../decorators/transport/TransportDecorator'
import { AriesFrameworkError } from '../error/AriesFrameworkError'
import { Logger } from '../logger'

import { MessageSender } from './MessageSender'
import { TransportService } from './TransportService'

@scoped(Lifecycle.ContainerScoped)
class Dispatcher {
  private handlers: Handler[] = []
  private messageSender: MessageSender
  private transportService: TransportService
  private logger: Logger

  public constructor(
    messageSender: MessageSender,
    transportService: TransportService,
    @inject(InjectionSymbols.Logger) logger: Logger
  ) {
    this.messageSender = messageSender
    this.transportService = transportService
    this.logger = logger
  }

  public registerHandler(handler: Handler) {
    this.handlers.push(handler)
  }

  public async dispatch(messageContext: InboundMessageContext): Promise<OutboundMessage | OutboundPackage | undefined> {
    const { message } = messageContext
    const handler = this.getHandlerForType(message.type)

    if (!handler) {
      throw new AriesFrameworkError(`No handler for message type "${message.type}" found`)
    }

    let outboundMessage: OutboundMessage<AgentMessage> | void

    try {
      outboundMessage = await handler.handle(messageContext)
    } catch (error) {
      this.logger.error(`Error handling message with type ${message.type}`, {
        message: message.toJSON(),
        senderVerkey: messageContext.senderVerkey,
        recipientVerkey: messageContext.recipientVerkey,
        connectionId: messageContext.connection?.id,
      })

      throw error
    }

    if (outboundMessage) {
      const threadId = outboundMessage.payload.threadId

      if (!this.transportService.hasInboundEndpoint(outboundMessage.connection)) {
        outboundMessage.payload.setReturnRouting(ReturnRouteTypes.all)
      }

      // Check for return routing, with thread id
      if (message.hasReturnRouting(threadId)) {
        const keys = {
          recipientKeys: messageContext.senderVerkey ? [messageContext.senderVerkey] : [],
          routingKeys: [],
          senderKey: outboundMessage.connection.verkey,
        }
        return await this.messageSender.packMessage(outboundMessage, keys)
      }

      await this.messageSender.sendMessage(outboundMessage)
    }
  }

  private getHandlerForType(messageType: string): Handler | undefined {
    for (const handler of this.handlers) {
      for (const MessageClass of handler.supportedMessages) {
        if (MessageClass.type === messageType) return handler
      }
    }
  }

  public getMessageClassForType(messageType: string): typeof AgentMessage | undefined {
    for (const handler of this.handlers) {
      for (const MessageClass of handler.supportedMessages) {
        if (MessageClass.type === messageType) return MessageClass
      }
    }
  }
}

export { Dispatcher }
