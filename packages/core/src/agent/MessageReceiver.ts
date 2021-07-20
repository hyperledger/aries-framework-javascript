import type { Logger } from '../logger'
import type { UnpackedMessageContext, UnpackedMessage, WireMessage } from '../types'
import type { AgentMessage } from './AgentMessage'
import type { TransportSession } from './TransportService'

import { Lifecycle, scoped } from 'tsyringe'

import { AriesFrameworkError } from '../error'
import { ConnectionService } from '../modules/connections/services/ConnectionService'
import { JsonTransformer } from '../utils/JsonTransformer'
import { replaceLegacyDidSovPrefixOnMessage } from '../utils/messageType'

import { AgentConfig } from './AgentConfig'
import { Dispatcher } from './Dispatcher'
import { EnvelopeService } from './EnvelopeService'
import { TransportService } from './TransportService'
import { InboundMessageContext } from './models/InboundMessageContext'

@scoped(Lifecycle.ContainerScoped)
export class MessageReceiver {
  private config: AgentConfig
  private envelopeService: EnvelopeService
  private transportService: TransportService
  private connectionService: ConnectionService
  private dispatcher: Dispatcher
  private logger: Logger

  public constructor(
    config: AgentConfig,
    envelopeService: EnvelopeService,
    transportService: TransportService,
    connectionService: ConnectionService,
    dispatcher: Dispatcher
  ) {
    this.config = config
    this.envelopeService = envelopeService
    this.transportService = transportService
    this.connectionService = connectionService
    this.dispatcher = dispatcher
    this.logger = this.config.logger
  }

  /**
   * Receive and handle an inbound DIDComm message. It will unpack the message, transform it
   * to it's corresponding message class and finally dispatch it to the dispatcher.
   *
   * @param inboundPackedMessage the message to receive and handle
   */
  public async receiveMessage(inboundPackedMessage: unknown, session?: TransportSession) {
    if (typeof inboundPackedMessage !== 'object' || inboundPackedMessage == null) {
      throw new AriesFrameworkError('Invalid message received. Message should be object')
    }

    this.logger.debug(`Agent ${this.config.label} received message`)

    const unpackedMessage = await this.unpackMessage(inboundPackedMessage as WireMessage)
    const senderKey = unpackedMessage.senderVerkey
    const recipientKey = unpackedMessage.recipientVerkey

    let connection = undefined
    if (senderKey && recipientKey) {
      // TODO: only attach if theirKey is present. Otherwise a connection that may not be complete, validated or correct will
      // be attached to the message context. See #76
      connection = (await this.connectionService.findByVerkey(recipientKey)) || undefined

      // We check whether the sender key is the same as the key we have stored in the connection
      // otherwise everyone could send messages to our key and we would just accept
      // it as if it was send by the key of the connection.
      if (connection && connection.theirKey != null && connection.theirKey != senderKey) {
        throw new AriesFrameworkError(
          `Inbound message 'sender_key' ${senderKey} is different from connection.theirKey ${connection.theirKey}`
        )
      }
    }

    this.logger.info(
      `Received message with type '${unpackedMessage.message['@type']}' from connection ${connection?.id} (${connection?.theirLabel})`,
      unpackedMessage.message
    )

    const message = await this.transformMessage(unpackedMessage)
    const messageContext = new InboundMessageContext(message, {
      connection,
      senderVerkey: senderKey,
      recipientVerkey: recipientKey,
    })

    // We want to save a session if there is a chance of returning outbound message via inbound transport.
    // That can happen when inbound message has `return_route` set to `all` or `thread`.
    // If `return_route` defines just `thread`, we decide later whether to use session according to outbound message `threadId`.
    if (senderKey && recipientKey && message.hasAnyReturnRoute() && session) {
      const keys = {
        recipientKeys: [senderKey],
        routingKeys: [],
        senderKey: recipientKey,
      }
      session.keys = keys
      session.inboundMessage = message
      session.connection = connection
      this.transportService.saveSession(session)
    }

    await this.dispatcher.dispatch(messageContext)
  }

  /**
   * Unpack a message using the envelope service.
   * If message is not packed, it will be returned as is, but in the unpacked message structure
   *
   * @param packedMessage the received, probably packed, message to unpack
   */
  private async unpackMessage(packedMessage: WireMessage): Promise<UnpackedMessageContext> {
    // If the inbound message has no @type field we assume
    // the message is packed and must be unpacked first
    if (!this.isUnpackedMessage(packedMessage)) {
      try {
        return await this.envelopeService.unpackMessage(packedMessage)
      } catch (error) {
        this.logger.error('error while unpacking message', {
          error,
          packedMessage,
          errorMessage: error.message,
        })
        throw error
      }
    }

    // If the message does have an @type field we assume
    // the message is already unpacked an use it directly
    else {
      const unpackedMessage: UnpackedMessageContext = { message: packedMessage }
      return unpackedMessage
    }
  }

  private isUnpackedMessage(message: Record<string, unknown>): message is UnpackedMessage {
    return '@type' in message
  }

  /**
   * Transform an unpacked DIDComm message into it's corresponding message class. Will look at all message types in the registered handlers.
   *
   * @param unpackedMessage the unpacked message for which to transform the message in to a class instance
   */
  private async transformMessage(unpackedMessage: UnpackedMessageContext): Promise<AgentMessage> {
    // replace did:sov:BzCbsNYhMrjHiqZDTUASHg;spec prefix for message type with https://didcomm.org
    replaceLegacyDidSovPrefixOnMessage(unpackedMessage.message)

    const messageType = unpackedMessage.message['@type']
    const MessageClass = this.dispatcher.getMessageClassForType(messageType)

    if (!MessageClass) {
      throw new AriesFrameworkError(`No handler for message type "${messageType}" found`)
    }

    // Cast the plain JSON object to specific instance of Message extended from AgentMessage
    const message = JsonTransformer.fromJSON(unpackedMessage.message, MessageClass)

    return message
  }
}
