import express, { Express } from 'express'
import { Agent,  assertConnection,  ConnectionRecord, ConnectionState, InboundTransporter, MediationState, WsOutboundTransporter } from '../../src'
import {HttpOutboundTransporter} from '../mediation-server'
import { get } from '../http'
import { getBaseConfig, sleep, waitForBasicMessage } from '../../src/__tests__/helpers'
import logger from '../../src/__tests__/logger'
import cors from 'cors'
import { InMemoryMessageRepository } from '../../src/storage/InMemoryMessageRepository'

const recipientConfig = getBaseConfig('E2E recipient', {
  host: 'http://localhost',
  port: 3001,
})

const mediatorConfig = getBaseConfig('E2E Bob', {
  host: 'http://localhost',
  port: 3002,
})

describe('with mediator', () => {
  let recipientAgent: Agent
  let mediatorAgent: Agent
  let recipientAgentConnection: ConnectionRecord

  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use(
    express.text({
      type: ['application/ssi-agent-wire', 'text/plain'],
    })
  )
  app.set('json spaces', 2)

  const messageRepository = new InMemoryMessageRepository()

  const messageReceiver = new HttpInboundTransporter(app)

  /*let recipientConfig: AgentConfig
  let recipientWallet: Wallet

  beforeAll(async () => {
    recipientConfig = new AgentConfig(recipientConfig)
    recipientWallet = new IndyWallet(recipientConfig)
    await recipientWallet.init()
  })
*/
  afterAll(async () => {
    ;(recipientAgent.inboundTransporter as PollingInboundTransporter).stop = true
    ;(mediatorAgent.inboundTransporter as PollingInboundTransporter).stop = true

    // Wait for messages to flush out
    await new Promise((r) => setTimeout(r, 1000))

    await recipientAgent.closeAndDeleteWallet()
    await mediatorAgent.closeAndDeleteWallet()
  })

  test('recipient and mediator establish a connection and request mediation', async () => {
    recipientAgent = new Agent(recipientConfig)
    recipientAgent.setInboundTransporter(new PollingInboundTransporter())
    recipientAgent.setOutboundTransporter(new HttpOutboundTransporter(recipientAgent))
    await recipientAgent.init()

    mediatorAgent = new Agent(mediatorConfig,messageRepository)
    mediatorAgent.setInboundTransporter(new HttpInboundTransporter(app))
    mediatorAgent.setOutboundTransporter(new HttpOutboundTransporter(mediatorAgent, messageRepository))
    await mediatorAgent.init()

    recipientAgent.inboundTransporter.init()

    const recipientInboundConnection = await recipientAgent.mediationRecipient.getDefaultMediatorConnection()
    const recipientKeyAtMediator = recipientInboundConnection?.verkey
    logger.test('recipientInboundConnection', recipientInboundConnection)

    const bobInbound = mediatorAgent.mediationRecipient.getInboundConnection()
    const bobInboundConnection = bobInbound?.connection
    const bobKeyAtBobMediator = bobInboundConnection?.verkey
    logger.test('bobInboundConnection', bobInboundConnection)
    const recipientMediatorConnection = await recipientAgent.mediationRecipient.getDefaultMediatorConnection()
    const bobMediatorConnection = await mediatorAgent.mediationRecipient.getDefaultMediatorConnection()

    // TODO This endpoint currently exists at mediator only for the testing purpose. It returns mediator's part of the pairwise connection.
    const mediatorConnectionAtMediator = JSON.parse(
      await get(`${recipientAgent.getMediatorUrl()}/api/connections/${bobMediatorConnection?.verkey}`)
    )
    const mediatorConnectionAtBobMediator = JSON.parse(
      await get(`${mediatorAgent.getMediatorUrl()}/api/connections/${bobMediatorConnection?.verkey}`)
    )

    logger.test('mediatorConnectionAtMediator', mediatorConnectionAtMediator)
    logger.test('mediatorConnectionAtBobMediator', mediatorConnectionAtBobMediator)

    expect(recipientMediatorConnection).toBeConnectedWith(mediatorConnectionAtMediator)
    expect(bobMediatorConnection).toBeConnectedWith(mediatorConnectionAtBobMediator)
  })

  test('recipient and Bob make a connection via mediator', async () => {
    // eslint-disable-next-line prefer-const
    let { invitation, connectionRecord} = await recipientAgent.connections.createConnection()

    let mediatorAgentConnection = await mediatorAgent.connections.receiveInvitation(invitation)

    recipientAgentConnection = await recipientAgent.connections.returnWhenIsConnected(connectionRecord.id)

    mediatorAgentConnection = await mediatorAgent.connections.returnWhenIsConnected(mediatorAgentConnection.id)

    expect(recipientAgentConnection).toBeConnectedWith(mediatorAgentConnection)
    expect(mediatorAgentConnection).toBeConnectedWith(recipientAgentConnection)

  })

  test('Send a message from recipient to Bob via mediator', async () => {
    // send message from recipient to Bob
    const recipientConnectionAtBob = await recipientAgent.connections.getById(recipientAgentConnection.id)

    logger.test('recipientConnectionAtBob\n', recipientConnectionAtBob)

    const message = 'hello, world'
    await recipientAgent.basicMessages.sendMessage(recipientConnectionAtBob, message)

    const basicMessage = await waitForBasicMessage(mediatorAgent, {
      content: message,
    })

    expect(basicMessage.content).toBe(message)
  })
})

describe('websockets with mediator', () => {
  let recipientAgent: Agent
  let mediatorAgent: Agent

  afterAll(async () => {
    await recipientAgent.outboundTransporter?.stop()
    await mediatorAgent.outboundTransporter?.stop()

    // Wait for messages to flush out
    await new Promise((r) => setTimeout(r, 1000))

    await recipientAgent.closeAndDeleteWallet()
    await mediatorAgent.closeAndDeleteWallet()
  })

  test('recipient and Bob make a connection with mediator from config', async () => {
    recipientAgent = new Agent(recipientConfig)
    recipientAgent.setInboundTransporter(new WsInboundTransporter())
    recipientAgent.setOutboundTransporter(new WsOutboundTransporter(recipientAgent))
    await recipientAgent.init()

    mediatorAgent = new Agent(bobConfig)
    mediatorAgent.setInboundTransporter(new WsInboundTransporter())
    mediatorAgent.setOutboundTransporter(new WsOutboundTransporter(mediatorAgent))
    await mediatorAgent.init()
  })
})

// coppied from mediation-server.ts
class HttpInboundTransporter implements InboundTransporter {
  private app: Express

  public constructor(app: Express) {
    this.app = app
  }

  public async start(agent: Agent) {
    this.app.post('/msg', async (req, res) => {
      const message = req.body
      const packedMessage = JSON.parse(message)

      try {
        const outboundMessage = await agent.receiveMessage(packedMessage)
        if (outboundMessage) {
          res.status(200).json(outboundMessage.payload).end()
        } else {
          res.status(200).end()
        }
      } catch (e) {
        res.status(200).end()
      }
    })
  }
}

class PollingInboundTransporter implements InboundTransporter {
  public stop: boolean
  public connection?: ConnectionRecord

  public constructor() {
    this.stop = true
  }

  public async init(recipient:Agent, mediator:Agent){
    await this.registerMediator(recipient, mediator)
  }

  public async start(agent: Agent) {
    if (this.connection) {
      this.stop = false
      this.pollDownloadMessages(agent, this.connection)
    }
  }

  public async registerMediator(recipient: Agent, mediator:Agent) {
    const mediatorUrl = mediator.getMediatorUrl() || ''
    const { invitation, connectionRecord } = await mediator.connections.createConnection()
    let recipientConnection = await recipient.connections.receiveInvitation(invitation)
    const mediatorAgentConnection = await mediator.connections.returnWhenIsConnected(connectionRecord.id)
    const recipientAgentConnection = await recipient.connections.returnWhenIsConnected(recipientConnection.id)
    const mediationRecord = await recipient.mediationRecipient.requestAndWaitForAcception(connectionRecord, undefined, 2000)
    // expects should be a independent test, but this will do for now...
    expect(mediationRecord.state).toBe(MediationState.Granted)
    expect(recipientAgentConnection).toBeConnectedWith(mediatorAgentConnection)
    expect(mediatorAgentConnection).toBeConnectedWith(recipientAgentConnection)
    // this.pollDownloadMessages(recipient, recipientConnection)
  }

  private pollDownloadMessages(recipient: Agent, Connection: ConnectionRecord) {
    const loop = async () => {
      while (!this.stop) {
        await recipient.mediationRecipient.downloadMessages(Connection)
        await sleep(1000)
      }
    }
    new Promise(() => {
      loop()
    })
  }
}

class WsInboundTransporter implements InboundTransporter {
  public async start(agent: Agent) {
    await this.registerMediator(agent)
  }

  private async registerMediator(agent: Agent) {


  }
}
