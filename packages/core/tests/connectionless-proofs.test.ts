import type { SubjectMessage } from '../../../tests/transport/SubjectInboundTransport'
import type { ProofStateChangedEvent } from '../src/modules/proofs'
import type { CredDefId } from 'indy-sdk'

import { ReplaySubject, Subject } from 'rxjs'

import { SubjectInboundTransporter } from '../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransporter } from '../../../tests/transport/SubjectOutboundTransport'
import { Agent } from '../src/agent/Agent'
import {
  PredicateType,
  PresentationPreview,
  PresentationPreviewAttribute,
  PresentationPreviewPredicate,
  ProofState,
  ProofAttributeInfo,
  AttributeFilter,
  ProofPredicateInfo,
  ProofEventTypes,
} from '../src/modules/proofs'

import {
  getBaseConfig,
  issueConnectionLessCredential,
  prepareForIssuance,
  previewFromAttributes,
  waitForProofRecordSubject,
} from './helpers'
import testLogger from './logger'

const faberConfig = getBaseConfig('Faber connection-less Proofs', {
  endpoint: 'rxjs:faber',
})
const aliceConfig = getBaseConfig('Alice connection-less Proofs', {
  endpoint: 'rxjs:alice',
})

const credentialPreview = previewFromAttributes({
  name: 'John',
  age: '99',
})

describe('Present Proof', () => {
  let faberAgent: Agent
  let aliceAgent: Agent
  let faberReplay: ReplaySubject<ProofStateChangedEvent>
  let aliceReplay: ReplaySubject<ProofStateChangedEvent>
  let credDefId: CredDefId
  let presentationPreview: PresentationPreview

  beforeEach(async () => {
    const faberMessages = new Subject<SubjectMessage>()
    const aliceMessages = new Subject<SubjectMessage>()

    const subjectMap = {
      'rxjs:faber': faberMessages,
      'rxjs:alice': aliceMessages,
    }
    faberAgent = new Agent(faberConfig.config, faberConfig.agentDependencies)
    faberAgent.setInboundTransporter(new SubjectInboundTransporter(faberMessages))
    faberAgent.setOutboundTransporter(new SubjectOutboundTransporter(aliceMessages, subjectMap))
    await faberAgent.initialize()

    aliceAgent = new Agent(aliceConfig.config, aliceConfig.agentDependencies)
    aliceAgent.setInboundTransporter(new SubjectInboundTransporter(aliceMessages))
    aliceAgent.setOutboundTransporter(new SubjectOutboundTransporter(faberMessages, subjectMap))
    await aliceAgent.initialize()

    const { definition } = await prepareForIssuance(faberAgent, ['name', 'age'])
    credDefId = definition.id

    faberReplay = new ReplaySubject<ProofStateChangedEvent>()
    aliceReplay = new ReplaySubject<ProofStateChangedEvent>()

    faberAgent.events.observable<ProofStateChangedEvent>(ProofEventTypes.ProofStateChanged).subscribe(faberReplay)
    aliceAgent.events.observable<ProofStateChangedEvent>(ProofEventTypes.ProofStateChanged).subscribe(aliceReplay)

    presentationPreview = new PresentationPreview({
      attributes: [
        new PresentationPreviewAttribute({
          name: 'name',
          credentialDefinitionId: credDefId,
          referent: '0',
          value: 'John',
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

    await issueConnectionLessCredential({
      issuerAgent: faberAgent,
      holderAgent: aliceAgent,
      credentialTemplate: {
        credentialDefinitionId: credDefId,
        comment: 'some comment about credential',
        preview: credentialPreview,
      },
    })
  })

  afterEach(async () => {
    await faberAgent.shutdown({ deleteWallet: true })
    await aliceAgent.shutdown({ deleteWallet: true })
  })

  test('Faber starts with connection-less proof requests to Alice', async () => {
    testLogger.test('Faber sends presentation request to Alice')

    const attributes = {
      name: new ProofAttributeInfo({
        name: 'name',
        restrictions: [
          new AttributeFilter({
            credentialDefinitionId: credDefId,
          }),
        ],
      }),
    }

    const predicates = {
      age: new ProofPredicateInfo({
        name: 'age',
        predicateType: PredicateType.GreaterThanOrEqualTo,
        predicateValue: 50,
        restrictions: [
          new AttributeFilter({
            credentialDefinitionId: credDefId,
          }),
        ],
      }),
    }

    // eslint-disable-next-line prefer-const
    let { proofRecord: faberProofRecord, requestMessage } = await faberAgent.proofs.createOutOfBandRequest({
      name: 'test-proof-request',
      requestedAttributes: attributes,
      requestedPredicates: predicates,
    })

    await aliceAgent.receiveMessage(requestMessage.toJSON())

    testLogger.test('Alice waits for presentation request from Faber')
    let aliceProofRecord = await waitForProofRecordSubject(aliceReplay, {
      threadId: faberProofRecord.threadId,
      state: ProofState.RequestReceived,
    })

    testLogger.test('Alice accepts presentation request from Faber')
    const indyProofRequest = aliceProofRecord.requestMessage?.indyProofRequest
    const retrievedCredentials = await aliceAgent.proofs.getRequestedCredentialsForProofRequest(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      indyProofRequest!,
      presentationPreview
    )
    const requestedCredentials = aliceAgent.proofs.autoSelectCredentialsForProofRequest(retrievedCredentials)
    await aliceAgent.proofs.acceptRequest(aliceProofRecord.id, requestedCredentials)

    testLogger.test('Faber waits for presentation from Alice')
    faberProofRecord = await waitForProofRecordSubject(faberReplay, {
      threadId: aliceProofRecord.threadId,
      state: ProofState.PresentationReceived,
    })

    // assert presentation is valid
    expect(faberProofRecord.isVerified).toBe(true)

    // Faber accepts presentation
    await faberAgent.proofs.acceptPresentation(faberProofRecord.id)

    // Alice waits till it receives presentation ack
    aliceProofRecord = await waitForProofRecordSubject(aliceReplay, {
      threadId: aliceProofRecord.threadId,
      state: ProofState.Done,
    })
  })
})
