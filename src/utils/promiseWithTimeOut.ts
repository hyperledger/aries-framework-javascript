import { EventEmitter } from 'events'
import { ConnectionInvitationMessage, ConnectionState } from '..'
import { KeylistState, KeylistUpdateMessage, MediationState, MediationRequestMessage } from '../modules/routing'

// based on gist from simongregory at https://gist.github.com/simongregory/2c60d270006d4bf727babca53dca1f87
export async function waitForEventWithTimeout(
  emitter: EventEmitter,
  eventListener: EventEmitter,
  eventTopic: string,
  event: any,
  eventType: ConnectionState | MediationState | KeylistState,
  message: ConnectionInvitationMessage | MediationRequestMessage | KeylistUpdateMessage,
  timeout: number
) {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    let timer: NodeJS.Timeout = setTimeout(() => {})

    function listener(data: any) {
      //TODO: test if thread Id matches the one in the message
      if (data.threadId === message.threadId) {
        clearTimeout(timer)
        eventListener.removeListener(eventType, listener)
        resolve(data)
      }
    }

    eventListener.on(eventType, listener)
    timer = setTimeout(() => {
      eventListener.removeListener(eventType, listener)
      reject(new Error('timeout waiting for ' + eventType + 'from initialized from message' + message))
    }, timeout)
    // emit after listener is listening to prevent any race condition
    emitter.emit(eventTopic, event)
  })
}

// Example usage
//const promise = waitForEventWithTimeout(session, 'message', 2000);