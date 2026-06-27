import {
  applyBrandingFooter,
  BRANDING_FOOTER_TEXT,
  BRANDING_FOOTER_HTML,
  tierAllowsCustomDomain,
  tierHasBrandingFooter,
  TIERS,
} from '../src';

describe('tier capability flags', () => {
  it('free tier cannot use a custom domain but carries the branding footer', () => {
    expect(tierAllowsCustomDomain('free')).toBe(false);
    expect(tierHasBrandingFooter('free')).toBe(true);
  });

  it('hobby tier can use a custom domain and removes the footer', () => {
    expect(tierAllowsCustomDomain('hobby')).toBe(true);
    expect(tierHasBrandingFooter('hobby')).toBe(false);
  });

  it('pro tier can use a custom domain and removes the footer', () => {
    expect(tierAllowsCustomDomain('pro')).toBe(true);
    expect(tierHasBrandingFooter('pro')).toBe(false);
  });

  it('custom tier can use a custom domain and removes the footer', () => {
    expect(tierAllowsCustomDomain('custom')).toBe(true);
    expect(tierHasBrandingFooter('custom')).toBe(false);
  });

  it('every tier config declares both new flags', () => {
    for (const id of Object.keys(TIERS) as (keyof typeof TIERS)[]) {
      expect(typeof TIERS[id].customDomain).toBe('boolean');
      expect(typeof TIERS[id].hasBrandingFooter).toBe('boolean');
    }
  });
});

describe('applyBrandingFooter', () => {
  it('appends text + html footer for the free tier', () => {
    const out = applyBrandingFooter('Hello', '<p>Hello</p>', 'free');
    expect(out.text).toBe('Hello' + BRANDING_FOOTER_TEXT);
    expect(out.html).toBe('<p>Hello</p>' + BRANDING_FOOTER_HTML);
  });

  it('leaves the bodies unchanged for paid tiers', () => {
    for (const tier of ['hobby', 'pro', 'custom'] as const) {
      const out = applyBrandingFooter('Hello', '<p>Hello</p>', tier);
      expect(out.text).toBe('Hello');
      expect(out.html).toBe('<p>Hello</p>');
    }
  });

  it('does not inject an html footer when there is no html body', () => {
    const out = applyBrandingFooter('Hello', null, 'free');
    expect(out.text).toBe('Hello' + BRANDING_FOOTER_TEXT);
    expect(out.html).toBeNull();
  });

  it('handles undefined html gracefully', () => {
    const out = applyBrandingFooter('Hello', undefined, 'free');
    expect(out.text).toContain('AI Guard Mail');
    expect(out.html).toBeUndefined();
  });
});