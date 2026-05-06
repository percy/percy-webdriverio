const {
  UNSUPPORTED_IFRAME_SRCS,
  DEFAULT_MAX_FRAME_DEPTH,
  HARD_MAX_FRAME_DEPTH,
  resolveMaxFrameDepth,
  resolveIgnoreSelectors,
  isUnsupportedIframeSrc
} = require('../iframe-utils');

describe('iframe-utils', () => {
  describe('UNSUPPORTED_IFRAME_SRCS', () => {
    it('exposes the canonical list', () => {
      expect(UNSUPPORTED_IFRAME_SRCS).toContain('about:');
      expect(UNSUPPORTED_IFRAME_SRCS).toContain('javascript:');
      expect(UNSUPPORTED_IFRAME_SRCS).toContain('data:');
    });
  });

  describe('isUnsupportedIframeSrc', () => {
    it('returns true for falsy inputs', () => {
      expect(isUnsupportedIframeSrc(null)).toBe(true);
      expect(isUnsupportedIframeSrc(undefined)).toBe(true);
      expect(isUnsupportedIframeSrc('')).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(isUnsupportedIframeSrc('about:blank')).toBe(true);
      expect(isUnsupportedIframeSrc('JavaScript:alert(1)')).toBe(true);
      expect(isUnsupportedIframeSrc('DATA:text/plain,foo')).toBe(true);
    });

    it('returns false for valid URLs', () => {
      expect(isUnsupportedIframeSrc('https://example.com')).toBe(false);
    });
  });

  describe('resolveMaxFrameDepth', () => {
    it('handles missing or invalid options', () => {
      expect(resolveMaxFrameDepth()).toBe(DEFAULT_MAX_FRAME_DEPTH);
      expect(resolveMaxFrameDepth({})).toBe(DEFAULT_MAX_FRAME_DEPTH);
      expect(resolveMaxFrameDepth({ maxIframeDepth: 0 })).toBe(DEFAULT_MAX_FRAME_DEPTH);
      expect(resolveMaxFrameDepth({ maxIframeDepth: -3 })).toBe(DEFAULT_MAX_FRAME_DEPTH);
      expect(resolveMaxFrameDepth({ maxIframeDepth: 'x' })).toBe(DEFAULT_MAX_FRAME_DEPTH);
    });

    it('caps at HARD_MAX_FRAME_DEPTH', () => {
      expect(resolveMaxFrameDepth({ maxIframeDepth: 100 })).toBe(HARD_MAX_FRAME_DEPTH);
    });

    it('passes valid values through', () => {
      expect(resolveMaxFrameDepth({ maxIframeDepth: 5 })).toBe(5);
    });
  });

  describe('resolveIgnoreSelectors', () => {
    it('handles missing or invalid input', () => {
      expect(resolveIgnoreSelectors()).toEqual([]);
      expect(resolveIgnoreSelectors({})).toEqual([]);
      expect(resolveIgnoreSelectors({ ignoreIframeSelectors: 'not-array' })).toEqual([]);
    });

    it('filters non-string and whitespace entries', () => {
      expect(resolveIgnoreSelectors({
        ignoreIframeSelectors: ['.x', '', null, 42, '.y']
      })).toEqual(['.x', '.y']);
    });
  });
});
