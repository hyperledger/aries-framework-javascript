/**
 * Copyright 2015 Blake Embrey
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 *
/

/**
 * Original code is from project <https://github.com/blakeembrey/make-error-cause>.
 *
 * Changes to the original code:
 * - Use inspect from `object-inspect` insted of Node.js `util` module.
 * - Change `inspect()` method signature
 */

import makeError from 'make-error'
import inspect from 'object-inspect'

/**
 * @internal
 */
export const SEPARATOR_TEXT = `\n\nThe following exception was the direct cause of the above exception:\n\n`

/**
 * Create a new error instance of `cause` property support.
 */
export class BaseError extends makeError.BaseError {
  protected constructor(message?: string, public cause?: Error) {
    super(message)

    Object.defineProperty(this, 'cause', {
      value: cause,
      writable: false,
      enumerable: false,
      configurable: false,
    })
  }

  public inspect() {
    return fullStack(this)
  }
}

/**
 * Capture the full stack trace of any error instance.
 */
export function fullStack(error: Error | BaseError) {
  const chain: Error[] = []
  let cause: Error | undefined = error

  while (cause) {
    chain.push(cause)
    cause = (cause as BaseError).cause
  }

  return chain.map((err) => inspect(err, { customInspect: false })).join(SEPARATOR_TEXT)
}
