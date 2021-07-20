import type { PresentationPreview, RequestPresentationMessage } from './messages'
import type { RequestedCredentials, RetrievedCredentials } from './models'
import type { ProofRecord } from './repository/ProofRecord'

import { Lifecycle, scoped } from 'tsyringe'

import { AgentConfig } from '../../agent/AgentConfig'
import { Dispatcher } from '../../agent/Dispatcher'
import { MessageSender } from '../../agent/MessageSender'
import { createOutboundMessage } from '../../agent/helpers'
import { ServiceDecorator } from '../../decorators/service/ServiceDecorator'
import { AriesFrameworkError } from '../../error'
import { ConnectionService } from '../connections/services/ConnectionService'
import { MediationRecipientService } from '../routing/services/MediationRecipientService'

import { ProofResponseCoordinator } from './ProofResponseCoordinator'
import {
  ProposePresentationHandler,
  RequestPresentationHandler,
  PresentationAckHandler,
  PresentationHandler,
} from './handlers'
import { ProofRequest } from './models/ProofRequest'
import { ProofRepository } from './repository'
import { ProofService } from './services'

@scoped(Lifecycle.ContainerScoped)
export class ProofsModule {
  private proofService: ProofService
  private connectionService: ConnectionService
  private proofRepository: ProofRepository
  private messageSender: MessageSender
  private mediationRecipientService: MediationRecipientService
  private agentConfig: AgentConfig
  private proofResponseCoordinator: ProofResponseCoordinator

  public constructor(
    dispatcher: Dispatcher,
    proofService: ProofService,
    connectionService: ConnectionService,
    proofRepository: ProofRepository,
    mediationRecipientService: MediationRecipientService,
    agentConfig: AgentConfig,
    messageSender: MessageSender,
    proofResponseCoordinator: ProofResponseCoordinator
  ) {
    this.proofService = proofService
    this.connectionService = connectionService
    this.proofRepository = proofRepository
    this.messageSender = messageSender
    this.mediationRecipientService = mediationRecipientService
    this.agentConfig = agentConfig
    this.proofResponseCoordinator = proofResponseCoordinator
    this.registerHandlers(dispatcher)
  }

  /**
   * Initiate a new presentation exchange as prover by sending a presentation proposal message
   * to the connection with the specified connection id.
   *
   * @param connectionId The connection to send the proof proposal to
   * @param presentationProposal The presentation proposal to include in the message
   * @param config Additional configuration to use for the proposal
   * @returns Proof record associated with the sent proposal message
   *
   */
  public async proposeProof(
    connectionId: string,
    presentationProposal: PresentationPreview,
    config?: {
      comment?: string
    }
  ): Promise<ProofRecord> {
    const connection = await this.connectionService.getById(connectionId)

    const { message, proofRecord } = await this.proofService.createProposal(connection, presentationProposal, config)

    const outbound = createOutboundMessage(connection, message)
    await this.messageSender.sendMessage(outbound)

    return proofRecord
  }

  /**
   * Accept a presentation proposal as verifier (by sending a presentation request message) to the connection
   * associated with the proof record.
   *
   * @param proofRecordId The id of the proof record for which to accept the proposal
   * @param config Additional configuration to use for the request
   * @returns Proof record associated with the presentation request
   *
   */
  public async acceptProposal(
    proofRecordId: string,
    config?: {
      request?: {
        name?: string
        version?: string
        nonce?: string
      }
      comment?: string
    }
  ): Promise<ProofRecord> {
    const proofRecord = await this.proofService.getById(proofRecordId)

    if (!proofRecord.connectionId) {
      throw new AriesFrameworkError(
        `No connectionId found for credential record '${proofRecord.id}'. Connection-less issuance does not support presentation proposal or negotiation.`
      )
    }

    const connection = await this.connectionService.getById(proofRecord.connectionId)

    const presentationProposal = proofRecord.proposalMessage?.presentationProposal
    if (!presentationProposal) {
      throw new AriesFrameworkError(`Proof record with id ${proofRecordId} is missing required presentation proposal`)
    }

    const proofRequest = await this.proofService.createProofRequestFromProposal(presentationProposal, {
      name: config?.request?.name ?? 'proof-request',
      version: config?.request?.version ?? '1.0',
      nonce: config?.request?.nonce,
    })

    const { message } = await this.proofService.createRequestAsResponse(proofRecord, proofRequest, {
      comment: config?.comment,
    })

    const outboundMessage = createOutboundMessage(connection, message)
    await this.messageSender.sendMessage(outboundMessage)

    return proofRecord
  }

  /**
   * Initiate a new presentation exchange as verifier by sending a presentation request message
   * to the connection with the specified connection id
   *
   * @param connectionId The connection to send the proof request to
   * @param proofRequestOptions Options to build the proof request
   * @returns Proof record associated with the sent request message
   *
   */
  public async requestProof(connectionId: string, proofRequestOptions: ProofRequestOptions): Promise<ProofRecord> {
    const connection = await this.connectionService.getById(connectionId)

    const nonce = proofRequestOptions.nonce ?? (await this.proofService.generateProofRequestNonce())

    const proofRequest = new ProofRequest({
      name: proofRequestOptions.name ?? 'proof-request',
      version: proofRequestOptions.name ?? '1.0',
      nonce,
      requestedAttributes: proofRequestOptions.requestedAttributes,
      requestedPredicates: proofRequestOptions.requestedPredicates,
    })

    const { message, proofRecord } = await this.proofService.createRequest(
      { proofRequest, comment: proofRequestOptions.comment },
      connection
    )

    const outboundMessage = createOutboundMessage(connection, message)
    await this.messageSender.sendMessage(outboundMessage)

    return proofRecord
  }

  /**
   * Initiate a new presentation exchange as verifier by creating a presentation request
   * not bound to any connection. The request must be delivered out-of-band to the holder
   *
   * @param proofRequestOptions Options to build the proof request
   * @returns The proof record and proof request message
   *
   */
  public async createOutOfBandRequest(proofRequestOptions: ProofRequestOptions): Promise<{
    requestMessage: RequestPresentationMessage
    proofRecord: ProofRecord
  }> {
    const nonce = proofRequestOptions.nonce ?? (await this.proofService.generateProofRequestNonce())

    const proofRequest = new ProofRequest({
      name: proofRequestOptions.name ?? 'proof-request',
      version: proofRequestOptions.name ?? '1.0',
      nonce,
      requestedAttributes: proofRequestOptions.requestedAttributes,
      requestedPredicates: proofRequestOptions.requestedPredicates,
    })

    const { message, proofRecord } = await this.proofService.createRequest({
      proofRequest,
      comment: proofRequestOptions.comment,
    })

    // Create and set ~service decorator
    const routing = await this.mediationRecipientService.getRouting()
    message.service = new ServiceDecorator({
      serviceEndpoint: routing.endpoint,
      recipientKeys: [routing.verkey],
      routingKeys: routing.routingKeys,
    })

    // Save ~service decorator to record (to remember our verkey)
    proofRecord.requestMessage = message
    await this.proofRepository.update(proofRecord)

    return { proofRecord, requestMessage: message }
  }

  /**
   * Accept a presentation request as prover (by sending a presentation message) to the connection
   * associated with the proof record.
   *
   * @param proofRecordId The id of the proof record for which to accept the request
   * @param requestedCredentials The requested credentials object specifying which credentials to use for the proof
   * @param config Additional configuration to use for the presentation
   * @returns Proof record associated with the sent presentation message
   *
   */
  public async acceptRequest(
    proofRecordId: string,
    requestedCredentials: RequestedCredentials,
    config?: {
      comment?: string
    }
  ): Promise<ProofRecord> {
    const record = await this.proofService.getById(proofRecordId)
    const { message, proofRecord } = await this.proofService.createPresentation(record, requestedCredentials, config)

    // Use connection if present
    if (proofRecord.connectionId) {
      const connection = await this.connectionService.getById(proofRecord.connectionId)

      const outboundMessage = createOutboundMessage(connection, message)
      await this.messageSender.sendMessage(outboundMessage)

      return proofRecord
    }
    // Use ~service decorator otherwise
    else if (proofRecord.requestMessage?.service) {
      // Create ~service decorator
      const routing = await this.mediationRecipientService.getRouting()
      const ourService = new ServiceDecorator({
        serviceEndpoint: routing.endpoint,
        recipientKeys: [routing.verkey],
        routingKeys: routing.routingKeys,
      })

      const recipientService = proofRecord.requestMessage.service

      // Set and save ~service decorator to record (to remember our verkey)
      message.service = ourService
      proofRecord.presentationMessage = message
      await this.proofRepository.update(proofRecord)

      await this.messageSender.sendMessageToService({
        message,
        service: recipientService.toDidCommService(),
        senderKey: ourService.recipientKeys[0],
        returnRoute: true,
      })

      return proofRecord
    }
    // Cannot send message without connectionId or ~service decorator
    else {
      throw new AriesFrameworkError(
        `Cannot accept presentation request without connectionId or ~service decorator on presentation request.`
      )
    }
  }

  /**
   * Accept a presentation as prover (by sending a presentation acknowledgement message) to the connection
   * associated with the proof record.
   *
   * @param proofRecordId The id of the proof record for which to accept the presentation
   * @returns Proof record associated with the sent presentation acknowledgement message
   *
   */
  public async acceptPresentation(proofRecordId: string): Promise<ProofRecord> {
    const record = await this.proofService.getById(proofRecordId)
    const { message, proofRecord } = await this.proofService.createAck(record)

    // Use connection if present
    if (proofRecord.connectionId) {
      const connection = await this.connectionService.getById(proofRecord.connectionId)
      const outboundMessage = createOutboundMessage(connection, message)
      await this.messageSender.sendMessage(outboundMessage)
    }
    // Use ~service decorator otherwise
    else if (proofRecord.requestMessage?.service && proofRecord.presentationMessage?.service) {
      const recipientService = proofRecord.presentationMessage?.service
      const ourService = proofRecord.requestMessage?.service

      await this.messageSender.sendMessageToService({
        message,
        service: recipientService.toDidCommService(),
        senderKey: ourService.recipientKeys[0],
        returnRoute: true,
      })
    }

    // Cannot send message without credentialId or ~service decorator
    else {
      throw new AriesFrameworkError(
        `Cannot accept presentation without connectionId or ~service decorator on presentation message.`
      )
    }

    return proofRecord
  }

  /**
   * Create a {@link RetrievedCredentials} object. Given input proof request and presentation proposal,
   * use credentials in the wallet to build indy requested credentials object for input to proof creation.
   * If restrictions allow, self attested attributes will be used.
   *
   *
   * @param proofRequest The proof request to build the requested credentials object from
   * @param presentationProposal Optional presentation proposal to improve credential selection algorithm
   * @returns RetrievedCredentials object
   */
  public async getRequestedCredentialsForProofRequest(
    proofRequest: ProofRequest,
    presentationProposal?: PresentationPreview
  ): Promise<RetrievedCredentials> {
    return this.proofService.getRequestedCredentialsForProofRequest(proofRequest, presentationProposal)
  }

  /**
   * Takes a RetrievedCredentials object and auto selects credentials in a RequestedCredentials object
   *
   * Use the return value of this method as input to {@link ProofService.createPresentation} to
   * automatically accept a received presentation request.
   *
   * @param retrievedCredentials The retrieved credentials object to get credentials from
   *
   * @returns RequestedCredentials
   */
  public autoSelectCredentialsForProofRequest(retrievedCredentials: RetrievedCredentials): RequestedCredentials {
    return this.proofService.autoSelectCredentialsForProofRequest(retrievedCredentials)
  }

  /**
   * Retrieve all proof records
   *
   * @returns List containing all proof records
   */
  public getAll(): Promise<ProofRecord[]> {
    return this.proofService.getAll()
  }

  /**
   * Retrieve a proof record by id
   *
   * @param proofRecordId The proof record id
   * @throws {RecordNotFoundError} If no record is found
   * @throws {RecordDuplicateError} If multiple records are found
   * @return The proof record
   *
   */
  public async getById(proofRecordId: string): Promise<ProofRecord> {
    return this.proofService.getById(proofRecordId)
  }

  /**
   * Retrieve a proof record by id
   *
   * @param proofRecordId The proof record id
   * @return The proof record or null if not found
   *
   */
  public async findById(proofRecordId: string): Promise<ProofRecord | null> {
    return this.proofService.findById(proofRecordId)
  }

  private registerHandlers(dispatcher: Dispatcher) {
    dispatcher.registerHandler(
      new ProposePresentationHandler(this.proofService, this.agentConfig, this.proofResponseCoordinator)
    )
    dispatcher.registerHandler(
      new RequestPresentationHandler(
        this.proofService,
        this.agentConfig,
        this.proofResponseCoordinator,
        this.mediationRecipientService
      )
    )
    dispatcher.registerHandler(
      new PresentationHandler(this.proofService, this.agentConfig, this.proofResponseCoordinator)
    )
    dispatcher.registerHandler(new PresentationAckHandler(this.proofService))
  }
}

export interface ProofRequestOptions
  extends Partial<Pick<ProofRequest, 'name' | 'nonce' | 'requestedAttributes' | 'requestedPredicates'>> {
  comment?: string
}
