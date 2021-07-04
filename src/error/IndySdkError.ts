import type { IndyError } from '../utils/indyError'

import { AriesFrameworkError } from './AriesFrameworkError'

export class IndySdkError extends AriesFrameworkError {
  public constructor(indyError: IndyError, message?: string) {
    const base = `${indyError.name}(${indyError.indyName}): ${indyError.message}`

    super(message ? `${message}: ${base}` : base, { cause: indyError })
  }
}
