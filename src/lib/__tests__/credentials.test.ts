/* eslint-disable no-console */
// @ts-ignore
import { poll } from 'await-poll';
import { Subject } from 'rxjs';
import path from 'path';
import indy from 'indy-sdk';
import { Agent } from '..';
import {
  ensurePublicDidIsOnLedger,
  makeConnection,
  registerDefinition,
  registerSchema,
  SubjectInboundTransporter,
  SubjectOutboundTransporter,
} from './helpers';
import { CredentialRecord } from '../storage/CredentialRecord';
import {
  CredentialPreview,
  CredentialPreviewAttribute,
} from '../protocols/credentials/messages/CredentialOfferMessage';
import { CredentialState } from '../protocols/credentials/CredentialState';
import { InitConfig } from '../types';

const genesisPath = process.env.GENESIS_TXN_PATH
  ? path.resolve(process.env.GENESIS_TXN_PATH)
  : path.join(__dirname, '../../../network/genesis/local-genesis.txn');

const faberConfig: InitConfig = {
  label: 'Faber',
  walletConfig: { id: 'credentials-test-faber' },
  walletCredentials: { key: '00000000000000000000000000000Test01' },
  publicDidSeed: process.env.TEST_AGENT_PUBLIC_DID_SEED,
  autoAcceptConnections: true,
  genesisPath,
  poolName: 'credentials-test-faber-pool',
};

const aliceConfig: InitConfig = {
  label: 'Alice',
  walletConfig: { id: 'credentials-test-alice' },
  walletCredentials: { key: '00000000000000000000000000000Test01' },
  autoAcceptConnections: true,
  genesisPath,
  poolName: 'credentials-test-alice-pool',
};

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
});

describe('credentials', () => {
  let faberAgent: Agent;
  let aliceAgent: Agent;
  let credDefId: CredDefId;

  beforeAll(async () => {
    const faberMessages = new Subject();
    const aliceMessages = new Subject();

    const faberAgentInbound = new SubjectInboundTransporter(faberMessages);
    const faberAgentOutbound = new SubjectOutboundTransporter(aliceMessages);
    const aliceAgentInbound = new SubjectInboundTransporter(aliceMessages);
    const aliceAgentOutbound = new SubjectOutboundTransporter(faberMessages);

    faberAgent = new Agent(faberConfig, faberAgentInbound, faberAgentOutbound, indy);
    aliceAgent = new Agent(aliceConfig, aliceAgentInbound, aliceAgentOutbound, indy);
    await faberAgent.init();
    await aliceAgent.init();

    const schemaTemplate = {
      name: `test-schema-${Date.now()}`,
      attributes: ['name', 'age'],
      version: '1.0',
    };
    const [, ledgerSchema] = await registerSchema(faberAgent, schemaTemplate);

    const definitionTemplate = {
      schema: ledgerSchema,
      tag: 'TAG',
      signatureType: 'CL',
      config: { support_revocation: false },
    };
    const [ledgerCredDefId] = await registerDefinition(faberAgent, definitionTemplate);
    credDefId = ledgerCredDefId;

    const publidDid = faberAgent.getPublicDid()?.did ?? 'Th7MpTaRZVRYnPiabds81Y';
    await ensurePublicDidIsOnLedger(faberAgent, publidDid);
    await makeConnection(faberAgent, aliceAgent);
  });

  afterAll(async () => {
    await faberAgent.closeAndDeleteWallet();
    await aliceAgent.closeAndDeleteWallet();
  });

  test(`when faber issues credential then alice gets credential offer`, async () => {
    // We assume that Faber has only one connection and it's a connection with Alice
    const [firstConnection] = await faberAgent.connections.getAll();

    // Issue credential from Faber to Alice
    await faberAgent.credentials.issueCredential(firstConnection, {
      credentialDefinitionId: credDefId,
      comment: 'some comment about credential',
      preview: credentialPreview,
    });

    // We assume that Alice has only one credential and it's a credential from Faber
    const [firstCredential] = await poll(
      () => aliceAgent.credentials.getCredentials(),
      (credentials: CredentialRecord[]) => credentials.length < 1,
      100
    );

    expect(firstCredential).toMatchObject({
      createdAt: expect.any(Number),
      id: expect.any(String),
      offer: {
        '@id': expect.any(String),
        '@type': 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/issue-credential/1.0/offer-credential',
        comment: 'some comment about credential',
        credential_preview: {
          '@type': 'did:sov:BzCbsNYhMrjHiqZDTUASHg;spec/issue-credential/1.0/credential-preview',
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
      tags: { threadId: firstCredential.offer['@id'] },
      type: CredentialRecord.name,
      state: CredentialState.OfferReceived,
    });
  });

  test(`when alice accepts the credential offer then faber sends a credential to alice`, async () => {
    // We assume that Alice has only one credential and it's a credential from Faber
    let [aliceCredential] = await aliceAgent.credentials.getCredentials();

    // We assume that Faber has only one credential and it's a credential issued to Alice
    let [faberCredential] = await faberAgent.credentials.getCredentials();

    // Accept credential offer from Faber
    await aliceAgent.credentials.acceptCredential(aliceCredential);

    aliceCredential = await poll(
      () => aliceAgent.credentials.find(aliceCredential.id),
      (credentialRecord: CredentialRecord) => !credentialRecord || credentialRecord.state !== CredentialState.Done,
      100
    );
    console.log('aliceCredential', aliceCredential);

    faberCredential = await poll(
      async () => faberAgent.credentials.find(faberCredential.id),
      (credentialRecord: CredentialRecord) => !credentialRecord || credentialRecord.state !== CredentialState.Done,
      100
    );
    console.log('faberCredential', faberCredential);

    expect(aliceCredential).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Number),
      tags: {
        threadId: expect.any(String),
      },
      offer: expect.any(Object),
      request: undefined,
      requestMetadata: expect.any(Object),
      credentialId: expect.any(String),
      state: CredentialState.Done,
    });

    expect(faberCredential).toMatchObject({
      type: CredentialRecord.name,
      id: expect.any(String),
      createdAt: expect.any(Number),
      tags: {
        threadId: expect.any(String),
      },
      offer: expect.any(Object),
      request: expect.any(Object),
      requestMetadata: undefined,
      credentialId: undefined,
      state: CredentialState.Done,
    });
  });
});
