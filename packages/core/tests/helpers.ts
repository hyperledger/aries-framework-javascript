import type { SubjectMessage } from '../../../tests/transport/SubjectInboundTransport'
import type {
  InitConfig,
  ProofRecord,
  ProofStateChangedEvent,
  CredentialRecord,
  CredentialStateChangedEvent,
  BasicMessage,
  BasicMessageReceivedEvent,
  ConnectionRecordProps,
  SchemaTemplate,
  CredentialDefinitionTemplate,
  CredentialOfferTemplate,
  ProofAttributeInfo,
  ProofPredicateInfo,
  AutoAcceptProof,
} from '../src'
import type { Schema, CredDef, Did } from 'indy-sdk'

import path from 'path'
import { Subject } from 'rxjs'

import { SubjectInboundTransporter } from '../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransporter } from '../../../tests/transport/SubjectOutboundTransport'
import { agentDependencies } from '../../node/src'
import {
  LogLevel,
  AgentConfig,
  ProofState,
  ProofEventTypes,
  CredentialState,
  CredentialEventTypes,
  BasicMessageEventTypes,
  ConnectionState,
  ConnectionRole,
  DidDoc,
  DidCommService,
  ConnectionInvitationMessage,
  ConnectionRecord,
  CredentialPreview,
  CredentialPreviewAttribute,
  AriesFrameworkError,
  AutoAcceptCredential,
  PresentationPreview,
  PresentationPreviewAttribute,
  PresentationPreviewPredicate,
  PredicateType,
  Agent,
} from '../src'
import { Attachment, AttachmentData } from '../src/decorators/attachment/Attachment'
import { LinkedAttachment } from '../src/utils/LinkedAttachment'
import { uuid } from '../src/utils/uuid'

import testLogger, { TestLogger } from './logger'

export const genesisPath = process.env.GENESIS_TXN_PATH
  ? path.resolve(process.env.GENESIS_TXN_PATH)
  : path.join(__dirname, '../../../network/genesis/local-genesis.txn')

export const publicDidSeed = process.env.TEST_AGENT_PUBLIC_DID_SEED ?? '000000000000000000000000Trustee9'

export function getBaseConfig(name: string, extraConfig: Partial<InitConfig> = {}) {
  const config: InitConfig = {
    label: `Agent: ${name}`,
    walletConfig: {
      walletId: `Wallet: ${name}`,
      walletKey: `Key: ${name}`,
    },
    publicDidSeed,
    autoAcceptConnections: true,
    genesisPath,
    poolName: `pool-${name.toLowerCase()}`,
    logger: new TestLogger(LogLevel.error, name),
    ...extraConfig,
  }

  return { config, agentDependencies } as const
}

export function getAgentConfig(name: string, extraConfig: Partial<InitConfig> = {}) {
  const { config, agentDependencies } = getBaseConfig(name, extraConfig)
  return new AgentConfig(config, agentDependencies)
}

export async function waitForProofRecord(
  agent: Agent,
  {
    threadId,
    state,
    previousState,
  }: {
    threadId?: string
    state?: ProofState
    previousState?: ProofState | null
  }
): Promise<ProofRecord> {
  return new Promise((resolve) => {
    const listener = (event: ProofStateChangedEvent) => {
      const previousStateMatches = previousState === undefined || event.payload.previousState === previousState
      const threadIdMatches = threadId === undefined || event.payload.proofRecord.threadId === threadId
      const stateMatches = state === undefined || event.payload.proofRecord.state === state

      if (previousStateMatches && threadIdMatches && stateMatches) {
        agent.events.off<ProofStateChangedEvent>(ProofEventTypes.ProofStateChanged, listener)

        resolve(event.payload.proofRecord)
      }
    }

    agent.events.on<ProofStateChangedEvent>(ProofEventTypes.ProofStateChanged, listener)
  })
}

export async function waitForCredentialRecord(
  agent: Agent,
  {
    threadId,
    state,
    previousState,
  }: {
    threadId?: string
    state?: CredentialState
    previousState?: CredentialState | null
  }
): Promise<CredentialRecord> {
  return new Promise((resolve) => {
    const listener = (event: CredentialStateChangedEvent) => {
      const previousStateMatches = previousState === undefined || event.payload.previousState === previousState
      const threadIdMatches = threadId === undefined || event.payload.credentialRecord.threadId === threadId
      const stateMatches = state === undefined || event.payload.credentialRecord.state === state

      if (previousStateMatches && threadIdMatches && stateMatches) {
        agent.events.off<CredentialStateChangedEvent>(CredentialEventTypes.CredentialStateChanged, listener)

        resolve(event.payload.credentialRecord)
      }
    }

    agent.events.on<CredentialStateChangedEvent>(CredentialEventTypes.CredentialStateChanged, listener)
  })
}

export async function waitForBasicMessage(agent: Agent, { content }: { content?: string }): Promise<BasicMessage> {
  return new Promise((resolve) => {
    const listener = (event: BasicMessageReceivedEvent) => {
      const contentMatches = content === undefined || event.payload.message.content === content

      if (contentMatches) {
        agent.events.off<BasicMessageReceivedEvent>(BasicMessageEventTypes.BasicMessageReceived, listener)

        resolve(event.payload.message)
      }
    }

    agent.events.on<BasicMessageReceivedEvent>(BasicMessageEventTypes.BasicMessageReceived, listener)
  })
}

export function getMockConnection({
  state = ConnectionState.Invited,
  role = ConnectionRole.Invitee,
  id = 'test',
  did = 'test-did',
  threadId = 'threadId',
  verkey = 'key-1',
  didDoc = new DidDoc({
    id: did,
    publicKey: [],
    authentication: [],
    service: [
      new DidCommService({
        id: `${did};indy`,
        serviceEndpoint: 'https://endpoint.com',
        recipientKeys: [verkey],
      }),
    ],
  }),
  tags = {},
  invitation = new ConnectionInvitationMessage({
    label: 'test',
    recipientKeys: [verkey],
    serviceEndpoint: 'https:endpoint.com/msg',
  }),
  theirDid = 'their-did',
  theirDidDoc = new DidDoc({
    id: theirDid,
    publicKey: [],
    authentication: [],
    service: [
      new DidCommService({
        id: `${did};indy`,
        serviceEndpoint: 'https://endpoint.com',
        recipientKeys: [verkey],
      }),
    ],
  }),
}: Partial<ConnectionRecordProps> = {}) {
  return new ConnectionRecord({
    did,
    didDoc,
    threadId,
    theirDid,
    theirDidDoc,
    id,
    role,
    state,
    tags,
    verkey,
    invitation,
  })
}

export async function makeConnection(
  agentA: Agent,
  agentB: Agent,
  config?: {
    autoAcceptConnection?: boolean
    alias?: string
    mediatorId?: string
  }
) {
  // eslint-disable-next-line prefer-const
  let { invitation, connectionRecord: agentAConnection } = await agentA.connections.createConnection(config)
  let agentBConnection = await agentB.connections.receiveInvitation(invitation)

  agentAConnection = await agentA.connections.returnWhenIsConnected(agentAConnection.id)
  agentBConnection = await agentB.connections.returnWhenIsConnected(agentBConnection.id)

  return [agentAConnection, agentBConnection]
}

export async function registerSchema(agent: Agent, schemaTemplate: SchemaTemplate): Promise<Schema> {
  const schema = await agent.ledger.registerSchema(schemaTemplate)
  testLogger.test(`created schema with id ${schema.id}`, schema)
  return schema
}

export async function registerDefinition(
  agent: Agent,
  definitionTemplate: CredentialDefinitionTemplate
): Promise<CredDef> {
  const credentialDefinition = await agent.ledger.registerCredentialDefinition(definitionTemplate)
  testLogger.test(`created credential definition with id ${credentialDefinition.id}`, credentialDefinition)
  return credentialDefinition
}

export function previewFromAttributes(attributes: Record<string, string>): CredentialPreview {
  return new CredentialPreview({
    attributes: Object.entries(attributes).map(
      ([name, value]) =>
        new CredentialPreviewAttribute({
          name,
          value,
        })
    ),
  })
}

export async function prepareForIssuance(agent: Agent, attributes: string[]) {
  const publicDid = agent.publicDid?.did

  if (!publicDid) {
    throw new AriesFrameworkError('No public did')
  }

  await ensurePublicDidIsOnLedger(agent, publicDid)

  const schema = await registerSchema(agent, {
    attributes,
    name: `schema-${uuid()}`,
    version: '1.0',
  })

  const definition = await registerDefinition(agent, {
    schema,
    signatureType: 'CL',
    supportRevocation: false,
    tag: 'default',
  })

  return {
    schema,
    definition,
    publicDid,
  }
}

export async function ensurePublicDidIsOnLedger(agent: Agent, publicDid: Did) {
  try {
    testLogger.test(`Ensure test DID ${publicDid} is written to ledger`)
    await agent.ledger.getPublicDid(publicDid)
  } catch (error) {
    // Unfortunately, this won't prevent from the test suite running because of Jest runner runs all tests
    // regardless of thrown errors. We're more explicit about the problem with this error handling.
    throw new Error(`Test DID ${publicDid} is not written on ledger or ledger is not available: ${error.message}`)
  }
}

/**
 * Assumes that the autoAcceptCredential is set to {@link AutoAcceptCredential.ContentApproved}
 */
export async function issueCredential({
  issuerAgent,
  issuerConnectionId,
  holderAgent,
  credentialTemplate,
}: {
  issuerAgent: Agent
  issuerConnectionId: string
  holderAgent: Agent
  credentialTemplate: Omit<CredentialOfferTemplate, 'autoAcceptCredential'>
}) {
  let issuerCredentialRecord = await issuerAgent.credentials.offerCredential(issuerConnectionId, {
    ...credentialTemplate,
    autoAcceptCredential: AutoAcceptCredential.ContentApproved,
  })

  let holderCredentialRecord = await waitForCredentialRecord(holderAgent, {
    threadId: issuerCredentialRecord.threadId,
    state: CredentialState.OfferReceived,
  })

  await holderAgent.credentials.acceptOffer(holderCredentialRecord.id, {
    autoAcceptCredential: AutoAcceptCredential.ContentApproved,
  })

  holderCredentialRecord = await waitForCredentialRecord(holderAgent, {
    threadId: issuerCredentialRecord.threadId,
    state: CredentialState.Done,
  })

  issuerCredentialRecord = await waitForCredentialRecord(issuerAgent, {
    threadId: issuerCredentialRecord.threadId,
    state: CredentialState.Done,
  })

  return {
    issuerCredential: issuerCredentialRecord,
    holderCredential: holderCredentialRecord,
  }
}

export async function presentProof({
  verifierAgent,
  verifierConnectionId,
  holderAgent,
  presentationTemplate: { attributes, predicates },
}: {
  verifierAgent: Agent
  verifierConnectionId: string
  holderAgent: Agent
  presentationTemplate: {
    attributes?: Record<string, ProofAttributeInfo>
    predicates?: Record<string, ProofPredicateInfo>
  }
}) {
  let verifierRecord = await verifierAgent.proofs.requestProof(verifierConnectionId, {
    name: 'test-proof-request',
    requestedAttributes: attributes,
    requestedPredicates: predicates,
  })

  let holderRecord = await waitForProofRecord(holderAgent, {
    threadId: verifierRecord.threadId,
    state: ProofState.RequestReceived,
  })

  const verifierRecordPromise = waitForProofRecord(verifierAgent, {
    threadId: holderRecord.threadId,
    state: ProofState.PresentationReceived,
  })

  const indyProofRequest = holderRecord.requestMessage?.indyProofRequest
  if (!indyProofRequest) {
    throw new Error('indyProofRequest missing')
  }
  const retrievedCredentials = await holderAgent.proofs.getRequestedCredentialsForProofRequest(indyProofRequest)
  const requestedCredentials = holderAgent.proofs.autoSelectCredentialsForProofRequest(retrievedCredentials)
  await holderAgent.proofs.acceptRequest(holderRecord.id, requestedCredentials)

  verifierRecord = await verifierRecordPromise

  // assert presentation is valid
  expect(verifierRecord.isVerified).toBe(true)

  const holderRecordPromise = waitForProofRecord(holderAgent, {
    threadId: holderRecord.threadId,
    state: ProofState.Done,
  })

  verifierRecord = await verifierAgent.proofs.acceptPresentation(verifierRecord.id)
  holderRecord = await holderRecordPromise

  return {
    verifierProof: verifierRecord,
    holderProof: holderRecord,
  }
}

/**
 * Returns mock of function with correct type annotations according to original function `fn`.
 * It can be used also for class methods.
 *
 * @param fn function you want to mock
 * @returns mock function with type annotations
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mockFunction<T extends (...args: any[]) => any>(fn: T): jest.MockedFunction<T> {
  return fn as jest.MockedFunction<T>
}

export async function setupCredentialTests(
  faberName: string,
  aliceName: string,
  autoAcceptCredentials?: AutoAcceptCredential
) {
  const faberMessages = new Subject<SubjectMessage>()
  const aliceMessages = new Subject<SubjectMessage>()
  const subjectMap = {
    'rxjs:faber': faberMessages,
    'rxjs:alice': aliceMessages,
  }
  const faberConfig = getBaseConfig(faberName, {
    genesisPath,
    endpoint: 'rxjs:faber',
    autoAcceptCredentials,
  })

  const aliceConfig = getBaseConfig(aliceName, {
    genesisPath,
    endpoint: 'rxjs:alice',
    autoAcceptCredentials,
  })
  const faberAgent = new Agent(faberConfig.config, faberConfig.agentDependencies)
  faberAgent.setInboundTransporter(new SubjectInboundTransporter(faberMessages))
  faberAgent.setOutboundTransporter(new SubjectOutboundTransporter(aliceMessages, subjectMap))
  await faberAgent.initialize()

  const aliceAgent = new Agent(aliceConfig.config, aliceConfig.agentDependencies)
  aliceAgent.setInboundTransporter(new SubjectInboundTransporter(aliceMessages))
  aliceAgent.setOutboundTransporter(new SubjectOutboundTransporter(faberMessages, subjectMap))
  await aliceAgent.initialize()

  const {
    schema: { id: schemaId },
    definition: { id: credDefId },
  } = await prepareForIssuance(faberAgent, ['name', 'age', 'profile_picture', 'x-ray'])

  const [faberConnection, aliceConnection] = await makeConnection(faberAgent, aliceAgent)

  return { faberAgent, aliceAgent, credDefId, schemaId, faberConnection, aliceConnection }
}

export async function setupProofsTest(faberName: string, aliceName: string, autoAcceptProofs?: AutoAcceptProof) {
  const credentialPreview = new CredentialPreview({
    attributes: [
      new CredentialPreviewAttribute({
        name: 'name',
        mimeType: 'text/plain',
        value: 'John',
      }),
      new CredentialPreviewAttribute({
        name: 'age',
        mimeType: 'text/plain',
        value: '99',
      }),
    ],
  })

  const faberConfig = getBaseConfig(faberName, {
    genesisPath,
    autoAcceptProofs,
    endpoint: 'rxjs:faber',
  })

  const aliceConfig = getBaseConfig(aliceName, {
    genesisPath,
    autoAcceptProofs,
    endpoint: 'rxjs:alice',
  })

  const faberMessages = new Subject<SubjectMessage>()
  const aliceMessages = new Subject<SubjectMessage>()

  const subjectMap = {
    'rxjs:faber': faberMessages,
    'rxjs:alice': aliceMessages,
  }
  const faberAgent = new Agent(faberConfig.config, faberConfig.agentDependencies)
  faberAgent.setInboundTransporter(new SubjectInboundTransporter(faberMessages))
  faberAgent.setOutboundTransporter(new SubjectOutboundTransporter(aliceMessages, subjectMap))
  await faberAgent.initialize()

  const aliceAgent = new Agent(aliceConfig.config, aliceConfig.agentDependencies)
  aliceAgent.setInboundTransporter(new SubjectInboundTransporter(aliceMessages))
  aliceAgent.setOutboundTransporter(new SubjectOutboundTransporter(faberMessages, subjectMap))
  await aliceAgent.initialize()

  const schemaTemplate = {
    name: `test-schema-${Date.now()}`,
    attributes: ['name', 'age', 'image_0', 'image_1'],
    version: '1.0',
  }
  const schema = await registerSchema(faberAgent, schemaTemplate)

  const definitionTemplate = {
    schema,
    tag: 'TAG',
    signatureType: 'CL' as const,
    supportRevocation: false,
  }
  const credentialDefinition = await registerDefinition(faberAgent, definitionTemplate)
  const credDefId = credentialDefinition.id

  const publicDid = faberAgent.publicDid?.did
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  await ensurePublicDidIsOnLedger(faberAgent, publicDid!)
  const [agentAConnection, agentBConnection] = await makeConnection(faberAgent, aliceAgent)
  expect(agentAConnection.isReady).toBe(true)
  expect(agentBConnection.isReady).toBe(true)

  const faberConnection = agentAConnection
  const aliceConnection = agentBConnection

  const presentationPreview = new PresentationPreview({
    attributes: [
      new PresentationPreviewAttribute({
        name: 'name',
        credentialDefinitionId: credDefId,
        referent: '0',
        value: 'John',
      }),
      new PresentationPreviewAttribute({
        name: 'image_0',
        credentialDefinitionId: credDefId,
      }),
    ],
    predicates: [
      new PresentationPreviewPredicate({
        name: 'age',
        credentialDefinitionId: credDefId,
        predicate: PredicateType.GreaterThanOrEqualTo,
        threshold: 50,
      }),
    ],
  })

  await issueCredential({
    issuerAgent: faberAgent,
    issuerConnectionId: faberConnection.id,
    holderAgent: aliceAgent,
    credentialTemplate: {
      credentialDefinitionId: credDefId,
      comment: 'some comment about credential',
      preview: credentialPreview,
      linkedAttachments: [
        new LinkedAttachment({
          name: 'image_0',
          attachment: new Attachment({
            filename: 'picture-of-a-cat.png',
            data: new AttachmentData({ base64: 'cGljdHVyZSBvZiBhIGNhdA==' }),
          }),
        }),
        new LinkedAttachment({
          name: 'image_1',
          attachment: new Attachment({
            filename: 'picture-of-a-dog.png',
            data: new AttachmentData({ base64: 'UGljdHVyZSBvZiBhIGRvZw==' }),
          }),
        }),
      ],
    },
  })

  return { faberAgent, aliceAgent, credDefId, faberConnection, aliceConnection, presentationPreview }
}
