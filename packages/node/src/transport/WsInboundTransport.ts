import type { Agent, InboundTransporter, Logger, TransportSession, WireMessage } from '@aries-framework/core'

import { AriesFrameworkError, AgentConfig, TransportService, utils } from '@aries-framework/core'
import WebSocket, { Server } from 'ws'

export class WsInboundTransport implements InboundTransporter {
  private socketServer: Server
  private logger!: Logger

  // We're using a `socketId` just for the prevention of calling the connection handler twice.
  private socketIds: Record<string, unknown> = {}

  public constructor({ server, port }: { server: Server; port?: undefined } | { server?: undefined; port: number }) {
    this.socketServer = server ?? new Server({ port })
  }

  public async start(agent: Agent) {
    const transportService = agent.injectionContainer.resolve(TransportService)
    const config = agent.injectionContainer.resolve(AgentConfig)

    this.logger = config.logger

    this.logger.debug(`Starting HTTP inbound transporter`, {
      endpoint: config.getEndpoint(),
    })

    this.socketServer.on('connection', (socket: WebSocket) => {
      const socketId = utils.uuid()
      this.logger.debug('Socket connected.')

      if (!this.socketIds[socketId]) {
        this.logger.debug(`Saving new socket with id ${socketId}.`)
        this.socketIds[socketId] = socket
        const session = new WebSocketTransportSession(socketId, socket)
        this.listenOnWebSocketMessages(agent, socket, session)
        socket.on('close', () => {
          this.logger.debug('Socket closed.')
          transportService.removeSession(session)
        })
      } else {
        this.logger.debug(`Socket with id ${socketId} already exists.`)
      }
    })
  }

  public async stop() {
    this.logger.debug('Closing WebSocket Server')

    return new Promise<void>((resolve, reject) => {
      this.socketServer.close((error) => {
        if (error) {
          reject(error)
        }

        resolve()
      })
    })
  }

  private listenOnWebSocketMessages(agent: Agent, socket: WebSocket, session: TransportSession) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    socket.addEventListener('message', async (event: any) => {
      this.logger.debug('WebSocket message event received.', { url: event.target.url, data: event.data })
      try {
        await agent.receiveMessage(JSON.parse(event.data), session)
      } catch (error) {
        this.logger.error('Error processing message')
      }
    })
  }
}

export class WebSocketTransportSession implements TransportSession {
  public id: string
  public readonly type = 'WebSocket'
  public socket: WebSocket

  public constructor(id: string, socket: WebSocket) {
    this.id = id
    this.socket = socket
  }

  public async send(wireMessage: WireMessage): Promise<void> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new AriesFrameworkError(`${this.type} transport session has been closed.`)
    }

    this.socket.send(JSON.stringify(wireMessage))
  }
}
