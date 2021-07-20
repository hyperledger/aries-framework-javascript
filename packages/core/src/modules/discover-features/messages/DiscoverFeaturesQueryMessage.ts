import { Equals, IsOptional, IsString } from 'class-validator'

import { AgentMessage } from '../../../agent/AgentMessage'

export interface DiscoverFeaturesQueryMessageOptions {
  id?: string
  query: string
  comment?: string
}

export class DiscoverFeaturesQueryMessage extends AgentMessage {
  public constructor(options: DiscoverFeaturesQueryMessageOptions) {
    super()

    if (options) {
      this.id = options.id ?? this.generateId()
      this.query = options.query
      this.comment = options.comment
    }
  }

  @Equals(DiscoverFeaturesQueryMessage.type)
  public readonly type = DiscoverFeaturesQueryMessage.type
  public static readonly type = 'https://didcomm.org/discover-features/1.0/query'

  @IsString()
  public query!: string

  @IsString()
  @IsOptional()
  public comment?: string
}
