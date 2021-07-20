import type { SubjectMessage } from '../../../../../../tests/transport/SubjectInboundTransport'

import { Subject } from 'rxjs'

import { SubjectInboundTransporter } from '../../../../../../tests/transport/SubjectInboundTransport'
import { SubjectOutboundTransporter } from '../../../../../../tests/transport/SubjectOutboundTransport'
import { getBaseConfig, waitForBasicMessage } from '../../../../tests/helpers'
import { Agent } from '../../../agent/Agent'
import { ConnectionRecord } from '../../connections'
import { MediationState } from '../models/MediationState'

const recipientConfig = getBaseConfig('Mediation: Recipient')
const mediatorConfig = getBaseConfig('Mediation: Mediator', {
  autoAcceptMediationRequests: true,
  endpoint: 'rxjs:mediator',
})

const senderConfig = getBaseConfig('Mediation: Sender', {
  endpoint: 'rxjs:sender',
})

describe('mediator establishment', () => {
  let recipientAgent: Agent
  let mediatorAgent: Agent
  let senderAgent: Agent

  afterEach(async () => {
    await recipientAgent.shutdown({
      deleteWallet: true,
    })
    await mediatorAgent.shutdown({
      deleteWallet: true,
    })
    await senderAgent.shutdown({
      deleteWallet: true,
    })
  })

  test(`Mediation end-to-end flow
        1. Start mediator agent and create invitation
        2. Start recipient agent with mediatorConnectionsInvite from mediator
        3. Assert mediator and recipient are connected and mediation state is Granted
        4. Start sender agent and create connection with recipient
        5. Assert endpoint in recipient invitation for sender is mediator endpoint
        6. Send basic message from sender to recipient and assert it is received on the recipient side
`, async () => {
    const mediatorMessages = new Subject<SubjectMessage>()
    const recipientMessages = new Subject<SubjectMessage>()
    const senderMessages = new Subject<SubjectMessage>()

    const subjectMap = {
      'rxjs:mediator': mediatorMessages,
      'rxjs:sender': senderMessages,
    }

    // Initialize mediatorReceived message
    mediatorAgent = new Agent(mediatorConfig.config, recipientConfig.agentDependencies)
    mediatorAgent.setOutboundTransporter(new SubjectOutboundTransporter(mediatorMessages, subjectMap))
    mediatorAgent.setInboundTransporter(new SubjectInboundTransporter(mediatorMessages))
    await mediatorAgent.initialize()

    // Create connection to use for recipient
    const {
      invitation: mediatorInvitation,
      connectionRecord: { id: mediatorRecipientConnectionId },
    } = await mediatorAgent.connections.createConnection({
      autoAcceptConnection: true,
    })

    // Initialize recipient with mediation connections invitation
    recipientAgent = new Agent(
      { ...recipientConfig.config, mediatorConnectionsInvite: mediatorInvitation.toUrl() },
      recipientConfig.agentDependencies
    )
    recipientAgent.setOutboundTransporter(new SubjectOutboundTransporter(recipientMessages, subjectMap))
    recipientAgent.setInboundTransporter(new SubjectInboundTransporter(recipientMessages))
    await recipientAgent.initialize()

    const recipientMediator = await recipientAgent.mediationRecipient.findDefaultMediator()
    // eslint-disable-next-line @typescript-eslint/no-non-null-asserted-optional-chain, @typescript-eslint/no-non-null-assertion
    const recipientMediatorConnection = await recipientAgent.connections.getById(recipientMediator?.connectionId!)

    expect(recipientMediatorConnection).toBeInstanceOf(ConnectionRecord)
    expect(recipientMediatorConnection?.isReady).toBe(true)

    const mediatorRecipientConnection = await mediatorAgent.connections.getById(mediatorRecipientConnectionId)
    expect(mediatorRecipientConnection.isReady).toBe(true)

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(mediatorRecipientConnection).toBeConnectedWith(recipientMediatorConnection!)
    expect(recipientMediatorConnection).toBeConnectedWith(mediatorRecipientConnection)

    expect(recipientMediator?.state).toBe(MediationState.Granted)

    // Initialize sender agent
    senderAgent = new Agent(senderConfig.config, senderConfig.agentDependencies)
    senderAgent.setOutboundTransporter(new SubjectOutboundTransporter(senderMessages, subjectMap))
    senderAgent.setInboundTransporter(new SubjectInboundTransporter(senderMessages))
    await senderAgent.initialize()

    const {
      invitation: recipientInvitation,
      connectionRecord: { id: recipientSenderConnectionId },
    } = await recipientAgent.connections.createConnection({
      autoAcceptConnection: true,
    })

    expect(recipientInvitation.serviceEndpoint).toBe(mediatorConfig.config.endpoint)

    let senderRecipientConnection = await senderAgent.connections.receiveInvitationFromUrl(
      recipientInvitation.toUrl(),
      {
        autoAcceptConnection: true,
      }
    )

    const recipientSenderConnection = await recipientAgent.connections.returnWhenIsConnected(
      recipientSenderConnectionId
    )

    senderRecipientConnection = await senderAgent.connections.getById(senderRecipientConnection.id)

    expect(recipientSenderConnection).toBeConnectedWith(senderRecipientConnection)
    expect(senderRecipientConnection).toBeConnectedWith(recipientSenderConnection)

    expect(recipientSenderConnection.isReady).toBe(true)
    expect(senderRecipientConnection.isReady).toBe(true)

    const message = 'hello, world'
    await senderAgent.basicMessages.sendMessage(senderRecipientConnection, message)

    const basicMessage = await waitForBasicMessage(recipientAgent, {
      content: message,
    })

    expect(basicMessage.content).toBe(message)
  })
})
