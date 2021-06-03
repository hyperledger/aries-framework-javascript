import express, { Express } from 'express'
import fetch from 'node-fetch'
import cors from 'cors'
import {
  Agent,
  InboundTransporter,
  OutboundTransporter,
  OutboundPackage,
  InitConfig,
  ConnectionStateChangedEvent,
  LogLevel,
  ConnectionEventTypes,
  RoutingEventTypes,
  MediationStateChangedEvent,
} from '../src'
import testLogger, { TestLogger } from '../src/__tests__/logger'
import indy from 'indy-sdk'
import { resolve } from 'path'
import { MediationState } from '../src/modules/routing'
import { InMemoryMessageRepository } from '../src/storage/InMemoryMessageRepository'
import { MessageRepository } from '../src/storage/MessageRepository'
import { NodeFileSystem } from '../src/storage/fs/NodeFileSystem'

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
        testLogger.debug('Error: ' + e)
        res.status(200).end()
      }
    })
  }
}

export class HttpOutboundTransporter implements OutboundTransporter {
  private agent: Agent
  private messageRepository?: MessageRepository

  public constructor(agent: Agent, messageRepository?: MessageRepository) {
    this.agent = agent
    this.messageRepository = messageRepository
  }
  public async start(): Promise<void> {
    // No custom start logic required
  }

  public async stop(): Promise<void> {
    // No custom stop logic required
  }

  public supportedSchemes = ['http', 'dicomm', 'https', 'ws', 'wss']

  public async sendMessage(outboundPackage: OutboundPackage) {
    const { connection, payload, endpoint, responseRequested } = outboundPackage

    if (!endpoint) {
      throw new Error(`Missing endpoint. I don't know how and where to send the message.`)
    }

    try {
      if (endpoint == 'didcomm:transport/queue' && this.messageRepository) {
        testLogger.debug('Storing message for queue: ', { connection, payload })
        this.messageRepository.save(connection.theirKey!, payload)
        return
      }

      if (responseRequested) {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ssi-agent-wire',
          },
          body: JSON.stringify(payload),
        })

        const data = await response.text()
        if (data) {
          testLogger.debug(`Response received:\n ${response}`)
          const wireMessage = JSON.parse(data)
          this.agent.receiveMessage(wireMessage)
        } else {
          testLogger.debug(`No response received.`)
        }
      } else {
        const rsp = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/ssi-agent-wire',
          },
          body: JSON.stringify(payload),
        })
        testLogger.debug('rsp status: ' + rsp.status)
      }
    } catch (e) {
      testLogger.debug('error sending message', e)
      throw e
    }
  }
}

const agentConfig: InitConfig = {
  host: process.env.AGENT_HOST,
  port: process.env.AGENT_PORT || 3001,
  poolName: 'local-js',
  genesisPath: resolve(process.env.GENESIS_TXN_PATH || ''),
  endpoint: process.env.AGENT_ENDPOINT,
  label: process.env.AGENT_LABEL || '',
  walletConfig: { id: process.env.WALLET_NAME || '' },
  walletCredentials: { key: process.env.WALLET_KEY || '' },
  publicDid: process.env.PUBLIC_DID || '',
  publicDidSeed: process.env.PUBLIC_DID_SEED || '',
  autoAcceptConnections: true,
  //autoAcceptMediationRequests: process.env.AUTO_ACCEPT_MEDIATION === '1',
  logger: new TestLogger(LogLevel.debug),
  indy: indy,
  fileSystem: new NodeFileSystem(),
}

const PORT = Number(agentConfig.port)
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

const agent = new Agent(agentConfig, messageRepository)

const messageSender = new HttpOutboundTransporter(agent, messageRepository)
const messageReceiver = new HttpInboundTransporter(app)

agent.setInboundTransporter(messageReceiver)
agent.setOutboundTransporter(messageSender)

agent.events.on<ConnectionStateChangedEvent>(
  ConnectionEventTypes.ConnectionStateChanged,
  async (event: ConnectionStateChangedEvent) => {
    testLogger.info('Connection state changed for ' + event.payload.connectionRecord.id)
    testLogger.debug(
      'Previous state: ' + event.payload.previousState + ' New state: ' + event.payload.connectionRecord.state
    )
  }
)

agent.events.on<MediationStateChangedEvent>(
  RoutingEventTypes.MediationStateChanged,
  async (event: MediationStateChangedEvent) => {
    testLogger.info('Mediation state changed for ' + event.payload.mediationRecord.id)
    testLogger.debug(
      'Previous state: ' + event.payload.previousState + ' New state: ' + event.payload.mediationRecord.state
    )

    if (event.payload.mediationRecord.state == MediationState.Requested) {
      const connectionRecord = await agent.connections.getById(event.payload.mediationRecord.connectionId)
      if (connectionRecord) {
        await agent.mediator.grantRequestedMediation(connectionRecord, event.payload.mediationRecord)
        testLogger.info('Mediation granted')
      }
    }
  }
)

// Create new invitation as inviter to invitee
app.get('/invitation', async (req, res) => {
  const { invitation } = await agent.connections.createConnection()
  res.send(invitation.toJSON())
})

// Receive invitation and assign an alias
app.post('/receive-invitation', async (req, res) => {
  try {
    const invitation = req.body.invitation
    const alias = req.body.alias

    if (!alias || !invitation) {
      throw new Error('Missing parameter in body. Format: {"alias": ..., "invitation": ... }')
    }

    const result = await agent.connections.receiveInvitation(invitation, { autoAcceptConnection: true, alias: alias })

    res.send(result)
  } catch (e) {
    res.status(500)
    testLogger.debug('Error: ' + e)
    res.send('Error: ' + e)
  }
})

app.get('/api/connections/:verkey', async (req, res) => {
  // TODO This endpoint is for testing purpose only. Return mediator connection by their verkey.
  const verkey = req.params.verkey
  const connection = await agent.connections.findByTheirKey(verkey)
  res.send(connection)
})

app.get('/api/connections', async (req, res) => {
  const connections = await agent.connections.getAll()
  res.json(connections)
})

app.get('/api/credentials', async (req, res) => {
  const credentials = await agent.credentials.getAll()
  res.json(credentials)
})

app.listen(PORT, '0.0.0.0', 0, async () => {
  await agent.init()
  messageReceiver.start(agent)
  testLogger.debug(`JavaScript Mediator Agent started on port ${PORT}`)
})
