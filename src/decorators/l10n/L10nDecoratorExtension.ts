import type { BaseMessageConstructor } from '../../agent/BaseMessage'

import { Expose, Type } from 'class-transformer'
import { IsInstance, IsOptional, ValidateNested } from 'class-validator'

import { L10nDecorator } from './L10nDecorator'

export function L10nDecorated<T extends BaseMessageConstructor>(Base: T) {
  class L10nDecoratorExtension extends Base {
    @Expose({ name: '~l10n' })
    @Type(() => L10nDecorator)
    @ValidateNested()
    @IsOptional()
    @IsInstance(L10nDecorator)
    public l10n?: L10nDecorator

    public addLocale(locale: string) {
      this.l10n = new L10nDecorator({
        locale,
      })
    }

    public getLocale(): string | undefined {
      if (this.l10n?.locale) return this.l10n.locale

      return undefined
    }
  }

  return L10nDecoratorExtension
}
