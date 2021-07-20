import type { Logger } from '../logger'
import type { PackedMessage, UnpackedMessageContext } from '../types'
import type { AgentMessage } from './AgentMessage'

import { inject, scoped, Lifecycle } from 'tsyringe'

import { InjectionSymbols } from '../constants'
import { ForwardMessage } from '../modules/routing/messages'
import { Wallet } from '../wallet/Wallet'

import { AgentConfig } from './AgentConfig'

export interface EnvelopeKeys {
  recipientKeys: string[]
  routingKeys: string[]
  senderKey: string | null
}

@scoped(Lifecycle.ContainerScoped)
class EnvelopeService {
  private wallet: Wallet
  private logger: Logger

  public constructor(@inject(InjectionSymbols.Wallet) wallet: Wallet, agentConfig: AgentConfig) {
    this.wallet = wallet
    this.logger = agentConfig.logger
  }

  public async packMessage(payload: AgentMessage, keys: EnvelopeKeys): Promise<PackedMessage> {
    const { routingKeys, recipientKeys, senderKey: senderVerkey } = keys
    const message = payload.toJSON()

    this.logger.debug(`Pack outbound message ${payload.type}`)

    let wireMessage = await this.wallet.pack(message, recipientKeys, senderVerkey)

    if (routingKeys && routingKeys.length > 0) {
      for (const routingKey of routingKeys) {
        const [recipientKey] = recipientKeys

        const forwardMessage = new ForwardMessage({
          to: recipientKey,
          message: wireMessage,
        })
        this.logger.debug('Forward message created', forwardMessage)
        wireMessage = await this.wallet.pack(forwardMessage.toJSON(), [routingKey], senderVerkey)
      }
    }
    return wireMessage
  }

  public async unpackMessage(packedMessage: PackedMessage): Promise<UnpackedMessageContext> {
    return this.wallet.unpack(packedMessage)
  }
}

export { EnvelopeService }
