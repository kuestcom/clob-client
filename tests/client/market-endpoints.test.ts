import { ClobClient } from '../../src/client.ts'
import { Chain, type MarketByTokenResponse } from '../../src/types.ts'

class TestableMarketClient extends ClobClient {
  public lastEndpoint?: string
  public nextGetResponse: any = {}

  protected async get(endpoint: string): Promise<any> {
    this.lastEndpoint = endpoint
    return this.nextGetResponse
  }
}

describe('market endpoints', () => {
  it('fetches market mirror identifiers by token', async () => {
    const client = new TestableMarketClient('http://localhost', Chain.AMOY)
    const response: MarketByTokenResponse = {
      condition_id: '0xcondition',
      mirror_condition_id: '0xmirror-condition',
      primary_token_id: 'token-1',
      mirror_primary_token_id: 'mirror-token-1',
      secondary_token_id: 'token-2',
      mirror_secondary_token_id: 'mirror-token-2',
    }
    client.nextGetResponse = response

    await expect(client.getMarketByToken('token-1')).resolves.to.deep.equal(response)
    expect(client.lastEndpoint).to.equal('http://localhost/markets-by-token/token-1')
  })
})
