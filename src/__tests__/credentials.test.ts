/* eslint-disable no-console */
import indy from 'indy-sdk'
import { Subject } from 'rxjs'
import { Agent, ConnectionRecord } from '..'
import {
  ensurePublicDidIsOnLedger,
  makeConnection,
  registerDefinition,
  registerSchema,
  SubjectInboundTransporter,
  SubjectOutboundTransporter,
  waitForCredentialRecord,
  genesisPath,
} from './helpers'
import {
  CredentialRecord,
  CredentialState,
  CredentialPreview,
  CredentialPreviewAttribute,
} from '../modules/credentials'
import { InitConfig } from '../types'
import { JsonTransformer } from '../utils/JsonTransformer'

import testLogger from './logger'

const faberConfig: InitConfig = {
  label: 'Faber',
  walletConfig: { id: 'credentials-test-faber' },
  walletCredentials: { key: '00000000000000000000000000000Test01' },
  publicDidSeed: process.env.TEST_AGENT_PUBLIC_DID_SEED,
  autoAcceptConnections: true,
  genesisPath,
  poolName: 'credentials-test-faber-pool',
  indy,
  logger: testLogger,
}

const aliceConfig: InitConfig = {
  label: 'Alice',
  walletConfig: { id: 'credentials-test-alice' },
  walletCredentials: { key: '00000000000000000000000000000Test01' },
  autoAcceptConnections: true,
  genesisPath,
  poolName: 'credentials-test-alice-pool',
  indy,
  logger: testLogger,
}

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

describe('credentials', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let credDefId: string
  let schemaId: string
  let faberConnection: ConnectionRecord
  let aliceConnection: ConnectionRecord
  let faberCredentialRecord: CredentialRecord
  let aliceCredentialRecord: CredentialRecord

  beforeAll(async () => {
    const faberMessages = new Subject()
    const aliceMessages = new Subject()

    faberAgent = new Agent(faberConfig)
    faberAgent.setInboundTransporter(new SubjectInboundTransporter(faberMessages, aliceMessages))
    faberAgent.setOutboundTransporter(new SubjectOutboundTransporter(aliceMessages))
    await faberAgent.init()

    aliceAgent = new Agent(aliceConfig)
    aliceAgent.setInboundTransporter(new SubjectInboundTransporter(aliceMessages, faberMessages))
    aliceAgent.setOutboundTransporter(new SubjectOutboundTransporter(faberMessages))
    await aliceAgent.init()

    const schemaTemplate = {
      name: `test-schema-${Date.now()}`,
      attributes: ['name', 'age'],
      version: '1.0',
    }
    const [ledgerSchemaId, ledgerSchema] = await registerSchema(faberAgent, schemaTemplate)
    schemaId = ledgerSchemaId

    const definitionTemplate = {
      schema: ledgerSchema,
      tag: 'TAG',
      signatureType: 'CL',
      config: { supportRevocation: false },
    }
    const [ledgerCredDefId] = await registerDefinition(faberAgent, definitionTemplate)
    credDefId = ledgerCredDefId

    const publicDid = faberAgent.publicDid?.did
    await ensurePublicDidIsOnLedger(faberAgent, publicDid!)
    const { agentAConnection, agentBConnection } = await makeConnection(faberAgent, aliceAgent)
    faberConnection = agentAConnection
    aliceConnection = agentBConnection
  })

  afterAll(async () => {
    await faberAgent.closeAndDeleteWallet()
    await aliceAgent.closeAndDeleteWallet()
  })

  test('Alice starts with credential proposal to Faber', async () => {
    testLogger.test('Alice sends credential proposal to Faber')
    let aliceCredentialRecord = await aliceAgent.credentials.proposeCredential(aliceConnection.id, {
      credentialProposal: credentialPreview,
      credentialDefinitionId: credDefId,
    })

    testLogger.test('Faber waits for credential proposal from Alice')
    let faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.tags.threadId,
      state: CredentialState.ProposalReceived,
    })

    testLogger.test('Faber sends credential offer to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptProposal(faberCredentialRecord.id, {
      comment: 'some comment about credential',
    })

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.OfferReceived,
    })

    expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
      createdAt: expect.any(Date),
      offerMessage: {
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/issue-credential/1.0/offer-credential',
        comment: 'some comment about credential',
        credential_preview: {
          '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
          attributes: [
            {
              name: 'name',
              'mime-type': 'text/plain',
              value: 'John',
            },
            {
              name: 'age',
              'mime-type': 'text/plain',
              value: '99',
            },
          ],
        },
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })

    // below values are not in json object
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.tags).toEqual({ threadId: faberCredentialRecord.tags.threadId })
    expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

    testLogger.test('Alice sends credential request to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential request from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.tags.threadId,
      state: CredentialState.RequestReceived,
    })

    testLogger.test('Faber sends credential to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

    testLogger.test('Alice waits for credential from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.CredentialReceived,
    })

    testLogger.test('Alice sends credential ack to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential ack from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.Done,
    })

    expect(aliceCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      tags: {
        threadId: expect.any(String),
      },
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      metadata: {
        requestMetadata: expect.any(Object),
        schemaId,
        credentialDefinitionId: credDefId,
      },
      credentialId: expect.any(String),
      state: CredentialState.Done,
    })

    expect(faberCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      tags: {
        threadId: expect.any(String),
      },
      metadata: {
        schemaId,
        credentialDefinitionId: credDefId,
      },
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      state: CredentialState.Done,
    })
  })

  test('Faber starts with credential offer to Alice', async () => {
    testLogger.test('Faber sends credential offer to Alice')
    faberCredentialRecord = await faberAgent.credentials.offerCredential(faberConnection.id, {
      preview: credentialPreview,
      credentialDefinitionId: credDefId,
      comment: 'some comment about credential',
    })

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.OfferReceived,
    })

    expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
      createdAt: expect.any(Date),
      offerMessage: {
        '@id': expect.any(String),
        '@type': 'https://didcomm.org/issue-credential/1.0/offer-credential',
        comment: 'some comment about credential',
        credential_preview: {
          '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
          attributes: [
            {
              name: 'name',
              'mime-type': 'text/plain',
              value: 'John',
            },
            {
              name: 'age',
              'mime-type': 'text/plain',
              value: '99',
            },
          ],
        },
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })

    // below values are not in json object
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.tags).toEqual({ threadId: faberCredentialRecord.tags.threadId })
    expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

    testLogger.test('Alice sends credential request to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential request from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.tags.threadId,
      state: CredentialState.RequestReceived,
    })

    testLogger.test('Faber sends credential to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

    testLogger.test('Alice waits for credential from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.CredentialReceived,
    })

    testLogger.test('Alice sends credential ack to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential ack from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: faberCredentialRecord.tags.threadId,
      state: CredentialState.Done,
    })

    expect(aliceCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      tags: {
        threadId: expect.any(String),
      },
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      metadata: { requestMetadata: expect.any(Object) },
      credentialId: expect.any(String),
      state: CredentialState.Done,
    })

    expect(faberCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      tags: {
        threadId: expect.any(String),
      },
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      state: CredentialState.Done,
    })
  })
})
