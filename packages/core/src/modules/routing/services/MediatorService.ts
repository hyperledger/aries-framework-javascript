import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { WireMessage } from '../../../types'
import type { MediationStateChangedEvent } from '../RoutingEvents'
import type { ForwardMessage, KeylistUpdateMessage, MediationRequestMessage } from '../messages'
import type { Verkey } from 'indy-sdk'

import { inject, Lifecycle, scoped } from 'tsyringe'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { InjectionSymbols } from '../../../constants'
import { AriesFrameworkError } from '../../../error'
import { Wallet } from '../../../wallet/Wallet'
import { RoutingEventTypes } from '../RoutingEvents'
import {
  KeylistUpdateAction,
  KeylistUpdateResult,
  KeylistUpdated,
  MediationGrantMessage,
  KeylistUpdateResponseMessage,
} from '../messages'
import { MediationRole } from '../models/MediationRole'
import { MediationState } from '../models/MediationState'
import { MediationRecord } from '../repository/MediationRecord'
import { MediationRepository } from '../repository/MediationRepository'

@scoped(Lifecycle.ContainerScoped)
export class MediatorService {
  private agentConfig: AgentConfig
  private mediationRepository: MediationRepository
  private wallet: Wallet
  private eventEmitter: EventEmitter
  private routingKeys: Verkey[]

  public constructor(
    mediationRepository: MediationRepository,
    agentConfig: AgentConfig,
    @inject(InjectionSymbols.Wallet) wallet: Wallet,
    eventEmitter: EventEmitter
  ) {
    this.mediationRepository = mediationRepository
    this.agentConfig = agentConfig
    this.wallet = wallet
    this.eventEmitter = eventEmitter
    this.routingKeys = []
  }

  public async processForwardMessage(
    messageContext: InboundMessageContext<ForwardMessage>
  ): Promise<{ mediationRecord: MediationRecord; packedMessage: WireMessage }> {
    const { message } = messageContext

    // TODO: update to class-validator validation
    if (!message.to) {
      throw new AriesFrameworkError('Invalid Message: Missing required attribute "to"')
    }

    const mediationRecord = await this.mediationRepository.getSingleByRecipientKey(message.to)

    // Assert mediation record is ready to be used
    mediationRecord.assertReady()

    return {
      packedMessage: message.message,
      mediationRecord,
    }
  }

  public async processKeylistUpdateRequest(messageContext: InboundMessageContext<KeylistUpdateMessage>) {
    // Assert Ready connection
    const connection = messageContext.assertReadyConnection()

    const { message } = messageContext
    const keylist: KeylistUpdated[] = []

    const mediationRecord = await this.mediationRepository.getByConnectionId(connection.id)

    for (const update of message.updates) {
      const updated = new KeylistUpdated({
        action: update.action,
        recipientKey: update.recipientKey,
        result: KeylistUpdateResult.NoChange,
      })
      if (update.action === KeylistUpdateAction.add) {
        updated.result = await this.saveRoute(update.recipientKey, mediationRecord)
        keylist.push(updated)
      } else if (update.action === KeylistUpdateAction.remove) {
        updated.result = await this.removeRoute(update.recipientKey, mediationRecord)
        keylist.push(updated)
      }
    }

    return new KeylistUpdateResponseMessage({ keylist, threadId: message.threadId })
  }

  public async saveRoute(recipientKey: Verkey, mediationRecord: MediationRecord) {
    try {
      mediationRecord.recipientKeys.push(recipientKey)
      this.mediationRepository.update(mediationRecord)
      return KeylistUpdateResult.Success
    } catch (error) {
      this.agentConfig.logger.error(
        `Error processing keylist update action for verkey '${recipientKey}' and mediation record '${mediationRecord.id}'`
      )
      return KeylistUpdateResult.ServerError
    }
  }

  public async removeRoute(recipientKey: Verkey, mediationRecord: MediationRecord) {
    try {
      const index = mediationRecord.recipientKeys.indexOf(recipientKey, 0)
      if (index > -1) {
        mediationRecord.recipientKeys.splice(index, 1)

        await this.mediationRepository.update(mediationRecord)
        return KeylistUpdateResult.Success
      }

      return KeylistUpdateResult.ServerError
    } catch (error) {
      this.agentConfig.logger.error(
        `Error processing keylist remove action for verkey '${recipientKey}' and mediation record '${mediationRecord.id}'`
      )
      return KeylistUpdateResult.ServerError
    }
  }

  public async createGrantMediationMessage(mediationRecord: MediationRecord) {
    // Assert
    mediationRecord.assertState(MediationState.Requested)
    mediationRecord.assertRole(MediationRole.Mediator)

    // TODO: this doesn't persist the routing did between agent startup
    if (this.routingKeys.length === 0) {
      const { verkey } = await this.wallet.createDid()
      this.routingKeys = [verkey]
    }

    mediationRecord.state = MediationState.Granted
    await this.mediationRepository.update(mediationRecord)

    const message = new MediationGrantMessage({
      endpoint: this.agentConfig.getEndpoint(),
      routingKeys: this.routingKeys,
      threadId: mediationRecord.threadId,
    })

    return { mediationRecord, message }
  }

  public async processMediationRequest(messageContext: InboundMessageContext<MediationRequestMessage>) {
    // Assert ready connection
    const connection = messageContext.assertReadyConnection()

    const mediationRecord = new MediationRecord({
      connectionId: connection.id,
      role: MediationRole.Mediator,
      state: MediationState.Requested,
      threadId: messageContext.message.threadId,
    })

    await this.mediationRepository.save(mediationRecord)
    this.eventEmitter.emit<MediationStateChangedEvent>({
      type: RoutingEventTypes.MediationStateChanged,
      payload: {
        mediationRecord,
        previousState: null,
      },
    })

    return mediationRecord
  }

  public async findById(mediatorRecordId: string): Promise<MediationRecord | null> {
    return this.mediationRepository.findById(mediatorRecordId)
  }

  public async getById(mediatorRecordId: string): Promise<MediationRecord> {
    return this.mediationRepository.getById(mediatorRecordId)
  }

  public async getAll(): Promise<MediationRecord[]> {
    return await this.mediationRepository.getAll()
  }

  private async updateState(mediationRecord: MediationRecord, newState: MediationState) {
    const previousState = mediationRecord.state

    mediationRecord.state = newState

    await this.mediationRepository.update(mediationRecord)

    this.eventEmitter.emit<MediationStateChangedEvent>({
      type: RoutingEventTypes.MediationStateChanged,
      payload: {
        mediationRecord,
        previousState: previousState,
      },
    })
  }
}
