import { getAgentConfig } from '../../tests/helpers'

import { IndyWallet } from './IndyWallet'

describe('Wallet', () => {
  const config = getAgentConfig('WalletTest')
  const wallet = new IndyWallet(config)

  test('initialize public did', async () => {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await wallet.initialize(config.walletConfig!)

    await wallet.initPublicDid({ seed: '00000000000000000000000Forward01' })

    expect(wallet.publicDid).toEqual({
      did: 'DtWRdd6C5dN5vpcN6XRAvu',
      verkey: '82RBSn3heLgXzZd74UsMC8Q8YRfEEhQoAM7LUqE6bevJ',
    })
  })

  afterEach(async () => {
    await wallet.delete()
  })
})
