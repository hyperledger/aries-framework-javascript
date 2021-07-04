import { Expose, Type } from 'class-transformer'
import { IsDate, IsNumber, IsOptional } from 'class-validator'

/**
 * Represents `~timing` decorator
 * @see https://github.com/hyperledger/aries-rfcs/blob/master/features/0032-message-timing/README.md
 */
export class TimingDecorator {
  public constructor(partial?: Partial<TimingDecorator>) {
    this.inTime = partial?.inTime
    this.outTime = partial?.outTime
    this.staleTime = partial?.staleTime
    this.expiresTime = partial?.expiresTime
    this.delayMilli = partial?.delayMilli
    this.waitUntilTime = partial?.waitUntilTime
  }

  /**
   * The timestamp when the preceding message in this thread (the one that elicited this message as a response) was received.
   * Or, on a dynamically composed forward message, the timestamp when an upstream relay first received the message it's now asking to be forwarded.
   */
  @Expose({ name: 'in_time' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  public inTime?: Date

  /**
   * The timestamp when the message was emitted. At least millisecond precision is preferred, though second precision is acceptable.
   */
  @Expose({ name: 'out_time' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  public outTime?: Date

  /**
   * Ideally, the decorated message should be processed by the the specified timestamp. After that, the message may become irrelevant or less meaningful than intended.
   * This is a hint only.
   */
  @Expose({ name: 'stale_time' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  public staleTime?: Date

  /**
   * The decorated message should be considered invalid or expired if encountered after the specified timestamp.
   * This is a much stronger claim than the one for `stale_time`; it says that the receiver should cancel attempts to process it once the deadline is past,
   * because the sender won't stand behind it any longer. While processing of the received message should stop,
   * the thread of the message should be retained as the sender may send an updated/replacement message.
   * In the case that the sender does not follow up, the policy of the receiver agent related to abandoned threads would presumably be used to eventually delete the thread.
   */
  @Expose({ name: 'expires_time' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  public expiresTime?: Date

  /**
   * Wait at least this many milliseconds before processing the message. This may be useful to defeat temporal correlation.
   * It is recommended that agents supporting this field should not honor requests for delays longer than 10 minutes (600,000 milliseconds).
   */
  @Expose({ name: 'delay_milli' })
  @IsNumber()
  @IsOptional()
  public delayMilli?: number

  /**
   * Wait until this time before processing the message.
   */
  @Expose({ name: 'wait_until_time' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  public waitUntilTime?: Date
}
