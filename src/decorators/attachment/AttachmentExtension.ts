import type { BaseMessageConstructor } from '../../agent/BaseMessage'

import { Expose, Type } from 'class-transformer'
import { IsInstance, IsOptional, ValidateNested } from 'class-validator'

import { Attachment } from './Attachment'

export function AttachmentDecorated<T extends BaseMessageConstructor>(Base: T) {
  class AttachmentDecoratorExtension extends Base {
    /**
     * The ~attach decorator is required for appending attachments to a credential
     */
    @Expose({ name: '~attach' })
    @Type(() => Attachment)
    @ValidateNested()
    @IsInstance(Attachment, { each: true })
    @IsOptional()
    public attachments?: Attachment[]

    public getAttachmentById(id: string): Attachment | undefined {
      return this.attachments?.find((attachment) => attachment.id === id)
    }

    public addAttachment(attachment: Attachment): void {
      if (this.attachments) {
        this.attachments?.push(attachment)
      } else {
        this.attachments = [attachment]
      }
    }
  }

  return AttachmentDecoratorExtension
}
