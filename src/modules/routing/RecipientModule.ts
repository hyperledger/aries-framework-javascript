import { Lifecycle, scoped } from 'tsyringe'
import type { Verkey } from 'indy-sdk'

import { AgentConfig } from '../../agent/AgentConfig'
import { assertConnection, RecipientService, waitForEvent } from './services'
import { KeylistUpdateResponseHandler } from './handlers/KeylistUpdateResponseHandler'
import { ReturnRouteTypes } from '../../decorators/transport/TransportDecorator'
import { MediationGrantHandler } from './handlers/MediationGrantHandler'
import { MediationDenyHandler } from './handlers/MediationDenyHandler'
import { MessageSender } from '../../agent/MessageSender'
import { createOutboundMessage } from '../../agent/helpers'
import { ConnectionService } from '../connections'
import { BatchPickupMessage } from './messages'
import { Dispatcher } from '../../agent/Dispatcher'
import { ConnectionRecord } from '../connections'
import { MediationRecord } from './index'
import { MediationState, MediationStateChangedEvent } from '../..'
import { ConnectionsModule } from '../connections/ConnectionsModule'
import { EventEmitter } from '../../agent/EventEmitter'
import { RoutingEventTypes } from './RoutingEvents'
import { BaseEvent } from '../../agent/Events'

@scoped(Lifecycle.ContainerScoped)
export class RecipientModule {
  private agentConfig: AgentConfig
  private recipientService: RecipientService
  private connectionService: ConnectionService
  private messageSender: MessageSender
  private eventEmitter: EventEmitter

  public constructor(
    dispatcher: Dispatcher,
    agentConfig: AgentConfig,
    recipientService: RecipientService,
    connectionService: ConnectionService,
    messageSender: MessageSender,
    eventEmitter: EventEmitter
  ) {
    this.agentConfig = agentConfig
    this.connectionService = connectionService
    this.recipientService = recipientService
    this.messageSender = messageSender
    this.eventEmitter = eventEmitter
    this.registerHandlers(dispatcher)
  }

  public async init(connections: ConnectionsModule) {
    this.recipientService.init()
    if (this.agentConfig.mediatorConnectionsInvite) {
      /* --------------------------------
      | Connect to mediator through provided invitation
      | and send mediation request and set as default mediator.
      */
      // Check if inviation was provided in config
      // Assumption: processInvitation is a URL-encoded invitation
      let connectionRecord = await connections.receiveInvitationFromUrl(this.agentConfig.mediatorConnectionsInvite, {
        autoAcceptConnection: true,
        alias: 'InitedMediator', // TODO come up with a better name for this
      })
      connectionRecord = await connections.returnWhenIsConnected(connectionRecord.id)
      const mediationRecord = await this.requestAndAwaitGrant(connectionRecord, 2000) // TODO: put timeout as a config parameter
      await this.recipientService.setDefaultMediator(mediationRecord)
    }
    if (this.agentConfig.defaultMediatorId) {
      /*
      | Set the default mediator by ID
      */
      const mediatorRecord = await this.recipientService.findById(this.agentConfig.defaultMediatorId)
      if (mediatorRecord) {
        this.recipientService.setDefaultMediator(mediatorRecord)
      } else {
        this.agentConfig.logger.error('Mediator record not found from config')
        // TODO: Handle error properly - not found condition
      }
    }
    if (this.agentConfig.clearDefaultMediator) {
      /*
      | Clear the stored default mediator
      */
      this.recipientService.clearDefaultMediator()
    }
  }

  public async downloadMessages(mediatorConnection: ConnectionRecord) {
    let connection = mediatorConnection ?? (await this.getDefaultMediatorConnection())
    connection = assertConnection(connection, 'connection not found for default mediator')
    const batchPickupMessage = new BatchPickupMessage({ batchSize: 10 })
    const outboundMessage = createOutboundMessage(connection, batchPickupMessage)
    outboundMessage.payload.setReturnRouting(ReturnRouteTypes.all)
    await this.messageSender.sendMessage(outboundMessage)
  }

  public async setDefaultMediator(mediatorRecord: MediationRecord) {
    return await this.recipientService.setDefaultMediator(mediatorRecord)
  }

  public async requestMediation(connection: ConnectionRecord): Promise<MediationRecord> {
    const [record, message] = await this.recipientService.createRequest(connection)
    const outboundMessage = createOutboundMessage(connection, message)
    await this.messageSender.sendMessage(outboundMessage)
    return record
  }

  public async notifyKeylistUpdate(connection: ConnectionRecord, verkey: Verkey) {
    const message = await this.connectionService.createKeylistUpdateMessage(verkey)
    const outboundMessage = createOutboundMessage(connection, message)
    const response = await this.messageSender.sendMessage(outboundMessage)
    return response
  }

  public async requestKeylist(connection: ConnectionRecord) {
    const message = this.recipientService.createKeylistQuery()
    const outboundMessage = createOutboundMessage(connection, message)
    const response = await this.messageSender.sendMessage(outboundMessage)
    return response
  }

  public async findByConnectionId(connectionId: string) {
    return await this.recipientService.findByConnectionId(connectionId)
  }

  public async getMediators() {
    return await this.recipientService.getMediators()
  }

  public async getDefaultMediatorId() {
    return await this.recipientService.getDefaultMediatorId()
  }

  public async getDefaultMediator(): Promise<MediationRecord | undefined> {
    return await this.recipientService.getDefaultMediator()
  }

  public async getDefaultMediatorConnection(): Promise<ConnectionRecord | undefined> {
    const mediatorRecord = await this.getDefaultMediator()
    if (mediatorRecord) {
      return await this.connectionService.getById(mediatorRecord.connectionId)
    }
    return undefined
  }

  /**
   * create mediation record and request.
   * register listener for mediation grant, before sending request to remove race condition
   * resolve record when mediator grants request. time out otherwise
   * send request message to mediator
   * return promise with listener
   **/
  public async requestAndAwaitGrant(connection: ConnectionRecord, timeout = 50): Promise<MediationRecord> {
    const [record, message] = await this.recipientService.createRequest(connection)

    const sendMediationRequest = async () => {
      message.setReturnRouting(ReturnRouteTypes.all) // return message on request response
      const outboundMessage = createOutboundMessage(connection, message)
      await this.messageSender.sendMessage(outboundMessage)
    }
    const condition = async (event: MediationStateChangedEvent) => {
      const previousStateMatches = MediationState.Requested === event.payload.previousState
      const mediationIdMatches = record.id === event.payload.mediationRecord.id
      const stateMatches = MediationState.Granted === event.payload.mediationRecord.state
      return previousStateMatches && mediationIdMatches && stateMatches
    }
    const results = await waitForEvent(
      sendMediationRequest,
      RoutingEventTypes.MediationStateChanged,
      condition,
      timeout,
      this.eventEmitter
    )
    return (results as MediationStateChangedEvent).payload.mediationRecord
  }

  // Register handlers for the several messages for the mediator.
  private registerHandlers(dispatcher: Dispatcher) {
    dispatcher.registerHandler(new KeylistUpdateResponseHandler(this.recipientService))
    dispatcher.registerHandler(new MediationGrantHandler(this.recipientService))
    dispatcher.registerHandler(new MediationDenyHandler(this.recipientService))
    //dispatcher.registerHandler(new KeylistListHandler(this.recipientService)) // TODO: write this
  }
}