import { TestLogger } from '../packages/core/tests/logger'

import {
  HttpOutboundTransporter,
  Agent,
  ConnectionInvitationMessage,
  LogLevel,
  AgentConfig,
} from '@aries-framework/core'
import { HttpInboundTransport, agentDependencies } from '@aries-framework/node'

const port = process.env.AGENT_PORT ? Number(process.env.AGENT_PORT) : 3001

const agentConfig = {
  endpoint: process.env.AGENT_ENDPOINT || `http://localhost:${port}`,
  label: process.env.AGENT_LABEL || 'Aries Framework JavaScript Mediator',
  walletConfig: {
    walletId: process.env.WALLET_NAME || 'AriesFrameworkJavaScript',
    walletKey: process.env.WALLET_KEY || 'AriesFrameworkJavaScript',
  },
  publicDidSeed: process.env.PUBLIC_DID_SEED || '000000000000000000HTTPMediator02',
  autoAcceptConnections: true,
  autoAcceptMediationRequests: true,
  logger: new TestLogger(LogLevel.debug),
}

// Set up agent
const agent = new Agent(agentConfig, agentDependencies)
const config = agent.injectionContainer.resolve(AgentConfig)
const inboundTransporter = new HttpInboundTransport({ port })
const outboundTransporter = new HttpOutboundTransporter()

agent.setInboundTransporter(inboundTransporter)
agent.setOutboundTransporter(outboundTransporter)

// Allow to create invitation, no other way to ask for invitation yet
inboundTransporter.app.get('/invitation', async (req, res) => {
  if (typeof req.query.c_i === 'string') {
    const invitation = await ConnectionInvitationMessage.fromUrl(req.url)
    res.send(invitation.toJSON())
  } else {
    const { invitation } = await agent.connections.createConnection()

    res.send(invitation.toUrl(config.getEndpoint() + '/invitation'))
  }
})

const run = async () => {
  await agent.initialize()
}

run()
