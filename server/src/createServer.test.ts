// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServer } from './createServer';
import type { AddressInfo } from 'node:net';
import http from 'node:http';

async function startHttpServer(server: http.Server): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}

const cleanupCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanupCallbacks.length) {
    const close = cleanupCallbacks.pop();
    if (close) {
      await close();
    }
  }
});

describe('createServer', () => {
  it('returns health details from GET /health', async () => {
    const app = createServer({
      geminiApiBase: 'https://generativelanguage.googleapis.com',
      geminiApiKey: 'server-key',
    });
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await fetch(`${started.baseUrl}/health`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('does not expose a Live API token endpoint', async () => {
    const app = createServer({
      geminiApiBase: 'https://generativelanguage.googleapis.com',
      geminiApiKey: 'server-key',
    });
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await fetch(`${started.baseUrl}/api/live-token`, { method: 'POST' });
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body).toEqual({ error: 'Not found' });
  });

  it('proxies /api/gemini/* preserving method/path/query/body and streaming response', async () => {
    const upstreamRequests: Array<{
      method: string;
      url: string;
      body: string;
      headers: http.IncomingHttpHeaders;
    }> = [];

    const upstream = http.createServer((request, response) => {
      const bodyChunks: Buffer[] = [];
      request.on('data', (chunk) => bodyChunks.push(Buffer.from(chunk)));
      request.on('end', () => {
        upstreamRequests.push({
          method: request.method ?? '',
          url: request.url ?? '',
          body: Buffer.concat(bodyChunks).toString('utf8'),
          headers: request.headers,
        });

        response.writeHead(201, {
          'content-type': 'text/event-stream',
          'x-upstream': 'yes',
        });
        response.write('chunk-1\n');
        setTimeout(() => {
          response.write('chunk-2\n');
          response.end();
        }, 25);
      });
    });

    const upstreamStarted = await startHttpServer(upstream);
    cleanupCallbacks.push(upstreamStarted.close);

    const app = createServer({
      geminiApiBase: upstreamStarted.baseUrl,
      geminiApiKey: 'server-key',
    });
    const appStarted = await startHttpServer(app);
    cleanupCallbacks.push(appStarted.close);

    const proxyResponse = await fetch(
      `${appStarted.baseUrl}/api/gemini/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-client': 'google-genai-sdk/test',
          'x-client-header': 'present',
        },
        body: JSON.stringify({ prompt: 'hello' }),
      },
    );

    const proxyBody = await proxyResponse.text();

    expect(proxyResponse.status).toBe(201);
    expect(proxyResponse.headers.get('content-type')).toContain('text/event-stream');
    expect(proxyResponse.headers.get('x-upstream')).toBe('yes');
    expect(proxyBody).toContain('chunk-1');
    expect(proxyBody).toContain('chunk-2');

    expect(upstreamRequests).toHaveLength(1);
    expect(upstreamRequests[0].method).toBe('POST');
    expect(upstreamRequests[0].url).toBe('/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(upstreamRequests[0].body).toBe(JSON.stringify({ prompt: 'hello' }));
    expect(upstreamRequests[0].headers['x-goog-api-key']).toBe('server-key');
    expect(upstreamRequests[0].headers['x-goog-api-client']).toBe('google-genai-sdk/test');
    expect(upstreamRequests[0].headers['x-client-header']).toBeUndefined();
  });

  it('only proxies documented Gemini request headers', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await new Promise<{ statusCode: number }>((resolve, reject) => {
      const request = http.request(`${started.baseUrl}/api/gemini/v1beta/models`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          connection: 'keep-alive',
          te: 'trailers',
          authorization: 'Bearer user-token',
          cookie: 'session=abc',
          'accept-encoding': 'gzip',
          'x-forwarded-for': '203.0.113.10',
          'x-real-ip': '203.0.113.11',
          'cf-connecting-ip': '203.0.113.12',
          'cf-ipcountry': 'US',
          origin: 'https://app.example',
          referer: 'https://app.example/chat',
          'accept-language': 'zh-CN,zh;q=0.9',
          'x-client-header': 'present',
          'x-goog-api-client': 'google-genai-sdk/test',
          'x-server-timeout': '90',
          'x-goog-upload-protocol': 'resumable',
          'x-goog-upload-command': 'upload, finalize',
          'x-goog-upload-header-content-length': '8388608',
          'x-goog-upload-header-content-type': 'application/pdf',
          'x-goog-upload-offset': '0',
        },
      });

      request.on('response', (proxyResponse) => {
        proxyResponse.resume();
        proxyResponse.on('end', () => {
          resolve({ statusCode: proxyResponse.statusCode ?? 0 });
        });
      });
      request.on('error', reject);
      request.end(JSON.stringify({ prompt: 'hello' }));
    });

    expect(response.statusCode).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const firstCall = fetchImpl.mock.calls[0];
    expect(firstCall).toBeDefined();
    if (!firstCall) {
      throw new Error('Expected fetchImpl to be called once');
    }

    const init = firstCall[1];
    expect(init).toBeDefined();
    if (!init) {
      throw new Error('Expected fetchImpl to receive RequestInit');
    }

    const headers = init.headers;
    expect(headers).toBeInstanceOf(Headers);
    if (!(headers instanceof Headers)) {
      throw new Error('Expected proxy request headers to be a Headers instance');
    }

    expect(headers.get('content-type')).toBe('application/json');
    expect(headers.get('x-goog-api-client')).toBe('google-genai-sdk/test');
    expect(headers.get('x-server-timeout')).toBe('90');
    expect(headers.get('x-goog-upload-protocol')).toBe('resumable');
    expect(headers.get('x-goog-upload-command')).toBe('upload, finalize');
    expect(headers.get('x-goog-upload-header-content-length')).toBe('8388608');
    expect(headers.get('x-goog-upload-header-content-type')).toBe('application/pdf');
    expect(headers.get('x-goog-upload-offset')).toBe('0');
    expect(headers.get('x-goog-api-key')).toBe('server-key');
    expect(headers.get('x-client-header')).toBeNull();
    expect(headers.get('connection')).toBeNull();
    expect(headers.get('te')).toBeNull();
    expect(headers.get('authorization')).toBeNull();
    expect(headers.get('cookie')).toBeNull();
    expect(headers.get('accept-encoding')).toBeNull();
    expect(headers.get('x-forwarded-for')).toBeNull();
    expect(headers.get('x-real-ip')).toBeNull();
    expect(headers.get('cf-connecting-ip')).toBeNull();
    expect(headers.get('cf-ipcountry')).toBeNull();
    expect(headers.get('origin')).toBeNull();
    expect(headers.get('referer')).toBeNull();
    expect(headers.get('accept-language')).toBeNull();
  });

  it('uses the browser-provided Gemini API key for proxy requests when no server key is configured', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: '',
      },
      { fetchImpl },
    );
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': 'browser-key',
      },
      body: JSON.stringify({ prompt: 'hello' }),
    });

    expect(response.status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0][1];
    if (!init?.headers || !(init.headers instanceof Headers)) {
      throw new Error('Expected proxy request headers to be a Headers instance');
    }

    expect(init.headers.get('x-goog-api-key')).toBe('browser-key');
  });

  it('prefers the server Gemini API key over a browser-provided key', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': 'browser-key',
      },
      body: JSON.stringify({ prompt: 'hello' }),
    });

    expect(response.status).toBe(202);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const init = fetchImpl.mock.calls[0][1];
    if (!init?.headers || !(init.headers instanceof Headers)) {
      throw new Error('Expected proxy request headers to be a Headers instance');
    }

    expect(init.headers.get('x-goog-api-key')).toBe('server-key');
  });

  it('writes concise proxy access logs without keys or request bodies', async () => {
    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('proxied', { status: 202 });
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
        proxyAccessLog: true,
      },
      { fetchImpl },
    );
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    try {
      const response = await fetch(
        `${started.baseUrl}/api/gemini/v1beta/models/gemini-3-flash-preview:generateContent?key=query-key`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': 'browser-key',
          },
          body: JSON.stringify({ prompt: 'prompt-secret' }),
        },
      );
      await response.text();

      expect(logSpy).toHaveBeenCalledTimes(1);
      const logLine = String(logSpy.mock.calls[0][0]);

      expect(logLine).toMatch(
        /^\[gemini-proxy\] POST \/v1beta\/models\/gemini-3-flash-preview:generateContent -> 202 \d+ms$/,
      );
      expect(logLine).not.toContain('server-key');
      expect(logLine).not.toContain('browser-key');
      expect(logLine).not.toContain('query-key');
      expect(logLine).not.toContain('prompt-secret');
    } finally {
      logSpy.mockRestore();
    }
  });

  it('returns a 502 JSON error when Gemini upstream fetch fails', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('network down');
    });
    const app = createServer(
      {
        geminiApiBase: 'https://example.test',
        geminiApiKey: 'server-key',
      },
      { fetchImpl },
    );
    const started = await startHttpServer(app);
    cleanupCallbacks.push(started.close);

    const response = await fetch(`${started.baseUrl}/api/gemini/v1beta/models`);
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body).toEqual({
      error: 'Gemini upstream request failed: network down',
    });
  });
});
