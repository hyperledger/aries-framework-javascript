import { Expose, Type } from 'class-transformer'
import { IsInstance, IsOptional, IsString, ValidateNested } from 'class-validator'

import { DidDoc } from './did/DidDoc'

export interface ConnectionOptions {
  did: string
  didDoc?: DidDoc
}

export class Connection {
  public constructor(options: ConnectionOptions) {
    if (options) {
      this.did = options.did
      this.didDoc = options.didDoc
    }
  }

  @IsString()
  @Expose({ name: 'DID' })
  public did!: string

  @Expose({ name: 'DIDDoc' })
  @Type(() => DidDoc)
  @ValidateNested()
  @IsInstance(DidDoc)
  @IsOptional()
  public didDoc?: DidDoc
}
