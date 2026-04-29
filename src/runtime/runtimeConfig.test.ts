import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getRuntimeConfigAppSettingsOverrides } from './runtimeConfig';

describe('runtimeConfig', () => {
  afterEach(() => {
    delete window.__AMC_RUNTIME_CONFIG__;
  });

  it('returns empty overrides when runtime config is missing', () => {
    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({});
  });

  it('reads supported app setting overrides from window runtime config', () => {
    window.__AMC_RUNTIME_CONFIG__ = {
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.runtime.example/v1beta',
    };

    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.runtime.example/v1beta',
    });
  });

  it('converts string values into typed setting overrides', () => {
    window.__AMC_RUNTIME_CONFIG__ = {
      serverManagedApi: 'true',
      useCustomApiConfig: '1',
      useApiProxy: 'false',
      apiProxyUrl: '  ',
    };

    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: false,
      apiProxyUrl: null,
    });
  });

  it('does not ship a Live API token endpoint in the static runtime config', () => {
    const runtimeConfigSource = fs.readFileSync(path.resolve(__dirname, '../../public/runtime-config.js'), 'utf8');

    expect(runtimeConfigSource).not.toContain('liveApiEphemeralTokenEndpoint');
    expect(runtimeConfigSource).not.toContain('/api/live-token');
  });

  it('defaults Docker runtime config to server-managed /api/gemini proxy credentials', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const webEntrypointSource = fs.readFileSync(path.join(projectRoot, 'docker/web-entrypoint.sh'), 'utf8');
    const composeSource = fs.readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');

    expect(webEntrypointSource).toContain('RUNTIME_SERVER_MANAGED_API:-true');
    expect(webEntrypointSource).toContain('RUNTIME_API_PROXY_URL:-/api/gemini');
    expect(composeSource).toContain('RUNTIME_SERVER_MANAGED_API:-true');
    expect(composeSource).toContain('RUNTIME_API_PROXY_URL:-/api/gemini');
  });

  it('configures the Docker web proxy for Files API uploads and module workers', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const nginxSource = fs.readFileSync(path.join(projectRoot, 'docker/nginx.conf'), 'utf8');

    expect(nginxSource).toContain('client_max_body_size 16m');
    expect(nginxSource).toContain('location = /pdf.worker.min.mjs');
    expect(nginxSource).toContain('Cache-Control "no-store"');
    expect(nginxSource).toContain('location ~* \\.mjs$');
    expect(nginxSource).toContain('application/javascript mjs');
  });
});
