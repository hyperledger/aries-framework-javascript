import type { ConnectionRecord } from '../modules/connections'

import { Subject } from 'rxjs'

import { Agent } from '../agent/Agent'
import { Attachment, AttachmentData } from '../decorators/attachment/Attachment'
import {
  CredentialRecord,
  CredentialState,
  CredentialPreview,
  CredentialPreviewAttribute,
} from '../modules/credentials'
import { JsonTransformer } from '../utils/JsonTransformer'
import { LinkedAttachment } from '../utils/LinkedAttachment'

import {
  ensurePublicDidIsOnLedger,
  genesisPath,
  getBaseConfig,
  makeConnection,
  registerDefinition,
  registerSchema,
  SubjectInboundTransporter,
  SubjectOutboundTransporter,
  waitForCredentialRecord,
} from './helpers'
import testLogger from './logger'

const faberConfig = getBaseConfig('Faber Credentials', {
  genesisPath,
})

const aliceConfig = getBaseConfig('Alice Credentials', {
  genesisPath,
})

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
      attributes: ['name', 'age', 'profile_picture', 'x-ray'],
      version: '1.0',
    }
    const schema = await registerSchema(faberAgent, schemaTemplate)
    schemaId = schema.id

    const definitionTemplate = {
      schema,
      tag: 'TAG',
      signatureType: 'CL' as const,
      supportRevocation: false,
    }
    const credentialDefinition = await registerDefinition(faberAgent, definitionTemplate)
    credDefId = credentialDefinition.id

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
      threadId: aliceCredentialRecord.threadId,
      state: CredentialState.ProposalReceived,
    })

    testLogger.test('Faber sends credential offer to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptProposal(faberCredentialRecord.id, {
      comment: 'some comment about credential',
    })

    testLogger.test('Alice waits for credential offer from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
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
    expect(aliceCredentialRecord.getTags()).toEqual({
      threadId: faberCredentialRecord.threadId,
      connectionId: aliceCredentialRecord.connectionId,
      state: aliceCredentialRecord.state,
    })
    expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

    testLogger.test('Alice sends credential request to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential request from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.threadId,
      state: CredentialState.RequestReceived,
    })

    testLogger.test('Faber sends credential to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

    testLogger.test('Alice waits for credential from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.CredentialReceived,
    })

    testLogger.test('Alice sends credential ack to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential ack from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.Done,
    })

    expect(aliceCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      threadId: expect.any(String),
      connectionId: expect.any(String),
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
      threadId: expect.any(String),
      connectionId: expect.any(String),
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
      threadId: faberCredentialRecord.threadId,
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
    expect(aliceCredentialRecord.getTags()).toEqual({
      threadId: faberCredentialRecord.threadId,
      connectionId: aliceConnection.id,
      state: aliceCredentialRecord.state,
    })
    expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

    testLogger.test('Alice sends credential request to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential request from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: aliceCredentialRecord.threadId,
      state: CredentialState.RequestReceived,
    })

    testLogger.test('Faber sends credential to Alice')
    faberCredentialRecord = await faberAgent.credentials.acceptRequest(faberCredentialRecord.id)

    testLogger.test('Alice waits for credential from Faber')
    aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.CredentialReceived,
    })

    testLogger.test('Alice sends credential ack to Faber')
    aliceCredentialRecord = await aliceAgent.credentials.acceptCredential(aliceCredentialRecord.id)

    testLogger.test('Faber waits for credential ack from Alice')
    faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
      threadId: faberCredentialRecord.threadId,
      state: CredentialState.Done,
    })

    expect(aliceCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      metadata: { requestMetadata: expect.any(Object) },
      credentialId: expect.any(String),
      state: CredentialState.Done,
      threadId: expect.any(String),
    })

    expect(faberCredentialRecord).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Date),
      offerMessage: expect.any(Object),
      requestMessage: expect.any(Object),
      state: CredentialState.Done,
      threadId: expect.any(String),
      connectionId: expect.any(String),
    })
  })

  test('Alice starts with credential proposal, with attachments, to Faber', async () => {
    testLogger.test('Alice sends credential proposal to Faber')
    let aliceCredentialRecord = await aliceAgent.credentials.proposeCredential(aliceConnection.id, {
      credentialProposal: credentialPreview,
      credentialDefinitionId: credDefId,
      linkedAttachments: [
        new LinkedAttachment({
          name: 'profile_picture',
          attachment: new Attachment({
            mimeType: 'image/png',
            data: new AttachmentData({ base64: 'base64encodedpic' }),
          }),
        }),
      ],
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
            {
              name: 'profile_picture',
              'mime-type': 'image/png',
              value: 'hl:zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg',
            },
          ],
        },
        '~attach': [{ '@id': 'zQmcKEWE6eZWpVqGKhbmhd8SxWBa9fgLX7aYW8RJzeHQMZg' }],
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })

    // below values are not in json object
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.tags).toEqual({
      threadId: faberCredentialRecord.tags.threadId,
      connectionId: aliceCredentialRecord.tags.connectionId,
    })
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
        connectionId: expect.any(String),
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
        connectionId: expect.any(String),
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

  test('Faber starts with credential, with attachments, offer to Alice', async () => {
    testLogger.test('Faber sends credential offer to Alice')
    faberCredentialRecord = await faberAgent.credentials.offerCredential(faberConnection.id, {
      preview: credentialPreview,
      credentialDefinitionId: credDefId,
      comment: 'some comment about credential',
      linkedAttachments: [
        new LinkedAttachment({
          name: 'x-ray',
          attachment: new Attachment({
            data: new AttachmentData({
              json: {
                hello: 'world',
              },
            }),
          }),
        }),
      ],
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
            {
              name: 'x-ray',
              value: 'hl:zQmYGx7Wzqe5prvEsTSzYBQN8xViYUM9qsWJSF5EENLcNmM',
            },
          ],
        },
        '~attach': [{ '@id': 'zQmYGx7Wzqe5prvEsTSzYBQN8xViYUM9qsWJSF5EENLcNmM' }],
        'offers~attach': expect.any(Array),
      },
      state: CredentialState.OfferReceived,
    })

    // below values are not in json object
    expect(aliceCredentialRecord.id).not.toBeNull()
    expect(aliceCredentialRecord.tags).toEqual({
      threadId: faberCredentialRecord.tags.threadId,
      connectionId: aliceCredentialRecord.tags.connectionId,
    })
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
