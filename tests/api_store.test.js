import { test, mock } from 'node:test';
import assert from 'node:assert';
import handler from '../api/store.js';

test('api/store.js error handling', async (t) => {
  // Mock process.env
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  // Mock global fetch to throw an error
  const originalFetch = global.fetch;
  global.fetch = mock.fn(() => Promise.reject(new Error('Network error')));

  const req = {
    query: { vendor: 'test-vendor' }
  };

  const res = {
    status: mock.fn(() => res),
    send: mock.fn(() => res),
    setHeader: mock.fn(() => res),
    redirect: mock.fn(() => res)
  };

  try {
    await handler(req, res);

    assert.strictEqual(res.redirect.mock.callCount(), 1);
    assert.deepStrictEqual(res.redirect.mock.calls[0].arguments, [302, '/']);
  } finally {
    // Restore global fetch
    global.fetch = originalFetch;
  }
});

test('api/store.js store not found', async (t) => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  const originalFetch = global.fetch;
  global.fetch = mock.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve([])
    })
  );

  const req = {
    query: { vendor: 'non-existent' }
  };

  const res = {
    status: mock.fn(() => res),
    send: mock.fn(() => res),
    setHeader: mock.fn(() => res),
    redirect: mock.fn(() => res)
  };

  try {
    await handler(req, res);

    assert.strictEqual(res.redirect.mock.callCount(), 1);
    assert.deepStrictEqual(res.redirect.mock.calls[0].arguments, [302, '/']);
  } finally {
    global.fetch = originalFetch;
  }
});

test('api/store.js happy path', async (t) => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  const originalFetch = global.fetch;
  global.fetch = mock.fn(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve([
          {
            business_name: 'Test Store',
            bio: 'Test Bio'
          }
        ])
    })
  );

  const req = {
    query: { vendor: 'test-vendor' }
  };

  const res = {
    status: mock.fn(() => res),
    send: mock.fn(() => res),
    setHeader: mock.fn(() => res),
    redirect: mock.fn(() => res)
  };

  try {
    await handler(req, res);

    assert.strictEqual(res.status.mock.callCount(), 1);
    assert.strictEqual(res.status.mock.calls[0].arguments[0], 200);
    assert.strictEqual(res.setHeader.mock.calls[0].arguments[0], 'Content-Type');
    assert.strictEqual(res.setHeader.mock.calls[0].arguments[1], 'text/html');
    assert.strictEqual(res.send.mock.callCount(), 1);
    const html = res.send.mock.calls[0].arguments[0];
    assert.ok(html.includes('Test Store'));
    assert.ok(html.includes('Test Bio'));
  } finally {
    global.fetch = originalFetch;
  }
});
