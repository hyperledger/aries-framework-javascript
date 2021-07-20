import type { Agent } from '../src/agent/Agent'
import type { ConnectionRecord } from '../src/modules/connections'

import { AutoAcceptCredential, CredentialRecord, CredentialState } from '../src/modules/credentials'
import { JsonTransformer } from '../src/utils/JsonTransformer'
import { sleep } from '../src/utils/sleep'

import { previewFromAttributes, setupCredentialTests, waitForCredentialRecord } from './helpers'
import testLogger from './logger'

const credentialPreview = previewFromAttributes({
  name: 'John',
  age: '99',
})

const newCredentialPreview = previewFromAttributes({
  name: 'John',
  age: '99',
  lastname: 'Appleseed',
})

describe('auto accept credentials', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let credDefId: string
  let schemaId: string
  let faberConnection: ConnectionRecord
  let aliceConnection: ConnectionRecord
  let faberCredentialRecord: CredentialRecord
  let aliceCredentialRecord: CredentialRecord

  describe('Auto accept on `always`', () => {
    beforeAll(async () => {
      ;({ faberAgent, aliceAgent, credDefId, schemaId, faberConnection, aliceConnection } = await setupCredentialTests(
        'faber agent: always',
        'alice agent: always',
        AutoAcceptCredential.Always
      ))
    })

    afterAll(async () => {
      await aliceAgent.shutdown({
        deleteWallet: true,
      })
      await faberAgent.shutdown({
        deleteWallet: true,
      })
    })

    test('Alice starts with credential proposal to Faber, both with autoAcceptCredential on `always`', async () => {
      testLogger.test('Alice sends credential proposal to Faber')
      let aliceCredentialRecord = await aliceAgent.credentials.proposeCredential(aliceConnection.id, {
        credentialProposal: credentialPreview,
        credentialDefinitionId: credDefId,
      })

      testLogger.test('Alice waits for credential from Faber')
      aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
        threadId: aliceCredentialRecord.threadId,
        state: CredentialState.CredentialReceived,
      })

      testLogger.test('Faber waits for credential ack from Alice')
      faberCredentialRecord = await waitForCredentialRecord(faberAgent, {
        threadId: aliceCredentialRecord.threadId,
        state: CredentialState.Done,
      })

      expect(aliceCredentialRecord).toMatchObject({
        type: CredentialRecord.name,
        id: expect.any(String),
        createdAt: expect.any(Date),
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
        metadata: {
          schemaId,
          credentialDefinitionId: credDefId,
        },
        offerMessage: expect.any(Object),
        requestMessage: expect.any(Object),
        state: CredentialState.Done,
      })
    })

    test('Faber starts with credential offer to Alice, both with autoAcceptCredential on `always`', async () => {
      testLogger.test('Faber sends credential offer to Alice')
      faberCredentialRecord = await faberAgent.credentials.offerCredential(faberConnection.id, {
        preview: credentialPreview,
        credentialDefinitionId: credDefId,
        comment: 'some comment about credential',
      })

      testLogger.test('Alice waits for credential from Faber')
      aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
        threadId: faberCredentialRecord.threadId,
        state: CredentialState.CredentialReceived,
      })

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
      })

      expect(faberCredentialRecord).toMatchObject({
        type: CredentialRecord.name,
        id: expect.any(String),
        createdAt: expect.any(Date),
        offerMessage: expect.any(Object),
        requestMessage: expect.any(Object),
        state: CredentialState.Done,
      })
    })
  })

  describe('Auto accept on `contentApproved`', () => {
    beforeAll(async () => {
      ;({ faberAgent, aliceAgent, credDefId, schemaId, faberConnection, aliceConnection } = await setupCredentialTests(
        'faber agent: contentApproved',
        'alice agent: contentApproved',
        AutoAcceptCredential.ContentApproved
      ))
    })

    afterAll(async () => {
      await aliceAgent.shutdown({
        deleteWallet: true,
      })
      await faberAgent.shutdown({
        deleteWallet: true,
      })
    })

    test('Alice starts with credential proposal to Faber, both with autoAcceptCredential on `contentApproved`', async () => {
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
      faberCredentialRecord = await faberAgent.credentials.acceptProposal(faberCredentialRecord.id)

      testLogger.test('Alice waits for credential from Faber')
      aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
        threadId: faberCredentialRecord.threadId,
        state: CredentialState.CredentialReceived,
      })

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
        metadata: {
          schemaId,
          credentialDefinitionId: credDefId,
        },
        offerMessage: expect.any(Object),
        requestMessage: expect.any(Object),
        state: CredentialState.Done,
      })
    })

    test('Faber starts with credential offer to Alice, both with autoAcceptCredential on `contentApproved`', async () => {
      testLogger.test('Faber sends credential offer to Alice')
      faberCredentialRecord = await faberAgent.credentials.offerCredential(faberConnection.id, {
        preview: credentialPreview,
        credentialDefinitionId: credDefId,
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
          credential_preview: {
            '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
            attributes: [
              {
                name: 'name',
                value: 'John',
              },
              {
                name: 'age',
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
        threadId: aliceCredentialRecord.threadId,
        state: aliceCredentialRecord.state,
        connectionId: aliceConnection.id,
      })
      expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

      testLogger.test('alice sends credential request to faber')
      aliceCredentialRecord = await aliceAgent.credentials.acceptOffer(aliceCredentialRecord.id)

      testLogger.test('Alice waits for credential from Faber')
      aliceCredentialRecord = await waitForCredentialRecord(aliceAgent, {
        threadId: faberCredentialRecord.threadId,
        state: CredentialState.CredentialReceived,
      })

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
      })

      expect(faberCredentialRecord).toMatchObject({
        type: CredentialRecord.name,
        id: expect.any(String),
        createdAt: expect.any(Date),
        offerMessage: expect.any(Object),
        requestMessage: expect.any(Object),
        state: CredentialState.Done,
      })
    })

    test('Alice starts with credential proposal to Faber, both have autoAcceptCredential on `contentApproved` and attributes did change', async () => {
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

      faberCredentialRecord = await faberAgent.credentials.negotiateProposal(
        faberCredentialRecord.id,
        newCredentialPreview
      )

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
          credential_preview: {
            '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
            attributes: [
              {
                name: 'name',
                value: 'John',
              },
              {
                name: 'age',
                value: '99',
              },
              {
                name: 'lastname',
                value: 'Appleseed',
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
        threadId: aliceCredentialRecord.threadId,
        state: aliceCredentialRecord.state,
        connectionId: aliceConnection.id,
      })
      expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

      // Wait for ten seconds
      await sleep(5000)

      // Check if the state of the credential records did not change
      faberCredentialRecord = await faberAgent.credentials.getById(faberCredentialRecord.id)
      faberCredentialRecord.assertState(CredentialState.OfferSent)

      aliceCredentialRecord = await aliceAgent.credentials.getById(aliceCredentialRecord.id)
      aliceCredentialRecord.assertState(CredentialState.OfferReceived)
    })

    test('Faber starts with credential offer to Alice, both have autoAcceptCredential on `contentApproved` and attributes did change', async () => {
      testLogger.test('Faber sends credential offer to Alice')
      faberCredentialRecord = await faberAgent.credentials.offerCredential(faberConnection.id, {
        preview: credentialPreview,
        credentialDefinitionId: credDefId,
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
          credential_preview: {
            '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
            attributes: [
              {
                name: 'name',
                value: 'John',
              },
              {
                name: 'age',
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
        threadId: aliceCredentialRecord.threadId,
        state: aliceCredentialRecord.state,
        connectionId: aliceConnection.id,
      })
      expect(aliceCredentialRecord.type).toBe(CredentialRecord.name)

      testLogger.test('Alice sends credential request to Faber')
      aliceCredentialRecord = await aliceAgent.credentials.negotiateOffer(
        aliceCredentialRecord.id,
        newCredentialPreview
      )

      expect(JsonTransformer.toJSON(aliceCredentialRecord)).toMatchObject({
        createdAt: expect.any(Date),
        proposalMessage: {
          '@type': 'https://didcomm.org/issue-credential/1.0/propose-credential',
          '@id': expect.any(String),
          credential_proposal: {
            '@type': 'https://didcomm.org/issue-credential/1.0/credential-preview',
            attributes: [
              {
                name: 'name',
                value: 'John',
              },
              {
                name: 'age',
                value: '99',
              },
              {
                name: 'lastname',
                value: 'Appleseed',
              },
            ],
          },
          '~thread': { thid: expect.any(String) },
        },
        state: CredentialState.ProposalSent,
      })

      // Wait for ten seconds
      await sleep(5000)

      // Check if the state of fabers credential record did not change
      faberCredentialRecord = await faberAgent.credentials.getById(faberCredentialRecord.id)
      faberCredentialRecord.assertState(CredentialState.ProposalReceived)

      aliceCredentialRecord = await aliceAgent.credentials.getById(aliceCredentialRecord.id)
      aliceCredentialRecord.assertState(CredentialState.ProposalSent)
    })
  })
})
