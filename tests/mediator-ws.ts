import type { InboundTransporter, Logger } from '../src'

import cors from 'cors'
import express from 'express'
import { v4 as uuid } from 'uuid'
import WebSocket from 'ws'

import { InjectionSymbols, Agent, WebSocketTransportSession, WsOutboundTransporter } from '../src'
import testLogger from '../src/__tests__/logger'
import { InMemoryMessageRepository } from '../src/storage/InMemoryMessageRepository'
import { DidCommMimeType } from '../src/types'

import config from './config'

const logger = testLogger

class WsInboundTransporter implements InboundTransporter {
  private socketServer: WebSocket.Server

  // We're using a `socketId` just for the prevention of calling the connection handler twice.
  private socketIds: Record<string, unknown> = {}

  public constructor(socketServer: WebSocket.Server) {
    this.socketServer = socketServer
  }

  public async start(agent: Agent) {
    this.socketServer.on('connection', (socket: WebSocket, _: Express.Request, socketId: string) => {
      logger.debug('Socket connected.')

      if (!this.socketIds[socketId]) {
        logger.debug(`Saving new socket with id ${socketId}.`)
        this.socketIds[socketId] = socket
        this.listenOnWebSocketMessages(agent, socket)
        socket.on('close', () => logger.debug('Socket closed.'))
      } else {
        logger.debug(`Socket with id ${socketId} already exists.`)
      }
    })
  }

  private listenOnWebSocketMessages(agent: Agent, socket: WebSocket) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.addEventListener('message', async (event: any) => {
      try {
        logger.debug('WebSocket message event received.', { url: event.target.url, data: event.data })
        // @ts-expect-error Property 'dispatchEvent' is missing in type WebSocket imported from 'ws' module but required in type 'WebSocket'.
        const session = new WebSocketTransportSession(socket)
        const outboundMessage = await agent.receiveMessage(JSON.parse(event.data), session)

        if (outboundMessage) {
          socket.send(JSON.stringify(outboundMessage.payload))
        }
      } catch (error) {
        const logger = agent.injectionContainer.resolve<Logger>(InjectionSymbols.Logger)
        logger.error('Error processing incoming message over WebSocket', {
          cause: error.message,
          message: event.data,
        })
      }
    })
  }
}

const PORT = config.port
const app = express()

app.use(cors())
app.use(
  express.text({
    type: [DidCommMimeType.V0, DidCommMimeType.V1],
  })
)
app.set('json spaces', 2)

const socketServer = new WebSocket.Server({ noServer: true })
// TODO Remove when mediation protocol is implemented
// This endpoint is used in all invitations created by this mediator agent.
config.endpoint = `ws://localhost:${PORT}`

const messageRepository = new InMemoryMessageRepository()
const agent = new Agent(config, messageRepository)
const messageSender = new WsOutboundTransporter(agent)
const messageReceiver = new WsInboundTransporter(socketServer)
agent.setInboundTransporter(messageReceiver)
agent.setOutboundTransporter(messageSender)

app.get('/', async (_, res) => {
  const agentDid = agent.publicDid
  res.send(agentDid)
})

// Create new invitation as inviter to invitee
app.get('/invitation', async (_, res) => {
  const { invitation } = await agent.connections.createConnection()

  res.send(invitation.toUrl())
})

app.get('/api/connections/:verkey', async (req, res) => {
  // TODO This endpoint is for testing purpose only. Return mediator connection by their verkey.
  const verkey = req.params.verkey
  const connection = await agent.connections.findByTheirKey(verkey)
  res.send(connection)
})

app.get('/api/connections', async (req, res) => {
  // TODO This endpoint is for testing purpose only. Return mediator connection by their verkey.
  const connections = await agent.connections.getAll()
  res.json(connections)
})

app.get('/api/routes', async (req, res) => {
  // TODO This endpoint is for testing purpose only. Return mediator connection by their verkey.
  const routes = agent.routing.getRoutingTable()
  res.send(routes)
})

const server = app.listen(PORT, async () => {
  await agent.init()
  messageReceiver.start(agent)
  logger.info(`WebSockets application started on port ${PORT}`)
})

server.on('upgrade', (request, socket, head) => {
  socketServer.handleUpgrade(request, socket, head, (socketParam) => {
    const socketId = uuid()
    socketServer.emit('connection', socketParam, request, socketId)
  })
})
