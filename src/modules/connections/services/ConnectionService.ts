import type { AgentMessage } from '../../../agent/AgentMessage'
import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { AckMessage } from '../../common'
import type { ConnectionStateChangedEvent } from '../ConnectionEvents'
import type { CustomConnectionTags } from '../repository/ConnectionRecord'
import type { Verkey } from 'indy-sdk'

import { inject, scoped, Lifecycle } from 'tsyringe'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../constants'
import { signData, unpackAndVerifySignatureDecorator } from '../../../decorators/signature/SignatureDecoratorUtils'
import { AriesFrameworkError } from '../../../error'
import { JsonTransformer } from '../../../utils/JsonTransformer'
import { MessageValidator } from '../../../utils/MessageValidator'
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
import { ConnectionRepository } from '../repository'
import { ConnectionRecord } from '../repository/ConnectionRecord'

@scoped(Lifecycle.ContainerScoped)
export class ConnectionService {
  private wallet: Wallet
  private config: AgentConfig
  private connectionRepository: ConnectionRepository
  private eventEmitter: EventEmitter

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
  }

  /**
   * Create a new connection record containing a connection invitation message
   *
   * @param config config for creation of connection and invitation
   * @returns new connection record
   */
  public async createInvitation(config?: {
    autoAcceptConnection?: boolean
    alias?: string
  }): Promise<ConnectionProtocolMsgReturnType<ConnectionInvitationMessage>> {
    // TODO: public did, multi use
    const connectionRecord = await this.createConnection({
      role: ConnectionRole.Inviter,
      state: ConnectionState.Invited,
      alias: config?.alias,
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
   * with all the information about the invitation stored. Use {@link ConnectionService.createRequest}
   * after calling this function to create a connection request.
   *
   * @param invitation the invitation message to process
   * @returns new connection record.
   */
  public async processInvitation(
    invitation: ConnectionInvitationMessage,
    config?: {
      autoAcceptConnection?: boolean
      alias?: string
    }
  ): Promise<ConnectionRecord> {
    const connectionRecord = await this.createConnection({
      role: ConnectionRole.Invitee,
      state: ConnectionState.Invited,
      alias: config?.alias,
      autoAcceptConnection: config?.autoAcceptConnection,
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
   * with all the new information from the connection request message. Use {@link ConnectionService.createResponse}
   * after calling this function to create a connection response.
   *
   * @param messageContext the message context containing a connection request message
   * @returns updated connection record
   */
  public async processRequest(
    messageContext: InboundMessageContext<ConnectionRequestMessage>
  ): Promise<ConnectionRecord> {
    const { message, recipientVerkey, senderVerkey } = messageContext

    if (!recipientVerkey || !senderVerkey) {
      throw new AriesFrameworkError('Unable to process connection request without senderVerkey or recipientVerkey')
    }

    const connectionRecord = await this.findByVerkey(recipientVerkey)

    if (!connectionRecord) {
      throw new AriesFrameworkError(
        `Unable to process connection request: connection for verkey ${recipientVerkey} not found`
      )
    }

    connectionRecord.assertState(ConnectionState.Invited)
    connectionRecord.assertRole(ConnectionRole.Inviter)

    if (!message.connection.didDoc) {
      throw new AriesFrameworkError('Public DIDs are not supported yet')
    }

    connectionRecord.theirDid = message.connection.did
    connectionRecord.theirDidDoc = message.connection.didDoc
    connectionRecord.threadId = message.id

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
   * with all the new information from the connection response message. Use {@link ConnectionService.createTrustPing}
   * after calling this function to create a trust ping message.
   *
   * @param messageContext the message context containing a connection response message
   * @returns updated connection record
   */
  public async processResponse(
    messageContext: InboundMessageContext<ConnectionResponseMessage>
  ): Promise<ConnectionRecord> {
    const { message, recipientVerkey, senderVerkey } = messageContext

    if (!recipientVerkey || !senderVerkey) {
      throw new AriesFrameworkError('Unable to process connection request without senderVerkey or recipientVerkey')
    }

    const connectionRecord = await this.findByVerkey(recipientVerkey)

    if (!connectionRecord) {
      throw new AriesFrameworkError(
        `Unable to process connection response: connection for verkey ${recipientVerkey} not found`
      )
    }

    connectionRecord.assertState(ConnectionState.Requested)
    connectionRecord.assertRole(ConnectionRole.Invitee)

    const connectionJson = await unpackAndVerifySignatureDecorator(message.connectionSig, this.wallet)

    const connection = JsonTransformer.fromJSON(connectionJson, Connection)
    await MessageValidator.validate(connection)

    // Per the Connection RFC we must check if the key used to sign the connection~sig is the same key
    // as the recipient key(s) in the connection invitation message
    const signerVerkey = message.connectionSig.signer
    const invitationKey = connectionRecord.getTags().invitationKey
    if (signerVerkey !== invitationKey) {
      throw new AriesFrameworkError(
        'Connection object in connection response message is not signed with same key as recipient key in invitation'
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
    const trustPing = new TrustPingMessage({})

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
    const { connection, recipientVerkey } = messageContext

    if (!connection) {
      throw new AriesFrameworkError(
        `Unable to process connection ack: connection for verkey ${recipientVerkey} not found`
      )
    }

    // TODO: This is better addressed in a middleware of some kind because
    // any message can transition the state to complete, not just an ack or trust ping
    if (connection.state === ConnectionState.Responded && connection.role === ConnectionRole.Inviter) {
      await this.updateState(connection, ConnectionState.Complete)
    }

    return connection
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
    autoAcceptConnection?: boolean
    tags?: CustomConnectionTags
  }): Promise<ConnectionRecord> {
    const [did, verkey] = await this.wallet.createDid()

    const publicKey = new Ed25119Sig2018({
      id: `${did}.1`,
      controller: did,
      publicKeyBase58: verkey,
    })

    // IndyAgentService is old service type
    // DidCommService is new service type
    // Include both for better interoperability
    const indyAgentService = new IndyAgentService({
      id: `${did}.IndyAgentService`,
      serviceEndpoint: this.config.getEndpoint(),
      recipientKeys: [verkey],
      routingKeys: this.config.getRoutingKeys(),
    })
    const didCommService = new DidCommService({
      id: `${did}.did-communication`,
      serviceEndpoint: this.config.getEndpoint(),
      recipientKeys: [verkey],
      routingKeys: this.config.getRoutingKeys(),
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
    if (connection && isConnected(connection)) return connection

    // return listener
    return promise
  }
}

export interface ConnectionProtocolMsgReturnType<MessageType extends AgentMessage> {
  message: MessageType
  connectionRecord: ConnectionRecord
}
