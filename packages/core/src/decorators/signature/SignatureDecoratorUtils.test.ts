import { getAgentConfig } from '../../../tests/helpers'
import { IndyWallet } from '../../wallet/IndyWallet'

import { SignatureDecorator } from './SignatureDecorator'
import { signData, unpackAndVerifySignatureDecorator } from './SignatureDecoratorUtils'

jest.mock('../../utils/timestamp', () => {
  return {
    __esModule: true,
    default: jest.fn(() => Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0)),
  }
})

describe('Decorators | Signature | SignatureDecoratorUtils', () => {
  const data = {
    did: 'did',
    did_doc: {
      '@context': 'https://w3id.org/did/v1',
      service: [
        {
          id: 'did:example:123456789abcdefghi#did-communication',
          type: 'did-communication',
          priority: 0,
          recipientKeys: ['someVerkey'],
          routingKeys: [],
          serviceEndpoint: 'https://agent.example.com/',
        },
      ],
    },
  }

  const signedData = new SignatureDecorator({
    signatureType: 'https://didcomm.org/signature/1.0/ed25519Sha512_single',
    signature: 'zOSmKNCHKqOJGDJ6OlfUXTPJiirEAXrFn1kPiFDZfvG5hNTBKhsSzqAvlg44apgWBu7O57vGWZsXBF2BWZ5JAw',
    signatureData:
      'AAAAAAAAAAB7ImRpZCI6ImRpZCIsImRpZF9kb2MiOnsiQGNvbnRleHQiOiJodHRwczovL3czaWQub3JnL2RpZC92MSIsInNlcnZpY2UiOlt7ImlkIjoiZGlkOmV4YW1wbGU6MTIzNDU2Nzg5YWJjZGVmZ2hpI2RpZC1jb21tdW5pY2F0aW9uIiwidHlwZSI6ImRpZC1jb21tdW5pY2F0aW9uIiwicHJpb3JpdHkiOjAsInJlY2lwaWVudEtleXMiOlsic29tZVZlcmtleSJdLCJyb3V0aW5nS2V5cyI6W10sInNlcnZpY2VFbmRwb2ludCI6Imh0dHBzOi8vYWdlbnQuZXhhbXBsZS5jb20vIn1dfX0',
    signer: 'GjZWsBLgZCR18aL468JAT7w9CZRiBnpxUPPgyQxh4voa',
  })

  let wallet: IndyWallet

  beforeAll(async () => {
    const config = getAgentConfig('SignatureDecoratorUtilsTest')
    wallet = new IndyWallet(config)
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.initialize(config.walletConfig!)
  })

  afterAll(async () => {
    await wallet.delete()
  })

  test('signData signs json object and returns SignatureDecorator', async () => {
    const seed1 = '00000000000000000000000000000My1'
    const { verkey } = await wallet.createDid({ seed: seed1 })

    const result = await signData(data, wallet, verkey)

    expect(result).toEqual(signedData)
  })

  test('unpackAndVerifySignatureDecorator unpacks signature decorator and verifies signature', async () => {
    const result = await unpackAndVerifySignatureDecorator(signedData, wallet)
    expect(result).toEqual(data)
  })

  test('unpackAndVerifySignatureDecorator throws when signature is not valid', async () => {
    const wrongSignature = '6sblL1+OMlTFB3KhIQ8HKKZga8te7NAJAmBVPg2WzNYjMHVjfm+LJP6ZS1GUc2FRtfczRyLEfXrXb86SnzBmBA=='

    const wronglySignedData = new SignatureDecorator({
      ...signedData,
      signature: wrongSignature,
    })

    expect.assertions(1)
    try {
      await unpackAndVerifySignatureDecorator(wronglySignedData, wallet)
    } catch (error) {
      expect(error.message).toEqual('Signature is not valid!')
    }
  })
})
