import type { AgentMessage } from '../../../agent/AgentMessage'
import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { Logger } from '../../../logger'
import type { ConnectionRecord } from '../../connections'
import type { CredentialStateChangedEvent } from '../CredentialEvents'
import type { CredentialPreview, ProposeCredentialMessageOptions } from '../messages'
import type { CredDefId } from 'indy-sdk'

import { scoped, Lifecycle } from 'tsyringe'

import { AgentConfig } from '../../../agent/AgentConfig'
import { EventEmitter } from '../../../agent/EventEmitter'
import { Attachment, AttachmentData } from '../../../decorators/attachment/Attachment'
import { AriesFrameworkError } from '../../../error'
import { JsonEncoder } from '../../../utils/JsonEncoder'
import { uuid } from '../../../utils/uuid'
import { AckStatus } from '../../common'
import { ConnectionService } from '../../connections'
import { IndyIssuerService, IndyHolderService } from '../../indy'
import { IndyLedgerService } from '../../ledger/services/IndyLedgerService'
import { CredentialEventTypes } from '../CredentialEvents'
import { CredentialState } from '../CredentialState'
import { CredentialUtils } from '../CredentialUtils'
import {
  OfferCredentialMessage,
  INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
  RequestCredentialMessage,
  IssueCredentialMessage,
  CredentialAckMessage,
  INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID,
  INDY_CREDENTIAL_ATTACHMENT_ID,
  ProposeCredentialMessage,
} from '../messages'
import { CredentialRepository } from '../repository'
import { CredentialRecord } from '../repository/CredentialRecord'

@scoped(Lifecycle.ContainerScoped)
export class CredentialService {
  private credentialRepository: CredentialRepository
  private connectionService: ConnectionService
  private ledgerService: IndyLedgerService
  private logger: Logger
  private indyIssuerService: IndyIssuerService
  private indyHolderService: IndyHolderService
  private eventEmitter: EventEmitter

  public constructor(
    credentialRepository: CredentialRepository,
    connectionService: ConnectionService,
    ledgerService: IndyLedgerService,
    agentConfig: AgentConfig,
    indyIssuerService: IndyIssuerService,
    indyHolderService: IndyHolderService,
    eventEmitter: EventEmitter
  ) {
    this.credentialRepository = credentialRepository
    this.connectionService = connectionService
    this.ledgerService = ledgerService
    this.logger = agentConfig.logger
    this.indyIssuerService = indyIssuerService
    this.indyHolderService = indyHolderService
    this.eventEmitter = eventEmitter
  }

  /**
   * Create a {@link ProposeCredentialMessage} not bound to an existing credential exchange.
   * To create a proposal as response to an existing credential exchange, use {@link CredentialService#createProposalAsResponse}.
   *
   * @param connectionRecord The connection for which to create the credential proposal
   * @param config Additional configuration to use for the proposal
   * @returns Object containing proposal message and associated credential record
   *
   */
  public async createProposal(
    connectionRecord: ConnectionRecord,
    config?: Omit<ProposeCredentialMessageOptions, 'id'>
  ): Promise<CredentialProtocolMsgReturnType<ProposeCredentialMessage>> {
    // Assert
    connectionRecord.assertReady()

    // Create message
    const proposalMessage = new ProposeCredentialMessage(config ?? {})

    // Create record
    const credentialRecord = new CredentialRecord({
      connectionId: connectionRecord.id,
      threadId: proposalMessage.threadId,
      state: CredentialState.ProposalSent,
      proposalMessage,
      credentialAttributes: proposalMessage.credentialProposal?.attributes,
    })
    await this.credentialRepository.save(credentialRecord)
    this.eventEmitter.emit<CredentialStateChangedEvent>({
      type: CredentialEventTypes.CredentialStateChanged,
      payload: {
        credentialRecord,
        previousState: null,
      },
    })

    return { message: proposalMessage, credentialRecord }
  }

  /**
   * Create a {@link ProposePresentationMessage} as response to a received credential offer.
   * To create a proposal not bound to an existing credential exchange, use {@link CredentialService#createProposal}.
   *
   * @param credentialRecord The credential record for which to create the credential proposal
   * @param config Additional configuration to use for the proposal
   * @returns Object containing proposal message and associated credential record
   *
   */
  public async createProposalAsResponse(
    credentialRecord: CredentialRecord,
    config?: Omit<ProposeCredentialMessageOptions, 'id'>
  ): Promise<CredentialProtocolMsgReturnType<ProposeCredentialMessage>> {
    // Assert
    credentialRecord.assertState(CredentialState.OfferReceived)

    // Create message
    const proposalMessage = new ProposeCredentialMessage(config ?? {})
    proposalMessage.setThread({ threadId: credentialRecord.threadId })

    // Update record
    credentialRecord.proposalMessage = proposalMessage
    credentialRecord.credentialAttributes = proposalMessage.credentialProposal?.attributes
    this.updateState(credentialRecord, CredentialState.ProposalSent)

    return { message: proposalMessage, credentialRecord }
  }

  /**
   * Process a received {@link ProposeCredentialMessage}. This will not accept the credential proposal
   * or send a credential offer. It will only create a new, or update the existing credential record with
   * the information from the credential proposal message. Use {@link CredentialService#createOfferAsResponse}
   * after calling this method to create a credential offer.
   *
   * @param messageContext The message context containing a credential proposal message
   * @returns credential record associated with the credential proposal message
   *
   */
  public async processProposal(
    messageContext: InboundMessageContext<ProposeCredentialMessage>
  ): Promise<CredentialRecord> {
    let credentialRecord: CredentialRecord
    const { message: proposalMessage, connection } = messageContext

    // Assert connection
    if (!connection) {
      throw new AriesFrameworkError(
        `No connection associated with incoming credential proposal message with thread id ${proposalMessage.threadId}`
      )
    }

    try {
      // Credential record already exists
      credentialRecord = await this.getByConnectionAndThreadId(connection.id, proposalMessage.threadId)

      // Assert
      credentialRecord.assertState(CredentialState.OfferSent)

      // Update record
      credentialRecord.proposalMessage = proposalMessage
      credentialRecord.credentialAttributes = proposalMessage.credentialProposal?.attributes
      await this.updateState(credentialRecord, CredentialState.ProposalReceived)
    } catch {
      // No credential record exists with thread id
      credentialRecord = new CredentialRecord({
        connectionId: connection.id,
        threadId: proposalMessage.threadId,
        proposalMessage,
        credentialAttributes: proposalMessage.credentialProposal?.attributes,
        state: CredentialState.ProposalReceived,
      })

      // Save record
      await this.credentialRepository.save(credentialRecord)
      this.eventEmitter.emit<CredentialStateChangedEvent>({
        type: CredentialEventTypes.CredentialStateChanged,
        payload: {
          credentialRecord,
          previousState: null,
        },
      })
    }

    return credentialRecord
  }

  /**
   * Create a {@link OfferCredentialMessage} as response to a received credential proposal.
   * To create an offer not bound to an existing credential exchange, use {@link CredentialService#createOffer}.
   *
   * @param credentialRecord The credential record for which to create the credential offer
   * @param credentialTemplate The credential template to use for the offer
   * @returns Object containing offer message and associated credential record
   *
   */
  public async createOfferAsResponse(
    credentialRecord: CredentialRecord,
    credentialTemplate: CredentialOfferTemplate
  ): Promise<CredentialProtocolMsgReturnType<OfferCredentialMessage>> {
    // Assert
    credentialRecord.assertState(CredentialState.ProposalReceived)

    // Create message
    const { credentialDefinitionId, comment, preview } = credentialTemplate
    const credOffer = await this.indyIssuerService.createCredentialOffer(credentialDefinitionId)
    const attachment = new Attachment({
      id: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
      mimeType: 'application/json',
      data: new AttachmentData({
        base64: JsonEncoder.toBase64(credOffer),
      }),
    })
    const credentialOfferMessage = new OfferCredentialMessage({
      comment,
      offerAttachments: [attachment],
      credentialPreview: preview,
    })
    credentialOfferMessage.setThread({
      threadId: credentialRecord.threadId,
    })

    credentialRecord.offerMessage = credentialOfferMessage
    credentialRecord.credentialAttributes = preview.attributes
    credentialRecord.metadata.credentialDefinitionId = credOffer.cred_def_id
    credentialRecord.metadata.schemaId = credOffer.schema_id
    await this.updateState(credentialRecord, CredentialState.OfferSent)

    return { message: credentialOfferMessage, credentialRecord }
  }

  /**
   * Create a {@link OfferCredentialMessage} not bound to an existing credential exchange.
   * To create an offer as response to an existing credential exchange, use {@link CredentialService#createOfferAsResponse}.
   *
   * @param connectionRecord The connection for which to create the credential offer
   * @param credentialTemplate The credential template to use for the offer
   * @returns Object containing offer message and associated credential record
   *
   */
  public async createOffer(
    connectionRecord: ConnectionRecord,
    credentialTemplate: CredentialOfferTemplate
  ): Promise<CredentialProtocolMsgReturnType<OfferCredentialMessage>> {
    // Assert
    connectionRecord.assertReady()

    // Create message
    const { credentialDefinitionId, comment, preview } = credentialTemplate
    const credOffer = await this.indyIssuerService.createCredentialOffer(credentialDefinitionId)
    const attachment = new Attachment({
      id: INDY_CREDENTIAL_OFFER_ATTACHMENT_ID,
      mimeType: 'application/json',
      data: new AttachmentData({
        base64: JsonEncoder.toBase64(credOffer),
      }),
    })
    const credentialOfferMessage = new OfferCredentialMessage({
      comment,
      offerAttachments: [attachment],
      credentialPreview: preview,
    })

    // Create record
    const credentialRecord = new CredentialRecord({
      connectionId: connectionRecord.id,
      threadId: credentialOfferMessage.id,
      offerMessage: credentialOfferMessage,
      credentialAttributes: preview.attributes,
      metadata: {
        credentialDefinitionId: credOffer.cred_def_id,
        schemaId: credOffer.schema_id,
      },
      state: CredentialState.OfferSent,
    })

    await this.credentialRepository.save(credentialRecord)
    this.eventEmitter.emit<CredentialStateChangedEvent>({
      type: CredentialEventTypes.CredentialStateChanged,
      payload: {
        credentialRecord,
        previousState: null,
      },
    })

    return { message: credentialOfferMessage, credentialRecord }
  }

  /**
   * Process a received {@link OfferCredentialMessage}. This will not accept the credential offer
   * or send a credential request. It will only create a new credential record with
   * the information from the credential offer message. Use {@link CredentialService#createRequest}
   * after calling this method to create a credential request.
   *
   * @param messageContext The message context containing a credential request message
   * @returns credential record associated with the credential offer message
   *
   */
  public async processOffer(messageContext: InboundMessageContext<OfferCredentialMessage>): Promise<CredentialRecord> {
    let credentialRecord: CredentialRecord
    const { message: credentialOfferMessage, connection } = messageContext

    // Assert connection
    if (!connection) {
      throw new AriesFrameworkError(
        `No connection associated with incoming credential offer message with thread id ${credentialOfferMessage.threadId}`
      )
    }

    const indyCredentialOffer = credentialOfferMessage.indyCredentialOffer

    if (!indyCredentialOffer) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential offer with thread id ${credentialOfferMessage.threadId}`
      )
    }

    try {
      // Credential record already exists
      credentialRecord = await this.getByConnectionAndThreadId(connection.id, credentialOfferMessage.threadId)

      // Assert
      credentialRecord.assertState(CredentialState.ProposalSent)

      credentialRecord.offerMessage = credentialOfferMessage
      credentialRecord.credentialAttributes = credentialOfferMessage.credentialPreview.attributes
      credentialRecord.metadata.credentialDefinitionId = indyCredentialOffer.cred_def_id
      credentialRecord.metadata.schemaId = indyCredentialOffer.schema_id
      await this.updateState(credentialRecord, CredentialState.OfferReceived)
    } catch {
      // No credential record exists with thread id
      credentialRecord = new CredentialRecord({
        connectionId: connection.id,
        threadId: credentialOfferMessage.id,
        offerMessage: credentialOfferMessage,
        credentialAttributes: credentialOfferMessage.credentialPreview.attributes,
        metadata: {
          credentialDefinitionId: indyCredentialOffer.cred_def_id,
          schemaId: indyCredentialOffer.schema_id,
        },
        state: CredentialState.OfferReceived,
      })

      // Save in repository
      await this.credentialRepository.save(credentialRecord)
      this.eventEmitter.emit<CredentialStateChangedEvent>({
        type: CredentialEventTypes.CredentialStateChanged,
        payload: {
          credentialRecord,
          previousState: null,
        },
      })
    }

    return credentialRecord
  }

  /**
   * Create a {@link RequestCredentialMessage} as response to a received credential offer.
   *
   * @param credentialRecord The credential record for which to create the credential request
   * @param options Additional configuration to use for the credential request
   * @returns Object containing request message and associated credential record
   *
   */
  public async createRequest(
    credentialRecord: CredentialRecord,
    options: CredentialRequestOptions = {}
  ): Promise<CredentialProtocolMsgReturnType<RequestCredentialMessage>> {
    // Assert credential
    credentialRecord.assertState(CredentialState.OfferReceived)

    const connection = await this.connectionService.getById(credentialRecord.connectionId)
    const holderDid = connection.did

    const credentialOffer = credentialRecord.offerMessage?.indyCredentialOffer

    if (!credentialOffer) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential offer with thread id ${credentialRecord.threadId}`
      )
    }

    const credentialDefinition = await this.ledgerService.getCredentialDefinition(credentialOffer.cred_def_id)

    const [credReq, credReqMetadata] = await this.indyHolderService.createCredentialRequest({
      holderDid,
      credentialOffer,
      credentialDefinition,
    })
    const attachment = new Attachment({
      id: INDY_CREDENTIAL_REQUEST_ATTACHMENT_ID,
      mimeType: 'application/json',
      data: new AttachmentData({
        base64: JsonEncoder.toBase64(credReq),
      }),
    })

    const { comment } = options
    const credentialRequest = new RequestCredentialMessage({
      comment,
      requestAttachments: [attachment],
    })
    credentialRequest.setThread({ threadId: credentialRecord.threadId })

    credentialRecord.metadata.requestMetadata = credReqMetadata
    credentialRecord.requestMessage = credentialRequest
    await this.updateState(credentialRecord, CredentialState.RequestSent)

    return { message: credentialRequest, credentialRecord }
  }

  /**
   * Process a received {@link RequestCredentialMessage}. This will not accept the credential request
   * or send a credential. It will only update the existing credential record with
   * the information from the credential request message. Use {@link CredentialService#createCredential}
   * after calling this method to create a credential.
   *
   * @param messageContext The message context containing a credential request message
   * @returns credential record associated with the credential request message
   *
   */
  public async processRequest(
    messageContext: InboundMessageContext<RequestCredentialMessage>
  ): Promise<CredentialRecord> {
    const { message: credentialRequestMessage, connection } = messageContext

    // Assert connection
    if (!connection) {
      throw new AriesFrameworkError(
        `No connection associated with incoming credential request message with thread id ${credentialRequestMessage.threadId}`
      )
    }

    const indyCredentialRequest = credentialRequestMessage?.indyCredentialRequest

    if (!indyCredentialRequest) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential request with thread id ${credentialRequestMessage.threadId}`
      )
    }

    const credentialRecord = await this.getByConnectionAndThreadId(connection.id, credentialRequestMessage.threadId)
    credentialRecord.assertState(CredentialState.OfferSent)

    this.logger.debug('Credential record found when processing credential request', credentialRecord)

    credentialRecord.requestMessage = credentialRequestMessage
    await this.updateState(credentialRecord, CredentialState.RequestReceived)

    return credentialRecord
  }

  /**
   * Create a {@link IssueCredentialMessage} as response to a received credential request.
   *
   * @param credentialRecord The credential record for which to create the credential
   * @param options Additional configuration to use for the credential
   * @returns Object containing issue credential message and associated credential record
   *
   */
  public async createCredential(
    credentialRecord: CredentialRecord,
    options: CredentialResponseOptions = {}
  ): Promise<CredentialProtocolMsgReturnType<IssueCredentialMessage>> {
    // Assert
    credentialRecord.assertState(CredentialState.RequestReceived)

    const requestMessage = credentialRecord.requestMessage
    const offerMessage = credentialRecord.offerMessage

    if (!offerMessage) {
      throw new AriesFrameworkError(
        `Missing credential offer for credential exchange with thread id ${credentialRecord.threadId}`
      )
    }

    // Assert credential attributes
    const credentialAttributes = credentialRecord.credentialAttributes
    if (!credentialAttributes) {
      throw new Error(
        `Missing required credential attribute values on credential record with id ${credentialRecord.id}`
      )
    }

    // Assert Indy offer
    const indyCredentialOffer = offerMessage?.indyCredentialOffer
    if (!indyCredentialOffer) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential offer with thread id ${credentialRecord.threadId}`
      )
    }

    // Assert Indy request
    const indyCredentialRequest = requestMessage?.indyCredentialRequest
    if (!indyCredentialRequest) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential request with thread id ${credentialRecord.threadId}`
      )
    }

    const [credential] = await this.indyIssuerService.createCredential({
      credentialOffer: indyCredentialOffer,
      credentialRequest: indyCredentialRequest,
      credentialValues: CredentialUtils.convertAttributesToValues(credentialAttributes),
    })

    const credentialAttachment = new Attachment({
      id: INDY_CREDENTIAL_ATTACHMENT_ID,
      mimeType: 'application/json',
      data: new AttachmentData({
        base64: JsonEncoder.toBase64(credential),
      }),
    })

    const { comment } = options
    const issueCredentialMessage = new IssueCredentialMessage({
      comment,
      credentialAttachments: [credentialAttachment],
    })
    issueCredentialMessage.setThread({
      threadId: credentialRecord.threadId,
    })
    issueCredentialMessage.setPleaseAck()

    credentialRecord.credentialMessage = issueCredentialMessage

    await this.updateState(credentialRecord, CredentialState.CredentialIssued)

    return { message: issueCredentialMessage, credentialRecord }
  }

  /**
   * Process a received {@link IssueCredentialMessage}. This will not accept the credential
   * or send a credential acknowledgement. It will only update the existing credential record with
   * the information from the issue credential message. Use {@link CredentialService#createAck}
   * after calling this method to create a credential acknowledgement.
   *
   * @param messageContext The message context containing an issue credential message
   *
   * @returns credential record associated with the issue credential message
   *
   */
  public async processCredential(
    messageContext: InboundMessageContext<IssueCredentialMessage>
  ): Promise<CredentialRecord> {
    const { message: issueCredentialMessage, connection } = messageContext

    // Assert connection
    if (!connection) {
      throw new AriesFrameworkError(
        `No connection associated with incoming presentation message with thread id ${issueCredentialMessage.threadId}`
      )
    }

    // Assert credential record
    const credentialRecord = await this.getByConnectionAndThreadId(connection.id, issueCredentialMessage.threadId)
    credentialRecord.assertState(CredentialState.RequestSent)

    if (!credentialRecord.metadata.requestMetadata) {
      throw new AriesFrameworkError(`Missing required request metadata for credential with id ${credentialRecord.id}`)
    }

    const indyCredential = issueCredentialMessage.indyCredential
    if (!indyCredential) {
      throw new AriesFrameworkError(
        `Missing required base64 encoded attachment data for credential with thread id ${issueCredentialMessage.threadId}`
      )
    }

    // Assert the values in the received credential match the values
    // that were negotiated in the credential exchange
    // TODO: Ideally we don't throw here, but instead store that it's not equal.
    // the credential may still have value, and we could just respond with an ack
    // status of fail
    if (credentialRecord.credentialAttributes) {
      CredentialUtils.assertValuesMatch(
        indyCredential.values,
        CredentialUtils.convertAttributesToValues(credentialRecord.credentialAttributes)
      )
    }

    const credentialDefinition = await this.ledgerService.getCredentialDefinition(indyCredential.cred_def_id)

    const credentialId = await this.indyHolderService.storeCredential({
      credentialId: uuid(),
      credentialRequestMetadata: credentialRecord.metadata.requestMetadata,
      credential: indyCredential,
      credentialDefinition,
    })

    credentialRecord.credentialId = credentialId
    credentialRecord.credentialMessage = issueCredentialMessage
    await this.updateState(credentialRecord, CredentialState.CredentialReceived)

    return credentialRecord
  }

  /**
   * Create a {@link CredentialAckMessage} as response to a received credential.
   *
   * @param credentialRecord The credential record for which to create the credential acknowledgement
   * @returns Object containing credential acknowledgement message and associated credential record
   *
   */
  public async createAck(
    credentialRecord: CredentialRecord
  ): Promise<CredentialProtocolMsgReturnType<CredentialAckMessage>> {
    credentialRecord.assertState(CredentialState.CredentialReceived)

    // Create message
    const ackMessage = new CredentialAckMessage({
      status: AckStatus.OK,
      threadId: credentialRecord.threadId,
    })

    await this.updateState(credentialRecord, CredentialState.Done)

    return { message: ackMessage, credentialRecord }
  }

  /**
   * Process a received {@link CredentialAckMessage}.
   *
   * @param messageContext The message context containing a credential acknowledgement message
   * @returns credential record associated with the credential acknowledgement message
   *
   */
  public async processAck(messageContext: InboundMessageContext<CredentialAckMessage>): Promise<CredentialRecord> {
    const { message: credentialAckMessage, connection } = messageContext

    // Assert connection
    if (!connection) {
      throw new AriesFrameworkError(
        `No connection associated with incoming presentation acknowledgement message with thread id ${credentialAckMessage.threadId}`
      )
    }

    // Assert credential record
    const credentialRecord = await this.getByConnectionAndThreadId(connection.id, credentialAckMessage.threadId)
    credentialRecord.assertState(CredentialState.CredentialIssued)

    // Update record
    await this.updateState(credentialRecord, CredentialState.Done)

    return credentialRecord
  }

  /**
   * Retrieve all credential records
   *
   * @returns List containing all credential records
   */
  public getAll(): Promise<CredentialRecord[]> {
    return this.credentialRepository.getAll()
  }

  /**
   * Retrieve a credential record by id
   *
   * @param credentialRecordId The credential record id
   * @throws {RecordNotFoundError} If no record is found
   * @return The credential record
   *
   */
  public getById(credentialRecordId: string): Promise<CredentialRecord> {
    return this.credentialRepository.getById(credentialRecordId)
  }

  /**
   * Find a credential record by id
   *
   * @param credentialRecordId the credential record id
   * @returns The credential record or null if not found
   */
  public findById(connectionId: string): Promise<CredentialRecord | null> {
    return this.credentialRepository.findById(connectionId)
  }

  /**
   * Retrieve a credential record by connection id and thread id
   *
   * @param connectionId The connection id
   * @param threadId The thread id
   * @throws {RecordNotFoundError} If no record is found
   * @throws {RecordDuplicateError} If multiple records are found
   * @returns The credential record
   */
  public getByConnectionAndThreadId(connectionId: string, threadId: string): Promise<CredentialRecord> {
    return this.credentialRepository.getSingleByQuery({
      threadId,
      connectionId,
    })
  }

  /**
   * Update the record to a new state and emit an state changed event. Also updates the record
   * in storage.
   *
   * @param credentialRecord The credential record to update the state for
   * @param newState The state to update to
   *
   */
  private async updateState(credentialRecord: CredentialRecord, newState: CredentialState) {
    const previousState = credentialRecord.state
    credentialRecord.state = newState
    await this.credentialRepository.update(credentialRecord)

    this.eventEmitter.emit<CredentialStateChangedEvent>({
      type: CredentialEventTypes.CredentialStateChanged,
      payload: {
        credentialRecord,
        previousState: previousState,
      },
    })
  }
}

export interface CredentialProtocolMsgReturnType<MessageType extends AgentMessage> {
  message: MessageType
  credentialRecord: CredentialRecord
}

export interface CredentialOfferTemplate {
  credentialDefinitionId: CredDefId
  comment?: string
  preview: CredentialPreview
}

export interface CredentialRequestOptions {
  comment?: string
}

export interface CredentialResponseOptions {
  comment?: string
}
