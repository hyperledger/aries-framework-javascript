import type { Logger } from '../logger'
import type { ConnectionRecord } from '../modules/connections'
import type { UnpackedMessageContext, UnpackedMessage } from '../types'
import type { AgentMessage } from './AgentMessage'
import type { TransportSession } from './TransportService'

import { Lifecycle, scoped } from 'tsyringe'

import { AriesFrameworkError } from '../error'
import { ConnectionService } from '../modules/connections'
import { RoutingMessageType as MessageType } from '../modules/routing'
import { JsonTransformer } from '../utils/JsonTransformer'
import { MessageValidator } from '../utils/MessageValidator'
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

    this.logger.debug(`Agent ${this.config.label} received message:`, inboundPackedMessage)

    const unpackedMessage = await this.unpackMessage(inboundPackedMessage as Record<string, unknown>)

    const theirKey = unpackedMessage.sender_verkey
    const ourKey = unpackedMessage.recipient_verkey
    let connection: ConnectionRecord | null = null

    if (theirKey) {
      // Only fetch connection if theirKey is present (AuthCrypt)
      const retrievedConnection = await this.connectionService.findByTheirKey(theirKey)

      // Only attach a connection if connection is ready and recipient key (ourKey)
      // matches the verkey of the connection record.
      if (retrievedConnection?.isReady && retrievedConnection.verkey === ourKey) {
        connection = retrievedConnection
      }
    }

    if (connection && session) {
      this.transportService.saveSession(connection.id, session)
    }

    this.logger.info(`Received message with type '${unpackedMessage.message['@type']}'`, unpackedMessage.message)

    const message = await this.transformMessage(unpackedMessage)
    try {
      await MessageValidator.validate(message)
    } catch (error) {
      this.logger.error(`Error validating message ${message.type}`, {
        errors: error,
        message: message.toJSON(),
      })

      throw error
    }

    const messageContext = new InboundMessageContext(message, {
      connection: connection ?? undefined,
      senderVerkey: theirKey,
      recipientVerkey: ourKey,
    })

    return await this.dispatcher.dispatch(messageContext)
  }

  /**
   * Unpack a message using the envelope service. Will perform extra unpacking steps for forward messages.
   * If message is not packed, it will be returned as is, but in the unpacked message structure
   *
   * @param packedMessage the received, probably packed, message to unpack
   */
  private async unpackMessage(packedMessage: Record<string, unknown>): Promise<UnpackedMessageContext> {
    // If the inbound message has no @type field we assume
    // the message is packed and must be unpacked first
    if (!this.isUnpackedMessage(packedMessage)) {
      let unpackedMessage: UnpackedMessageContext
      try {
        // TODO: handle when the unpacking fails. At the moment this will throw a cryptic
        // indy-sdk error. Eventually we should create a problem report message
        unpackedMessage = await this.envelopeService.unpackMessage(packedMessage)
      } catch (error) {
        this.logger.error('error while unpacking message', error)
        throw error
      }

      // if the message is of type forward we should check whether the
      //  - forward message is intended for us (so unpack inner `msg` and pass that to dispatcher)
      //  - or that the message should be forwarded (pass unpacked forward message with packed `msg` to dispatcher)
      if (unpackedMessage.message['@type'] === MessageType.ForwardMessage) {
        this.logger.debug('unpacking forwarded message', unpackedMessage)

        try {
          unpackedMessage = await this.envelopeService.unpackMessage(unpackedMessage.message.msg as JsonWebKey)
        } catch {
          // To check whether the `to` field is a key belonging to us could be done in two ways.
          // We now just try to unpack, if it errors it means we don't have the key to unpack the message
          // if we can unpack the message we certainly are the owner of the key in the to field.
          // Another approach is to first check whether the key belongs to us and only unpack if so.
          // I think this approach is better, but for now the current approach is easier
          // It is thus okay to silently ignore this error
        }
      }

      return unpackedMessage
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
      throw new AriesFrameworkError(`No message class found for message type "${messageType}"`)
    }

    // Cast the plain JSON object to specific instance of Message extended from AgentMessage
    const message = JsonTransformer.fromJSON(unpackedMessage.message, MessageClass)

    return message
  }
}
