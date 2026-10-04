import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlphaVantageError, alphaVantageMonthly, classifyNotice } from './alphaVantage';

describe('classifyNotice', () => {
  it('reads the "too fast" notice as too-fast, even though it also mentions the daily limit', () => {
    expect(
      classifyNotice(
        'Thank you for using Alpha Vantage! Please consider spreading out your free API requests more sparingly (1 request per second). You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to lift the free key rate limit (25 requests per day) and instantly remove all daily rate limits.',
      ),
    ).toBe('too-fast');
  });

  it('recognises the daily limit', () => {
    expect(
      classifyNotice(
        'We have detected your API key as ABC123 and our standard API rate limit is 25 requests per day. Please subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly remove all daily rate limits.',
      ),
    ).toBe('daily-limit');
  });

  it('recognises premium-only endpoints and bad keys', () => {
    expect(classifyNotice('Thank you for using Alpha Vantage! This is a premium endpoint. You may subscribe to any of the premium plans at https://www.alphavantage.co/premium/ to instantly unlock all premium endpoints')).toBe('premium');
    expect(classifyNotice('the parameter apikey is invalid or missing. Please claim your free API key on (https://www.alphavantage.co/support/#api-key).')).toBe('bad-key');
  });
});

describe('alphaVantageMonthly', () => {
  afterEach(() => vi.unstubAllGlobals());

  function respond(body: unknown) {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  }

  it('parses adjusted closes oldest first', async () => {
    respond({
      'Monthly Adjusted Time Series': {
        '2024-02-29': { '5. adjusted close': '11.5' },
        '2024-01-31': { '5. adjusted close': '10.0' },
      },
    });
    expect(await alphaVantageMonthly('VTI', 'k')).toEqual({ symbol: 'VTI', dates: ['2024-01-31', '2024-02-29'], closes: [10, 11.5] });
  });

  it('throws a typed error for notices', async () => {
    respond({ Information: 'Please consider spreading out your free API requests more sparingly (1 request per second).' });
    await expect(alphaVantageMonthly('VTI', 'k')).rejects.toMatchObject({ kind: 'too-fast' });
    respond({ 'Error Message': 'Invalid API call.' });
    const err = await alphaVantageMonthly('NOPE', 'k').catch((e) => e);
    expect(err).toBeInstanceOf(AlphaVantageError);
    expect(err.kind).toBe('no-data');
  });
});
