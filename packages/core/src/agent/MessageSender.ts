import type { DidCommService, ConnectionRecord } from '..'
import type { OutboundTransporter } from '../transport/OutboundTransporter'
import type { OutboundMessage, OutboundPackage, WireMessage } from '../types'
import type { AgentMessage } from './AgentMessage'
import type { EnvelopeKeys } from './EnvelopeService'
import type { TransportSession } from './TransportService'

import { inject, Lifecycle, scoped } from 'tsyringe'

import { DID_COMM_TRANSPORT_QUEUE, InjectionSymbols } from '../constants'
import { ReturnRouteTypes } from '../decorators/transport/TransportDecorator'
import { AriesFrameworkError } from '../error'
import { Logger } from '../logger'
import { MessageRepository } from '../storage/MessageRepository'

import { EnvelopeService } from './EnvelopeService'
import { TransportService } from './TransportService'

@scoped(Lifecycle.ContainerScoped)
export class MessageSender {
  private envelopeService: EnvelopeService
  private transportService: TransportService
  private messageRepository: MessageRepository
  private logger: Logger
  private _outboundTransporter?: OutboundTransporter

  public constructor(
    envelopeService: EnvelopeService,
    transportService: TransportService,
    @inject(InjectionSymbols.MessageRepository) messageRepository: MessageRepository,
    @inject(InjectionSymbols.Logger) logger: Logger
  ) {
    this.envelopeService = envelopeService
    this.transportService = transportService
    this.messageRepository = messageRepository
    this.logger = logger
  }

  public setOutboundTransporter(outboundTransporter: OutboundTransporter) {
    this._outboundTransporter = outboundTransporter
  }

  public get outboundTransporter() {
    return this._outboundTransporter
  }

  public async packMessage({
    keys,
    message,
    endpoint,
  }: {
    keys: EnvelopeKeys
    message: AgentMessage
    endpoint: string
  }): Promise<OutboundPackage> {
    const wireMessage = await this.envelopeService.packMessage(message, keys)

    return {
      payload: wireMessage,
      responseRequested: message.hasAnyReturnRoute(),
      endpoint,
    }
  }

  private async sendMessageToSession(session: TransportSession, message: AgentMessage) {
    this.logger.debug(`Existing ${session.type} transport session has been found.`, {
      keys: session.keys,
    })
    if (!session.keys) {
      throw new AriesFrameworkError(`There are no keys for the given ${session.type} transport session.`)
    }
    const wireMessage = await this.envelopeService.packMessage(message, session.keys)

    await session.send(wireMessage)
  }

  public async sendPackage({
    connection,
    packedMessage,
  }: {
    connection: ConnectionRecord
    packedMessage: WireMessage
  }) {
    // Try to send to already open session
    const session = this.transportService.findSessionByConnectionId(connection.id)
    if (session?.inboundMessage?.hasReturnRouting()) {
      try {
        await session.send(packedMessage)
        return
      } catch (error) {
        this.logger.info(`Sending packed message via session failed with error: ${error.message}.`, error)
      }
    }

    // Retrieve DIDComm services
    const allServices = this.transportService.findDidCommServices(connection)
    const reachableServices = allServices.filter((s) => !isDidCommTransportQueue(s.serviceEndpoint))
    const queueService = allServices.find((s) => isDidCommTransportQueue(s.serviceEndpoint))

    this.logger.debug(
      `Found ${allServices.length} services for message to connection '${connection.id}' (${connection.theirLabel})`
    )

    if (!this.outboundTransporter) {
      throw new AriesFrameworkError('Agent has no outbound transporter!')
    }

    // Loop trough all available services and try to send the message
    for await (const service of reachableServices) {
      this.logger.debug(`Sending outbound message to service:`, { service })
      try {
        await this.outboundTransporter.sendMessage({
          payload: packedMessage,
          endpoint: service.serviceEndpoint,
        })
        return
      } catch (error) {
        this.logger.debug(
          `Sending outbound message to service with id ${service.id} failed with the following error:`,
          {
            message: error.message,
            error: error,
          }
        )
      }
    }

    // We didn't succeed to send the message over open session, or directly to serviceEndpoint
    // If the other party shared a queue service endpoint in their did doc we queue the message
    if (queueService) {
      this.logger.debug(`Queue packed message for connection ${connection.id} (${connection.theirLabel})`)
      this.messageRepository.add(connection.id, packedMessage)
      return
    }

    // Message is undeliverable
    this.logger.error(`Message is undeliverable to connection ${connection.id} (${connection.theirLabel})`, {
      message: packedMessage,
      connection,
    })
    throw new AriesFrameworkError(`Message is undeliverable to connection ${connection.id} (${connection.theirLabel})`)
  }

  public async sendMessage(outboundMessage: OutboundMessage) {
    if (!this.outboundTransporter) {
      throw new AriesFrameworkError('Agent has no outbound transporter!')
    }

    const { connection, payload } = outboundMessage

    this.logger.debug('Send outbound message', {
      message: payload,
      connectionId: connection.id,
    })

    // Try to send to already open session
    const session = this.transportService.findSessionByConnectionId(connection.id)
    if (session?.inboundMessage?.hasReturnRouting(payload.threadId)) {
      try {
        await this.sendMessageToSession(session, payload)
        return
      } catch (error) {
        this.logger.info(`Sending an outbound message via session failed with error: ${error.message}.`, error)
      }
    }

    // Retrieve DIDComm services
    const allServices = this.transportService.findDidCommServices(connection)
    const reachableServices = allServices.filter((s) => !isDidCommTransportQueue(s.serviceEndpoint))
    const queueService = allServices.find((s) => isDidCommTransportQueue(s.serviceEndpoint))

    this.logger.debug(
      `Found ${allServices.length} services for message to connection '${connection.id}' (${connection.theirLabel})`
    )

    // Loop trough all available services and try to send the message
    for await (const service of reachableServices) {
      try {
        // Enable return routing if the
        const shouldUseReturnRoute = !this.transportService.hasInboundEndpoint(connection.didDoc)

        await this.sendMessageToService({
          message: payload,
          service,
          senderKey: connection.verkey,
          returnRoute: shouldUseReturnRoute,
        })
        return
      } catch (error) {
        this.logger.debug(
          `Sending outbound message to service with id ${service.id} failed with the following error:`,
          {
            message: error.message,
            error: error,
          }
        )
      }
    }

    // We didn't succeed to send the message over open session, or directly to serviceEndpoint
    // If the other party shared a queue service endpoint in their did doc we queue the message
    if (queueService) {
      this.logger.debug(`Queue message for connection ${connection.id} (${connection.theirLabel})`)

      const keys = {
        recipientKeys: queueService.recipientKeys,
        routingKeys: queueService.routingKeys || [],
        senderKey: connection.verkey,
      }

      const wireMessage = await this.envelopeService.packMessage(payload, keys)
      this.messageRepository.add(connection.id, wireMessage)
      return
    }

    // Message is undeliverable
    this.logger.error(`Message is undeliverable to connection ${connection.id} (${connection.theirLabel})`, {
      message: payload,
      connection,
    })
    throw new AriesFrameworkError(`Message is undeliverable to connection ${connection.id} (${connection.theirLabel})`)
  }

  public async sendMessageToService({
    message,
    service,
    senderKey,
    returnRoute,
  }: {
    message: AgentMessage
    service: DidCommService
    senderKey: string
    returnRoute?: boolean
  }) {
    if (!this.outboundTransporter) {
      throw new AriesFrameworkError('Agent has no outbound transporter!')
    }

    this.logger.debug(`Sending outbound message to service:`, { messageId: message.id, service })

    const keys = {
      recipientKeys: service.recipientKeys,
      routingKeys: service.routingKeys || [],
      senderKey,
    }

    // Set return routing for message if requested
    if (returnRoute) {
      message.setReturnRouting(ReturnRouteTypes.all)
    }

    const outboundPackage = await this.packMessage({ message, keys, endpoint: service.serviceEndpoint })
    await this.outboundTransporter.sendMessage(outboundPackage)
  }
}

export function isDidCommTransportQueue(serviceEndpoint: string): serviceEndpoint is typeof DID_COMM_TRANSPORT_QUEUE {
  return serviceEndpoint === DID_COMM_TRANSPORT_QUEUE
}
