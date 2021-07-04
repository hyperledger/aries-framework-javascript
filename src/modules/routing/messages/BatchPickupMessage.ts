import { Expose } from 'class-transformer'
import { Equals, IsInt, IsPositive } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'

import { RoutingMessageType as MessageType } from './RoutingMessageType'

export interface BatchPickupMessageOptions {
  id?: string
  batchSize: number
}

/**
 * A message to request to have multiple waiting messages sent inside a `batch` message.
 *
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0212-pickup/README.md#batch-pickup
 */
export class BatchPickupMessage extends AgentMessage {
  /**
   * Create new BatchPickupMessage instance.
   *
   * @param options
   */
  public constructor(options: BatchPickupMessageOptions) {
    super()

    if (options) {
      this.id = options.id || this.generateId()
      this.batchSize = options.batchSize
    }
  }

  @Equals(BatchPickupMessage.type)
  public readonly type = BatchPickupMessage.type
  public static readonly type = MessageType.BatchPickup

  @IsInt()
  @Expose({ name: 'batch_size' })
  @IsPositive()
  public batchSize!: number
}
