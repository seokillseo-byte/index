import { IntegrationsService } from '../src/integrations/integrations.service';

describe('verified provider URL property scope', () => {
  const service = new IntegrationsService({} as never, {} as never);
  const matcher = service as unknown as {
    urlMatchesSite(value: string, siteUrl: string): boolean;
  };

  it('accepts the exact URL-prefix property and its child paths', () => {
    expect(matcher.urlMatchesSite('https://example.com/blog', 'https://example.com/blog')).toBe(true);
    expect(matcher.urlMatchesSite('https://example.com/blog/article', 'https://example.com/blog')).toBe(true);
  });

  it('rejects sibling paths that only share the same string prefix', () => {
    expect(matcher.urlMatchesSite('https://example.com/blogger/article', 'https://example.com/blog')).toBe(false);
  });

  it('does not allow another origin under a URL-prefix property', () => {
    expect(matcher.urlMatchesSite('https://sub.example.com/blog/article', 'https://example.com/blog')).toBe(false);
  });

  it('accepts subdomains only for a Search Console domain property', () => {
    expect(matcher.urlMatchesSite('https://shop.example.com/product', 'sc-domain:example.com')).toBe(true);
    expect(matcher.urlMatchesSite('https://example.com.evil.test/product', 'sc-domain:example.com')).toBe(false);
  });
});
