import type { AgentMessage } from '../../../agent/AgentMessage'
import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { Logger } from '../../../logger'
import type { AckMessage } from '../../common'
import type { ConnectionStateChangedEvent } from '../ConnectionEvents'
import type { CustomConnectionTags } from '../repository/ConnectionRecord'
import type { Did, Verkey } from 'indy-sdk'

import { validateOrReject } from 'class-validator'
import { inject, scoped, Lifecycle } from 'tsyringe'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../constants'
import { signData, unpackAndVerifySignatureDecorator } from '../../../decorators/signature/SignatureDecoratorUtils'
import { AriesFrameworkError } from '../../../error'
import { JsonTransformer } from '../../../utils/JsonTransformer'
import { Wallet } from '../../../wallet/Wallet'
import { ConnectionEventTypes } from '../ConnectionEvents'
import {
  ConnectionInvitationMessage,
  ConnectionRequestMessage,
  ConnectionResponseMessage,
  TrustPingMessage,
} from '../messages'
import {
  Connection,
  ConnectionState,
  ConnectionRole,
  DidDoc,
  Ed25119Sig2018,
  authenticationTypes,
  ReferencedAuthentication,
  DidCommService,
  IndyAgentService,
} from '../models'
import { ConnectionRecord } from '../repository/ConnectionRecord'
import { ConnectionRepository } from '../repository/ConnectionRepository'

@scoped(Lifecycle.ContainerScoped)
export class ConnectionService {
  private wallet: Wallet
  private config: AgentConfig
  private connectionRepository: ConnectionRepository
  private eventEmitter: EventEmitter
  private logger: Logger

  public constructor(
    @inject(InjectionSymbols.Wallet) wallet: Wallet,
    config: AgentConfig,
    connectionRepository: ConnectionRepository,
    eventEmitter: EventEmitter
  ) {
    this.wallet = wallet
    this.config = config
    this.connectionRepository = connectionRepository
    this.eventEmitter = eventEmitter
    this.logger = config.logger
  }

  /**
   * Create a new connection record containing a connection invitation message
   *
   * @param config config for creation of connection and invitation
   * @returns new connection record
   */
  public async createInvitation(config: {
    routing: Routing
    autoAcceptConnection?: boolean
    alias?: string
  }): Promise<ConnectionProtocolMsgReturnType<ConnectionInvitationMessage>> {
    // TODO: public did, multi use
    const connectionRecord = await this.createConnection({
      role: ConnectionRole.Inviter,
      state: ConnectionState.Invited,
      alias: config?.alias,
      routing: config.routing,
      autoAcceptConnection: config?.autoAcceptConnection,
    })

    const { didDoc } = connectionRecord
    const [service] = didDoc.didCommServices
    const invitation = new ConnectionInvitationMessage({
      label: this.config.label,
      recipientKeys: service.recipientKeys,
      serviceEndpoint: service.serviceEndpoint,
      routingKeys: service.routingKeys,
    })

    connectionRecord.invitation = invitation

    await this.connectionRepository.update(connectionRecord)

    this.eventEmitter.emit<ConnectionStateChangedEvent>({
      type: ConnectionEventTypes.ConnectionStateChanged,
      payload: {
        connectionRecord: connectionRecord,
        previousState: null,
      },
    })

    return { connectionRecord: connectionRecord, message: invitation }
  }

  /**
   * Process a received invitation message. This will not accept the invitation
   * or send an invitation request message. It will only create a connection record
   * with all the information about the invitation stored. Use {@link ConnectionService#createRequest}
   * after calling this function to create a connection request.
   *
   * @param invitation the invitation message to process
   * @returns new connection record.
   */
  public async processInvitation(
    invitation: ConnectionInvitationMessage,
    config: {
      routing: {
        endpoint: string
        verkey: string
        did: Did
        routingKeys: string[]
      }
      autoAcceptConnection?: boolean
      alias?: string
    }
  ): Promise<ConnectionRecord> {
    const connectionRecord = await this.createConnection({
      role: ConnectionRole.Invitee,
      state: ConnectionState.Invited,
      alias: config?.alias,
      theirLabel: invitation.label,
      autoAcceptConnection: config?.autoAcceptConnection,
      routing: config.routing,
      invitation,
      tags: {
        invitationKey: invitation.recipientKeys && invitation.recipientKeys[0],
      },
    })
    await this.connectionRepository.update(connectionRecord)
    this.eventEmitter.emit<ConnectionStateChangedEvent>({
      type: ConnectionEventTypes.ConnectionStateChanged,
      payload: {
        connectionRecord: connectionRecord,
        previousState: null,
      },
    })

    return connectionRecord
  }

  /**
   * Create a connection request message for the connection with the specified connection id.
   *
   * @param connectionId the id of the connection for which to create a connection request
   * @returns outbound message containing connection request
   */
  public async createRequest(connectionId: string): Promise<ConnectionProtocolMsgReturnType<ConnectionRequestMessage>> {
    const connectionRecord = await this.connectionRepository.getById(connectionId)

    connectionRecord.assertState(ConnectionState.Invited)
    connectionRecord.assertRole(ConnectionRole.Invitee)

    const connectionRequest = new ConnectionRequestMessage({
      label: this.config.label,
      did: connectionRecord.did,
      didDoc: connectionRecord.didDoc,
    })

    await this.updateState(connectionRecord, ConnectionState.Requested)

    return {
      connectionRecord: connectionRecord,
      message: connectionRequest,
    }
  }

  /**
   * Process a received connection request message. This will not accept the connection request
   * or send a connection response message. It will only update the existing connection record
   * with all the new information from the connection request message. Use {@link ConnectionService#createResponse}
   * after calling this function to create a connection response.
   *
   * @param messageContext the message context containing a connection request message
   * @returns updated connection record
   */
  public async processRequest(
    messageContext: InboundMessageContext<ConnectionRequestMessage>
  ): Promise<ConnectionRecord> {
    const { message, connection: connectionRecord, recipientVerkey } = messageContext

    if (!connectionRecord) {
      throw new AriesFrameworkError(`Connection for verkey ${recipientVerkey} not found!`)
    }
    connectionRecord.assertState(ConnectionState.Invited)
    connectionRecord.assertRole(ConnectionRole.Inviter)

    // TODO: validate using class-validator
    if (!message.connection) {
      throw new AriesFrameworkError('Invalid message')
    }

    connectionRecord.theirDidDoc = message.connection.didDoc
    connectionRecord.theirLabel = message.label
    connectionRecord.threadId = message.id
    connectionRecord.theirDid = message.connection.did

    if (!connectionRecord.theirKey) {
      throw new AriesFrameworkError(`Connection with id ${connectionRecord.id} has no recipient keys.`)
    }

    await this.updateState(connectionRecord, ConnectionState.Requested)

    return connectionRecord
  }

  /**
   * Create a connection response message for the connection with the specified connection id.
   *
   * @param connectionId the id of the connection for which to create a connection response
   * @returns outbound message containing connection response
   */
  public async createResponse(
    connectionId: string
  ): Promise<ConnectionProtocolMsgReturnType<ConnectionResponseMessage>> {
    const connectionRecord = await this.connectionRepository.getById(connectionId)

    connectionRecord.assertState(ConnectionState.Requested)
    connectionRecord.assertRole(ConnectionRole.Inviter)

    const connection = new Connection({
      did: connectionRecord.did,
      didDoc: connectionRecord.didDoc,
    })

    const connectionJson = JsonTransformer.toJSON(connection)

    if (!connectionRecord.threadId) {
      throw new AriesFrameworkError(`Connection record with id ${connectionId} does not have a thread id`)
    }

    const connectionResponse = new ConnectionResponseMessage({
      threadId: connectionRecord.threadId,
      connectionSig: await signData(connectionJson, this.wallet, connectionRecord.verkey),
    })

    await this.updateState(connectionRecord, ConnectionState.Responded)

    return {
      connectionRecord: connectionRecord,
      message: connectionResponse,
    }
  }

  /**
   * Process a received connection response message. This will not accept the connection request
   * or send a connection acknowledgement message. It will only update the existing connection record
   * with all the new information from the connection response message. Use {@link ConnectionService#createTrustPing}
   * after calling this function to create a trust ping message.
   *
   * @param messageContext the message context containing a connection response message
   * @returns updated connection record
   */
  public async processResponse(
    messageContext: InboundMessageContext<ConnectionResponseMessage>
  ): Promise<ConnectionRecord> {
    const { message, connection: connectionRecord, recipientVerkey } = messageContext

    if (!connectionRecord) {
      throw new AriesFrameworkError(`Connection for verkey ${recipientVerkey} not found!`)
    }
    connectionRecord.assertState(ConnectionState.Requested)
    connectionRecord.assertRole(ConnectionRole.Invitee)

    const connectionJson = await unpackAndVerifySignatureDecorator(message.connectionSig, this.wallet)

    const connection = JsonTransformer.fromJSON(connectionJson, Connection)
    // TODO: throw framework error stating the connection object is invalid
    await validateOrReject(connection)

    // Per the Connection RFC we must check if the key used to sign the connection~sig is the same key
    // as the recipient key(s) in the connection invitation message
    const signerVerkey = message.connectionSig.signer
    const invitationKey = connectionRecord.getTags().invitationKey
    if (signerVerkey !== invitationKey) {
      throw new AriesFrameworkError(
        'Connection in connection response is not signed with same key as recipient key in invitation'
      )
    }

    connectionRecord.theirDid = connection.did
    connectionRecord.theirDidDoc = connection.didDoc
    connectionRecord.threadId = message.threadId

    if (!connectionRecord.theirKey) {
      throw new AriesFrameworkError(`Connection with id ${connectionRecord.id} has no recipient keys.`)
    }

    await this.updateState(connectionRecord, ConnectionState.Responded)
    return connectionRecord
  }

  /**
   * Create a trust ping message for the connection with the specified connection id.
   *
   * @param connectionId the id of the connection for which to create a trust ping message
   * @returns outbound message containing trust ping message
   */
  public async createTrustPing(connectionId: string): Promise<ConnectionProtocolMsgReturnType<TrustPingMessage>> {
    const connectionRecord = await this.connectionRepository.getById(connectionId)

    connectionRecord.assertState([ConnectionState.Responded, ConnectionState.Complete])

    // TODO:
    //  - create ack message
    //  - allow for options
    //  - maybe this shouldn't be in the connection service?
    const trustPing = new TrustPingMessage()

    await this.updateState(connectionRecord, ConnectionState.Complete)

    return {
      connectionRecord: connectionRecord,
      message: trustPing,
    }
  }

  /**
   * Process a received ack message. This will update the state of the connection
   * to Completed if this is not already the case.
   *
   * @param messageContext the message context containing an ack message
   * @returns updated connection record
   */
  public async processAck(messageContext: InboundMessageContext<AckMessage>): Promise<ConnectionRecord> {
    const connection = messageContext.connection

    if (!connection) {
      throw new AriesFrameworkError(`Connection for verkey ${messageContext.recipientVerkey} not found`)
    }

    // TODO: This is better addressed in a middleware of some kind because
    // any message can transition the state to complete, not just an ack or trust ping
    if (connection.state === ConnectionState.Responded && connection.role === ConnectionRole.Inviter) {
      await this.updateState(connection, ConnectionState.Complete)
    }

    return connection
  }

  /**
   * Assert that an inbound message either has a connection associated with it,
   * or has everything correctly set up for connection-less exchange.
   *
   * @param messageContext - the inbound message context
   */
  public assertConnectionOrServiceDecorator(
    messageContext: InboundMessageContext,
    {
      previousSentMessage,
      previousReceivedMessage,
    }: {
      previousSentMessage?: AgentMessage
      previousReceivedMessage?: AgentMessage
    } = {}
  ) {
    const { connection, message } = messageContext

    // Check if we have a ready connection. Verification is already done somewhere else. Return
    if (connection) {
      connection.assertReady()
      this.logger.debug(`Processing message with id ${message.id} and connection id ${connection.id}`, {
        type: message.type,
      })
    } else {
      this.logger.debug(`Processing connection-less message with id ${message.id}`, {
        type: message.type,
      })

      if (previousSentMessage) {
        // If we have previously sent a message, it is not allowed to receive an OOB/unpacked message
        if (!messageContext.recipientVerkey) {
          throw new AriesFrameworkError(
            'Cannot verify service without recipientKey on incoming message (received unpacked message)'
          )
        }

        // Check if the inbound message recipient key is present
        // in the recipientKeys of previously sent message ~service decorator
        if (
          !previousSentMessage?.service ||
          !previousSentMessage.service.recipientKeys.includes(messageContext.recipientVerkey)
        ) {
          throw new AriesFrameworkError(
            'Previously sent message ~service recipientKeys does not include current received message recipient key'
          )
        }
      }

      if (previousReceivedMessage) {
        // If we have previously received a message, it is not allowed to receive an OOB/unpacked/AnonCrypt message
        if (!messageContext.senderVerkey) {
          throw new AriesFrameworkError(
            'Cannot verify service without senderKey on incoming message (received AnonCrypt or unpacked message)'
          )
        }

        // Check if the inbound message sender key is present
        // in the recipientKeys of previously received message ~service decorator
        if (
          !previousReceivedMessage.service ||
          !previousReceivedMessage.service.recipientKeys.includes(messageContext.senderVerkey)
        ) {
          throw new AriesFrameworkError(
            'Previously received message ~service recipientKeys does not include current received message sender key'
          )
        }
      }

      // If message is received unpacked/, we need to make sure it included a ~service decorator
      if (!message.service && (!messageContext.senderVerkey || !messageContext.recipientVerkey)) {
        throw new AriesFrameworkError('Message without senderKey and recipientKey must have ~service decorator')
      }
    }
  }

  public async updateState(connectionRecord: ConnectionRecord, newState: ConnectionState) {
    const previousState = connectionRecord.state
    connectionRecord.state = newState
    await this.connectionRepository.update(connectionRecord)

    this.eventEmitter.emit<ConnectionStateChangedEvent>({
      type: ConnectionEventTypes.ConnectionStateChanged,
      payload: {
        connectionRecord: connectionRecord,
        previousState,
      },
    })
  }

  /**
   * Retrieve all connections records
   *
   * @returns List containing all connection records
   */
  public getAll() {
    return this.connectionRepository.getAll()
  }

  /**
   * Retrieve a connection record by id
   *
   * @param connectionId The connection record id
   * @throws {RecordNotFoundError} If no record is found
   * @return The connection record
   *
   */
  public getById(connectionId: string): Promise<ConnectionRecord> {
    return this.connectionRepository.getById(connectionId)
  }

  /**
   * Find a connection record by id
   *
   * @param connectionId the connection record id
   * @returns The connection record or null if not found
   */
  public findById(connectionId: string): Promise<ConnectionRecord | null> {
    return this.connectionRepository.findById(connectionId)
  }

  /**
   * Find connection by verkey.
   *
   * @param verkey the verkey to search for
   * @returns the connection record, or null if not found
   * @throws {RecordDuplicateError} if multiple connections are found for the given verkey
   */
  public findByVerkey(verkey: Verkey): Promise<ConnectionRecord | null> {
    return this.connectionRepository.findSingleByQuery({
      verkey,
    })
  }

  /**
   * Find connection by their verkey.
   *
   * @param verkey the verkey to search for
   * @returns the connection record, or null if not found
   * @throws {RecordDuplicateError} if multiple connections are found for the given verkey
   */
  public findByTheirKey(verkey: Verkey): Promise<ConnectionRecord | null> {
    return this.connectionRepository.findSingleByQuery({
      theirKey: verkey,
    })
  }

  /**
   * Retrieve a connection record by thread id
   *
   * @param threadId The thread id
   * @throws {RecordNotFoundError} If no record is found
   * @throws {RecordDuplicateError} If multiple records are found
   * @returns The connection record
   */
  public getByThreadId(threadId: string): Promise<ConnectionRecord> {
    return this.connectionRepository.getSingleByQuery({ threadId })
  }

  private async createConnection(options: {
    role: ConnectionRole
    state: ConnectionState
    invitation?: ConnectionInvitationMessage
    alias?: string
    routing: Routing
    theirLabel?: string
    autoAcceptConnection?: boolean
    tags?: CustomConnectionTags
  }): Promise<ConnectionRecord> {
    const { endpoint, did, verkey, routingKeys } = options.routing

    const publicKey = new Ed25119Sig2018({
      // TODO: shouldn't this name be ED25519
      id: `${did}#1`,
      controller: did,
      publicKeyBase58: verkey,
    })

    // IndyAgentService is old service type
    // DidCommService is new service type
    // Include both for better interoperability
    const indyAgentService = new IndyAgentService({
      id: `${did}#IndyAgentService`,
      serviceEndpoint: endpoint,
      recipientKeys: [verkey],
      routingKeys: routingKeys,
    })
    const didCommService = new DidCommService({
      id: `${did}#did-communication`,
      serviceEndpoint: endpoint,
      recipientKeys: [verkey],
      routingKeys: routingKeys,
      // Prefer DidCommService over IndyAgentService
      priority: 1,
    })

    // TODO: abstract the second parameter for ReferencedAuthentication away. This can be
    // inferred from the publicKey class instance
    const auth = new ReferencedAuthentication(publicKey, authenticationTypes[publicKey.type])

    const didDoc = new DidDoc({
      id: did,
      authentication: [auth],
      service: [didCommService, indyAgentService],
      publicKey: [publicKey],
    })

    const connectionRecord = new ConnectionRecord({
      did,
      didDoc,
      verkey,
      state: options.state,
      role: options.role,
      tags: options.tags,
      invitation: options.invitation,
      alias: options.alias,
      theirLabel: options.theirLabel,
      autoAcceptConnection: options.autoAcceptConnection,
    })

    await this.connectionRepository.save(connectionRecord)
    return connectionRecord
  }

  public async returnWhenIsConnected(connectionId: string): Promise<ConnectionRecord> {
    const isConnected = (connection: ConnectionRecord) => {
      return connection.id === connectionId && connection.state === ConnectionState.Complete
    }

    const promise = new Promise<ConnectionRecord>((resolve) => {
      const listener = ({ payload: { connectionRecord } }: ConnectionStateChangedEvent) => {
        if (isConnected(connectionRecord)) {
          this.eventEmitter.off<ConnectionStateChangedEvent>(ConnectionEventTypes.ConnectionStateChanged, listener)
          resolve(connectionRecord)
        }
      }

      this.eventEmitter.on<ConnectionStateChangedEvent>(ConnectionEventTypes.ConnectionStateChanged, listener)
    })

    // Check if already done
    const connection = await this.connectionRepository.findById(connectionId)
    if (connection && isConnected(connection)) return connection //TODO: check if this leaves trailing listeners behind?

    // return listener
    return promise
  }
}

export interface Routing {
  endpoint: string
  verkey: string
  did: Did
  routingKeys: string[]
}

export interface ConnectionProtocolMsgReturnType<MessageType extends AgentMessage> {
  message: MessageType
  connectionRecord: ConnectionRecord
}
