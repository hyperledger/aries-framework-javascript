import type { InboundMessageContext } from '../../../agent/models/InboundMessageContext'
import type { OutboundMessage } from '../../../types'
import type { ConnectionRecord } from '../../connections'
import type { KeylistUpdateMessage, ForwardMessage } from '../messages'
import type { Verkey } from 'indy-sdk'

import { Lifecycle, scoped } from 'tsyringe'

import { createOutboundMessage } from '../../../agent/helpers'
import { AriesFrameworkError } from '../../../error'
import { KeylistUpdateAction, KeylistUpdated, KeylistUpdateResponseMessage, KeylistUpdateResult } from '../messages'

export interface RoutingTable {
  [recipientKey: string]: ConnectionRecord | undefined
}

@scoped(Lifecycle.ContainerScoped)
class ProviderRoutingService {
  private routingTable: RoutingTable = {}

  public updateRoutes(messageContext: InboundMessageContext<KeylistUpdateMessage>): KeylistUpdateResponseMessage {
    const { connection, message } = messageContext

    if (!connection) {
      // TODO We could eventually remove this check if we do it at some higher level where we create messageContext that must have a connection.
      throw new AriesFrameworkError(`Connection for verkey ${messageContext.recipientVerkey} not found!`)
    }

    const updated = []

    for (const update of message.updates) {
      switch (update.action) {
        case KeylistUpdateAction.add:
          this.saveRoute(update.recipientKey, connection)
          break
        case KeylistUpdateAction.remove:
          this.removeRoute(update.recipientKey, connection)
          break
      }

      updated.push(
        new KeylistUpdated({
          action: update.action,
          recipientKey: update.recipientKey,
          result: KeylistUpdateResult.Success,
        })
      )
    }

    return new KeylistUpdateResponseMessage({ updated })
  }

  public forward(messageContext: InboundMessageContext<ForwardMessage>): OutboundMessage<ForwardMessage> {
    const { message, recipientVerkey } = messageContext

    const connection = this.findRecipient(message.to)

    if (!connection) {
      throw new AriesFrameworkError(`Connection for verkey ${recipientVerkey} not found!`)
    }

    if (!connection.theirKey) {
      throw new AriesFrameworkError(`Connection with verkey ${connection.verkey} has no recipient keys.`)
    }

    return createOutboundMessage(connection, message)
  }

  public getRoutes() {
    return this.routingTable
  }

  public findRecipient(recipientKey: Verkey) {
    const connection = this.routingTable[recipientKey]

    // TODO: function with find in name should now throw error when not found.
    // It should either be called getRecipient and throw error
    // or findRecipient and return null
    if (!connection) {
      throw new AriesFrameworkError(`Routing entry for recipientKey ${recipientKey} does not exists.`)
    }

    return connection
  }

  public saveRoute(recipientKey: Verkey, connection: ConnectionRecord) {
    if (this.routingTable[recipientKey]) {
      throw new AriesFrameworkError(`Routing entry for recipientKey ${recipientKey} already exists.`)
    }

    this.routingTable[recipientKey] = connection
  }

  public removeRoute(recipientKey: Verkey, connection: ConnectionRecord) {
    const storedConnection = this.routingTable[recipientKey]

    if (!storedConnection) {
      throw new AriesFrameworkError('Cannot remove non-existing routing entry')
    }

    if (storedConnection.id !== connection.id) {
      throw new AriesFrameworkError('Cannot remove routing entry for another connection')
    }

    delete this.routingTable[recipientKey]
  }
}

export { ProviderRoutingService }
