import type { BaseMessageConstructor } from '../../agent/BaseMessage'
import type { ServiceDecoratorOptions } from './ServiceDecorator'

import { Expose, Type } from 'class-transformer'
import { IsOptional, ValidateNested } from 'class-validator'

import { ServiceDecorator } from './ServiceDecorator'

export function ServiceDecorated<T extends BaseMessageConstructor>(Base: T) {
  class ServiceDecoratorExtension extends Base {
    @Expose({ name: '~service' })
    @Type(() => ServiceDecorator)
    @IsOptional()
    @ValidateNested()
    public service?: ServiceDecorator

    public setService(serviceData: ServiceDecoratorOptions) {
      this.service = new ServiceDecorator(serviceData)
    }
  }

  return ServiceDecoratorExtension
}
