import { test, mock } from 'node:test';
import assert from 'node:assert';
import handler from '../api/product.js';

test('api/product.js error handling', async (t) => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  const originalFetch = global.fetch;
  global.fetch = mock.fn(() => Promise.reject(new Error('Network error')));

  const req = {
    query: { id: 'test-id' }
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

test('api/product.js product not found', async (t) => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  const originalFetch = global.fetch;
  global.fetch = mock.fn(() =>
    Promise.resolve({
      json: () => Promise.resolve([])
    })
  );

  const req = {
    query: { id: 'non-existent' }
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

test('api/product.js happy path', async (t) => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'fake-key';

  const originalFetch = global.fetch;
  global.fetch = mock.fn(() =>
    Promise.resolve({
      json: () =>
        Promise.resolve([
          {
            name: 'Test Product',
            price: 5000,
            description: 'Test Description',
            image_url: 'https://example.com/image.jpg'
          }
        ])
    })
  );

  const req = {
    query: { id: 'test-id' }
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
    assert.ok(html.includes('Test Product'));
    assert.ok(html.includes('₦5,000'));
    assert.ok(html.includes('Test Description'));
  } finally {
    global.fetch = originalFetch;
  }
});
