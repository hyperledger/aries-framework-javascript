import type { Agent } from '../agent/Agent'
import type { Logger } from '../logger'
import type { ConnectionRecord } from '../modules/connections'
import type { OutboundPackage } from '../types'
import type { OutboundTransporter } from './OutboundTransporter'
import type WebSocket from 'ws'

import { AgentConfig } from '../agent/AgentConfig'
import { AriesFrameworkError } from '../error/AriesFrameworkError'

export class WsOutboundTransporter implements OutboundTransporter {
  private transportTable: Map<string, WebSocket> = new Map<string, WebSocket>()
  private agent!: Agent
  private logger!: Logger
  private WebSocket!: typeof WebSocket

  public supportedSchemes = ['ws', 'wss']

  public async start(agent: Agent): Promise<void> {
    this.agent = agent

    const agentConfig = agent.injectionContainer.resolve(AgentConfig)

    this.logger = agentConfig.logger
    this.logger.debug('Starting WS outbound transport')
    this.WebSocket = agentConfig.agentDependencies.WebSocket
  }

  public async stop() {
    this.logger.debug('Stopping WS outbound transport')

    this.transportTable.forEach((socket) => {
      socket.removeEventListener('message', this.handleMessageEvent)
      socket.close()
    })
  }

  public async sendMessage(outboundPackage: OutboundPackage) {
    const { connection, payload, endpoint } = outboundPackage
    this.logger.debug(
      `Sending outbound message to connection ${connection.id}  (${connection.theirLabel}) over websocket transport.`,
      payload
    )
    const isNewSocket = this.hasOpenSocket(connection.id)
    const socket = await this.resolveSocket(connection, endpoint)
    socket.send(JSON.stringify(payload))

    // If the socket was created for this message and we don't have return routing enabled
    // We can close the socket as it shouldn't return messages anymore
    if (isNewSocket && !outboundPackage.responseRequested) {
      socket.close()
    }
  }

  private hasOpenSocket(socketId: string) {
    return this.transportTable.get(socketId) !== undefined
  }

  private async resolveSocket(connection: ConnectionRecord, endpoint?: string) {
    const socketId = connection.id

    // If we already have a socket connection use it
    let socket = this.transportTable.get(socketId)

    if (!socket) {
      if (!endpoint) {
        throw new AriesFrameworkError(`Missing endpoint. I don't know how and where to send the message.`)
      }
      socket = await this.createSocketConnection(endpoint, socketId)
      this.transportTable.set(socketId, socket)
      this.listenOnWebSocketMessages(socket)
    }

    if (socket.readyState !== this.WebSocket.OPEN) {
      throw new AriesFrameworkError('Socket is not open.')
    }

    return socket
  }

  // NOTE: Because this method is passed to the event handler this must be a lambda method
  // so 'this' is scoped to the 'WsOutboundTransporter' class instance
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private handleMessageEvent = (event: any) => {
    this.logger.debug('WebSocket message event received.', { url: event.target.url, data: event.data })
    this.agent.receiveMessage(JSON.parse(event.data))
  }

  private listenOnWebSocketMessages(socket: WebSocket) {
    socket.addEventListener('message', this.handleMessageEvent)
  }

  private createSocketConnection(endpoint: string, socketId: string): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      this.logger.debug(`Connecting to WebSocket ${endpoint}`)
      const socket = new this.WebSocket(endpoint)

      socket.onopen = () => {
        this.logger.debug(`Successfully connected to WebSocket ${endpoint}`)
        resolve(socket)
      }

      socket.onerror = (error) => {
        this.logger.debug(`Error while connecting to WebSocket ${endpoint}`, {
          error,
        })
        reject(error)
      }

      socket.onclose = () => {
        socket.removeEventListener('message', this.handleMessageEvent)
        this.transportTable.delete(socketId)
      }
    })
  }
}
