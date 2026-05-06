const { shouldSkipIframe, switchToParent, processFrameTree, captureSerializedDOM } = require('../index.js');

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

describe('processFrameTree', () => {
  let log;
  beforeEach(() => {
    log = { debug: jasmine.createSpy('debug') };
  });

  it('returns [] when depth exceeds maxFrameDepth', async () => {
    const b = {};
    const ctx = { maxFrameDepth: 2, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 3, new Set(), ctx);
    expect(result).toEqual([]);
  });

  it('returns [] when iframe URL is in ancestor chain (cyclic)', async () => {
    const b = {};
    const ancestors = new Set(['https://cyclic.com']);
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://cyclic.com', percyElementId: 'pe' }, 1, ancestors, ctx);
    expect(result).toEqual([]);
  });

  it('returns [] when post-switch document.URL is unsupported', async () => {
    const b = {
      switchFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        if (typeof arg === 'string') return Promise.resolve(); // percyDOMScript inject
        // First execute for document.URL — return about:blank
        return Promise.resolve('about:blank');
      })
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 1, new Set(), ctx);
    expect(result).toEqual([]);
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/unsupported URL/));
  });

  it('returns [] when serialization yields no snapshot', async () => {
    let executeCalls = 0;
    const b = {
      switchFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        executeCalls++;
        // 1: percyDOMScript inject (string)
        // 2: document.URL
        // 3: PercyDOM.serialize → null
        if (executeCalls === 1) return Promise.resolve();
        if (executeCalls === 2) return Promise.resolve('https://x.com/');
        return Promise.resolve(null);
      })
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 1, new Set(), ctx);
    expect(result).toEqual([]);
  });

  it('throws percyContextLost when depth>1 and parent restore fails', async () => {
    let executeCalls = 0;
    const b = {
      switchFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        executeCalls++;
        if (executeCalls === 1) return Promise.resolve();
        if (executeCalls === 2) return Promise.resolve('https://x.com/');
        return Promise.resolve({ html: '<html></html>' });
      }),
      $$: () => Promise.resolve([])
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    let thrown;
    try {
      await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 2, new Set(), ctx);
    } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.percyContextLost).toBe(true);
    expect(Array.isArray(thrown.partialCapture)).toBe(true);
  });

  it('does not throw at depth=1 when parent restore fails', async () => {
    let executeCalls = 0;
    const b = {
      switchFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        executeCalls++;
        if (executeCalls === 1) return Promise.resolve();
        if (executeCalls === 2) return Promise.resolve('https://x.com/');
        return Promise.resolve({ html: '<html></html>' });
      }),
      $$: () => Promise.resolve([])
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 1, new Set(), ctx);
    expect(result.length).toBe(1);
  });

  it('handles getIframeMeta failures on child iframes by skipping that child', async () => {
    let executeCalls = 0;
    const badChild = { getAttribute: () => { throw new Error('child read fail'); } };
    const b = {
      switchFrame: () => Promise.resolve(),
      switchToParentFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        executeCalls++;
        if (executeCalls === 1) return Promise.resolve();
        if (executeCalls === 2) return Promise.resolve('https://x.com/');
        return Promise.resolve({ html: '<html></html>' });
      }),
      $$: () => Promise.resolve([badChild])
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    const result = await processFrameTree(b, {}, { src: 'https://x.com', percyElementId: 'pe' }, 1, new Set(), ctx);
    expect(result.length).toBe(1); // parent captured; bad child skipped
    expect(log.debug).toHaveBeenCalledWith(jasmine.stringMatching(/Could not read child iframe attributes/));
  });
});
