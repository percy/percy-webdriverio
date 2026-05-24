const { shouldSkipIframe, switchToParent, processFrameTree, captureSerializedDOM } = require('../index.js');

// Build a minimal element handle stub for top-level iframe iteration.
function makeIframeStub(attrs) {
  return {
    getAttribute: (name) => Promise.resolve(attrs[name] ?? null),
    execute: () => Promise.resolve(false)
  };
}

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
    expect(await switchToParent(b, log, 1)).toBe(true);
  });

  it('returns true at depth=1 when switchToParentFrame is missing (switchFrame(null) is the page)', async () => {
    const b = { switchFrame: async () => {} };
    expect(await switchToParent(b, log, 1)).toBe(true);
  });

  it('returns false at depth>1 when switchToParentFrame is missing (cannot step exactly one level)', async () => {
    const b = { switchFrame: async () => {} };
    expect(await switchToParent(b, log, 2)).toBe(false);
  });

  it('falls back to switchFrame(null) and reports success at depth=1 when switchToParentFrame throws', async () => {
    const b = {
      switchToParentFrame: async () => { throw new Error('fail'); },
      switchFrame: async () => {}
    };
    expect(await switchToParent(b, log, 1)).toBe(true);
  });

  it('returns false at depth>1 when switchToParentFrame throws', async () => {
    const b = {
      switchToParentFrame: async () => { throw new Error('fail'); },
      switchFrame: async () => {}
    };
    expect(await switchToParent(b, log, 2)).toBe(false);
  });

  it('returns false when both switchToParentFrame and switchFrame fail', async () => {
    const b = {
      switchFrame: async () => { throw new Error('no switch'); }
    };
    expect(await switchToParent(b, log, 1)).toBe(false);
  });

  it('caches the missing switchToParentFrame capability across calls', async () => {
    let probes = 0;
    const b = {
      get switchToParentFrame() { probes++; return undefined; },
      switchFrame: async () => {}
    };
    await switchToParent(b, log, 1);
    await switchToParent(b, log, 1);
    await switchToParent(b, log, 1);
    // Capability is detected once and cached; subsequent calls don't re-probe.
    expect(probes).toBe(1);
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

  it('does not throw at depth=1 when switchToParentFrame is missing (switchFrame(null) is the parent)', async () => {
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

  it('preserves Error cause via standard Error constructor when both capture and parent-restore fail at depth>1', async () => {
    // depth=2 plus switchFrame(null) failing forces the not-ok branch with
    // a non-null capturedError, which is what triggers the cause merge.
    let executeCalls = 0;
    const innerErr = new Error('serialize blew up');
    const b = {
      switchFrame: jasmine.createSpy('switchFrame').and.callFake((arg) => {
        // First call (switchFrame(iframeElement)) succeeds; switchFrame(null) fails.
        if (arg === null) return Promise.reject(new Error('cannot reach top'));
        return Promise.resolve();
      }),
      execute: jasmine.createSpy('execute').and.callFake((arg) => {
        executeCalls++;
        if (executeCalls === 1) return Promise.resolve(); // percyDOMScript inject
        if (executeCalls === 2) return Promise.resolve('https://x.com/'); // document.URL
        // PercyDOM.serialize throws to populate capturedError
        return Promise.reject(innerErr);
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
    // Built via `new Error(msg, { cause })` so the standard accessor surfaces it.
    expect(thrown.cause).toBe(innerErr);
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

describe('_iframe_shim helpers', () => {
  const shim = require('../_iframe_shim');

  describe('resolveMaxFrameDepth', () => {
    it('defaults when nothing requested', () => {
      expect(shim.resolveMaxFrameDepth({})).toBeGreaterThanOrEqual(1);
    });

    it('clamps to hard cap when oversized', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: 9999 })).toBeLessThanOrEqual(25);
    });

    it('falls back to default for NaN input', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: 'banana' })).toBeGreaterThanOrEqual(1);
    });

    it('accepts maxIframeDepth alias', () => {
      expect(shim.resolveMaxFrameDepth({ maxIframeDepth: 3 })).toBe(3);
    });

    it('clamps negative to 0', () => {
      expect(shim.resolveMaxFrameDepth({ maxFrameDepth: -5 })).toBe(0);
    });
  });

  describe('resolveIgnoreSelectors', () => {
    it('returns [] for missing/empty options', () => {
      expect(shim.resolveIgnoreSelectors({})).toEqual([]);
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: '' })).toEqual([]);
    });

    it('returns filtered array when given an array', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: ['.a', '', '.b', 42] })).toEqual(['.a', '.b']);
    });

    it('wraps a non-empty string in a single-element array', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: '.foo' })).toEqual(['.foo']);
    });

    it('returns [] for unrecognised types', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreIframeSelectors: { weird: true } })).toEqual([]);
    });

    it('supports the ignoreSelectors alias', () => {
      expect(shim.resolveIgnoreSelectors({ ignoreSelectors: '.bar' })).toEqual(['.bar']);
    });
  });

  describe('normalizeIgnoreSelectors', () => {
    it('delegates to resolveIgnoreSelectors', () => {
      expect(shim.normalizeIgnoreSelectors({ ignoreIframeSelectors: '.x' })).toEqual(['.x']);
    });
  });

  describe('isUnsupportedIframeSrc', () => {
    it('flags vbscript: (the regression)', () => {
      expect(shim.isUnsupportedIframeSrc('vbscript:msgbox')).toBe(true);
    });

    it('passes through https://', () => {
      expect(shim.isUnsupportedIframeSrc('https://example.com')).toBe(false);
    });
  });
});

describe('captureSerializedDOM multi top-level iframes without switchToParentFrame', () => {
  let log;
  beforeEach(() => {
    log = { debug: jasmine.createSpy('debug') };
  });

  it('captures ALL sibling top-level CORS frames when switchToParentFrame is missing', async () => {
    // Regression: previously switchToParent returned false at depth=1, which
    // raised percyContextLost on the first successful capture. The outer
    // captureSerializedDOM loop then broke and only iframe[0] was kept.
    const topIframes = [
      makeIframeStub({ src: 'https://a.example/', 'data-percy-element-id': 'a' }),
      makeIframeStub({ src: 'https://b.example/', 'data-percy-element-id': 'b' }),
      makeIframeStub({ src: 'https://c.example/', 'data-percy-element-id': 'c' })
    ];

    // execute call sequence per top-level iframe (post initial page serialize):
    //   1) percyDOMScript inject
    //   2) document.URL
    //   3) PercyDOM.serialize → snapshot
    let executeCalls = 0;
    let mainPageServed = false;
    const urlFor = ['https://a.example/', 'https://b.example/', 'https://c.example/'];
    let currentIdx = -1;

    const b = {
      // No switchToParentFrame — this is the regression environment.
      switchFrame: jasmine.createSpy('switchFrame').and.callFake((arg) => {
        // Track which iframe is "current" so document.URL returns the right value.
        if (arg && arg.getAttribute) {
          for (let i = 0; i < topIframes.length; i++) {
            if (topIframes[i] === arg) { currentIdx = i; break; }
          }
        } else if (arg === null) {
          currentIdx = -1;
        }
        return Promise.resolve();
      }),
      execute: jasmine.createSpy('execute').and.callFake((fnOrScript) => {
        executeCalls++;
        // First execute is the main-page serialize:
        if (!mainPageServed) {
          mainPageServed = true;
          return Promise.resolve({ domSnapshot: { html: '<html></html>' }, url: 'https://page.example/' });
        }
        // Subsequent calls inside processFrameTree: inject / URL / serialize.
        if (typeof fnOrScript === 'string') return Promise.resolve();
        if (currentIdx >= 0) {
          // Heuristic: if execute is the URL fetch, return URL; otherwise return snapshot.
          // Use call count parity per frame: order is inject, url, serialize.
          // Simpler: track per-frame state.
          if (!b._urlSent) {
            b._urlSent = new Set();
          }
          if (!b._urlSent.has(currentIdx)) {
            b._urlSent.add(currentIdx);
            return Promise.resolve(urlFor[currentIdx]);
          }
          return Promise.resolve({ html: `<html data-frame="${currentIdx}"></html>` });
        }
        return Promise.resolve(null);
      }),
      $$: jasmine.createSpy('$$').and.callFake(() => {
        // First $$ — top-level iframes; subsequent (inside processFrameTree
        // child enumeration) — no nested iframes.
        if (!b._topQueried) {
          b._topQueried = true;
          return Promise.resolve(topIframes);
        }
        return Promise.resolve([]);
      })
    };

    const result = await captureSerializedDOM(b, {}, '/*percyDOM*/', log);

    expect(result.domSnapshot).toBeDefined();
    expect(result.url).toBe('https://page.example/');
    // The crux: ALL three top-level CORS iframes captured, not just iframe[0].
    expect(Array.isArray(result.domSnapshot.corsIframes)).toBe(true);
    expect(result.domSnapshot.corsIframes.length).toBe(3);
    const elementIds = result.domSnapshot.corsIframes.map(c => c.iframeData.percyElementId);
    expect(elementIds).toEqual(['a', 'b', 'c']);
  });

  it('depth>1 with switchToParentFrame missing still raises percyContextLost with partialCapture', async () => {
    // Direct processFrameTree call at depth=2 with no switchToParentFrame:
    // switchToParent must return false → finally throws percyContextLost,
    // partialCapture carries what we collected before failing.
    let executeCalls = 0;
    const b = {
      // No switchToParentFrame on purpose.
      switchFrame: () => Promise.resolve(),
      execute: jasmine.createSpy('execute').and.callFake(() => {
        executeCalls++;
        if (executeCalls === 1) return Promise.resolve(); // percyDOMScript inject
        if (executeCalls === 2) return Promise.resolve('https://deep.example/'); // document.URL
        return Promise.resolve({ html: '<html></html>' }); // serialize
      }),
      $$: () => Promise.resolve([])
    };
    const ctx = { maxFrameDepth: 10, ignoreSelectors: [], options: {}, percyDOMScript: '', log };
    let thrown;
    try {
      await processFrameTree(b, {}, { src: 'https://deep.example/', percyElementId: 'd' }, 2, new Set(), ctx);
    } catch (e) { thrown = e; }
    expect(thrown).toBeDefined();
    expect(thrown.percyContextLost).toBe(true);
    expect(Array.isArray(thrown.partialCapture)).toBe(true);
    expect(thrown.partialCapture.length).toBe(1);
    expect(thrown.partialCapture[0].iframeData.percyElementId).toBe('d');
  });
});
