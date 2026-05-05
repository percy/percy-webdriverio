const { shouldSkipIframe, switchToParent } = require('../index.js');

describe('shouldSkipIframe', () => {
  let log;
  beforeEach(() => {
    log = { debug: () => {} };
  });

  it('skips iframe with dataPercyIgnore=true', () => {
    expect(shouldSkipIframe({ dataPercyIgnore: true, src: 'https://x.com' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with dataPercyIgnore=true and missing src (logs (no src))', () => {
    expect(shouldSkipIframe({ dataPercyIgnore: true }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with matchesIgnoreSelector=true', () => {
    expect(shouldSkipIframe({ matchesIgnoreSelector: true, src: 'https://x.com' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with matchesIgnoreSelector=true and missing src', () => {
    expect(shouldSkipIframe({ matchesIgnoreSelector: true }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with no src', () => {
    expect(shouldSkipIframe({}, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with unsupported src (about:blank)', () => {
    expect(shouldSkipIframe({ src: 'about:blank' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with srcdoc attribute', () => {
    expect(shouldSkipIframe({ src: 'https://x.com', srcdoc: '<p>x</p>' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips iframe with invalid URL', () => {
    expect(shouldSkipIframe({ src: 'not-a-url' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips same-origin iframe', () => {
    expect(shouldSkipIframe({ src: 'https://parent.com/embed', percyElementId: 'pe1' }, 'https://parent.com', log)).toBe(true);
  });

  it('skips cross-origin iframe without percyElementId', () => {
    expect(shouldSkipIframe({ src: 'https://other.com/' }, 'https://parent.com', log)).toBe(true);
  });

  it('does not skip valid cross-origin iframe with percyElementId', () => {
    expect(shouldSkipIframe({ src: 'https://other.com/', percyElementId: 'pe1' }, 'https://parent.com', log)).toBe(false);
  });
});

describe('switchToParent', () => {
  let log;
  beforeEach(() => {
    log = { debug: () => {} };
  });

  it('returns true when switchToParentFrame succeeds', async () => {
    const b = { switchToParentFrame: async () => {} };
    expect(await switchToParent(b, log)).toBe(true);
  });

  it('returns false when switchToParentFrame is missing', async () => {
    const b = { switchFrame: async () => {} };
    expect(await switchToParent(b, log)).toBe(false);
  });

  it('returns false when switchToParentFrame throws', async () => {
    const b = {
      switchToParentFrame: async () => { throw new Error('fail'); },
      switchFrame: async () => {}
    };
    expect(await switchToParent(b, log)).toBe(false);
  });

  it('returns false when both switchToParentFrame and switchFrame are missing', async () => {
    const b = {};
    expect(await switchToParent(b, log)).toBe(false);
  });
});
