import type { DidDoc } from '../modules/connections/models'
import type { ConnectionRecord } from '../modules/connections/repository'
import type { WireMessage } from '../types'
import type { AgentMessage } from './AgentMessage'
import type { EnvelopeKeys } from './EnvelopeService'

import { Lifecycle, scoped } from 'tsyringe'

import { DID_COMM_TRANSPORT_QUEUE } from '../constants'
import { ConnectionRole, DidCommService } from '../modules/connections/models'

@scoped(Lifecycle.ContainerScoped)
export class TransportService {
  private transportSessionTable: TransportSessionTable = {}

  public saveSession(session: TransportSession) {
    this.transportSessionTable[session.id] = session
  }

  public findSessionByConnectionId(connectionId: string) {
    return Object.values(this.transportSessionTable).find((session) => session.connection?.id === connectionId)
  }

  public hasInboundEndpoint(didDoc: DidDoc): boolean {
    return Boolean(didDoc.didCommServices.find((s) => s.serviceEndpoint !== DID_COMM_TRANSPORT_QUEUE))
  }

  public findSessionById(sessionId: string) {
    return this.transportSessionTable[sessionId]
  }

  public removeSession(session: TransportSession) {
    delete this.transportSessionTable[session.id]
  }

  public findDidCommServices(connection: ConnectionRecord): DidCommService[] {
    if (connection.theirDidDoc) {
      return connection.theirDidDoc.didCommServices
    }

    if (connection.role === ConnectionRole.Invitee && connection.invitation) {
      const { invitation } = connection
      if (invitation.serviceEndpoint) {
        const service = new DidCommService({
          id: `${connection.id}-invitation`,
          serviceEndpoint: invitation.serviceEndpoint,
          recipientKeys: invitation.recipientKeys || [],
          routingKeys: invitation.routingKeys || [],
        })
        return [service]
      }
    }
    return []
  }
}

interface TransportSessionTable {
  [sessionId: string]: TransportSession
}

export interface TransportSession {
  id: string
  type: string
  keys?: EnvelopeKeys
  inboundMessage?: AgentMessage
  connection?: ConnectionRecord
  send(wireMessage: WireMessage): Promise<void>
}
