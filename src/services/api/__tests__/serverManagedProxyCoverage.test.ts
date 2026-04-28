import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Part } from '@google/genai';

type MockGoogleGenAIConfig = {
  apiKey: string;
  httpOptions?: {
    apiVersion?: string;
    baseUrl?: string;
  };
};

type ApiClientRequest = {
  path: string;
  body?: string | Blob;
  httpMethod: 'POST';
  httpOptions?: {
    apiVersion?: string;
    baseUrl?: string;
    headers?: Record<string, string>;
  };
  abortSignal?: AbortSignal;
};

type UploadRequestRecord = {
  url: string;
  headers: Record<string, string>;
};

const {
  clientConfigs,
  apiClientRequests,
  uploadRequests,
  generateContentMock,
  generateContentStreamMock,
  generateImagesMock,
  countTokensMock,
  filesGetMock,
} = vi.hoisted(() => {
  const generateContent = vi.fn(async (request: { model?: string; config?: { responseMimeType?: string } }) => {
    if (request.model?.includes('tts')) {
      return {
        candidates: [{ content: { parts: [{ inlineData: { data: 'audio-bytes' } }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
      };
    }

    if (request.config?.responseMimeType === 'application/json') {
      return {
        text: JSON.stringify({ suggestions: ['One', 'Two', 'Three'] }),
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { totalTokenCount: 2 },
      };
    }

    return {
      text: 'ok',
      candidates: [{ content: { parts: [{ text: 'ok' }] } }],
      usageMetadata: { totalTokenCount: 2 },
    };
  });

  return {
    clientConfigs: [] as MockGoogleGenAIConfig[],
    apiClientRequests: [] as ApiClientRequest[],
    uploadRequests: [] as UploadRequestRecord[],
    generateContentMock: generateContent,
    generateContentStreamMock: vi.fn(async function* () {
      yield {
        candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        usageMetadata: { totalTokenCount: 2 },
      };
    }),
    generateImagesMock: vi.fn(async () => ({
      generatedImages: [{ image: { imageBytes: 'image-bytes' } }],
    })),
    countTokensMock: vi.fn(async () => ({ totalTokens: 2 })),
    filesGetMock: vi.fn(async ({ name }: { name: string }) => ({
      name,
      uri: `https://generativelanguage.googleapis.com/v1beta/${name}`,
    })),
  };
});

vi.mock('../../../utils/db', () => ({
  dbService: {
    getAppSettings: vi.fn(async () => ({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: '/api/gemini',
      apiKey: null,
    })),
  },
}));

vi.mock('../../logService', () => ({
  logService: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn(), recordTokenUsage: vi.fn() },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn(function (config: MockGoogleGenAIConfig) {
    clientConfigs.push(config);

    return {
      models: {
        generateContent: generateContentMock,
        generateContentStream: generateContentStreamMock,
        generateImages: generateImagesMock,
        countTokens: countTokensMock,
      },
      files: {
        get: filesGetMock,
      },
      apiClient: {
        request: async (request: ApiClientRequest) => {
          apiClientRequests.push(request);
          if (request.path === 'upload/v1beta/files') {
            return {
              headers: {
                'x-goog-upload-url': 'https://generativelanguage.googleapis.com/upload/v1beta/files/session-1',
              },
              json: async () => ({}),
            };
          }

          return {
            headers: {
              'content-type': 'application/json',
              'x-goog-upload-status': 'final',
            },
            json: async () => ({
              file: {
                name: 'files/test-file',
                uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
              },
            }),
          };
        },
      },
    };
  }),
}));

import {
  generateContentTurnApi,
  sendStatelessMessageNonStreamApi,
  sendStatelessMessageStreamApi,
} from '../chatApi';
import { uploadFileApi, getFileMetadataApi } from '../fileApi';
import { generateImagesApi } from '../generation/imageApi';
import { generateSpeechApi, transcribeAudioApi } from '../generation/audioApi';
import { generateTitleApi, generateSuggestionsApi, translateTextApi } from '../generation/textApi';
import { countTokensApi } from '../generation/tokenApi';

class FakeXMLHttpRequest {
  upload = { addEventListener: vi.fn() };
  status = 0;
  responseText = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  private requestHeaders: Record<string, string> = {};
  private requestUrl = '';
  private responseHeaders: Record<string, string> = {};

  open(_method: string, url: string) {
    this.requestUrl = url;
  }

  setRequestHeader(header: string, value: string) {
    this.requestHeaders[header] = value;
  }

  getAllResponseHeaders() {
    return Object.entries(this.responseHeaders)
      .map(([header, value]) => `${header}: ${value}`)
      .join('\r\n');
  }

  send() {
    uploadRequests.push({
      url: this.requestUrl,
      headers: { ...this.requestHeaders },
    });

    queueMicrotask(() => {
      this.status = 200;
      this.responseText = JSON.stringify({
        file: {
          name: 'files/test-file',
          uri: 'https://generativelanguage.googleapis.com/v1beta/files/test-file',
        },
      });
      this.responseHeaders = {
        'content-type': 'application/json',
        'x-goog-upload-status': 'final',
      };
      this.onload?.();
    });
  }

  abort() {
    this.onabort?.();
  }
}

const expectEveryClientToUseProxy = () => {
  expect(clientConfigs.length).toBeGreaterThan(0);
  clientConfigs.forEach((config) => {
    expect(config.httpOptions?.baseUrl).toBe('/api/gemini');
    expect(config.httpOptions?.baseUrl).not.toContain('generativelanguage.googleapis.com');
  });
};

describe('server-managed /api/gemini proxy coverage', () => {
  beforeEach(() => {
    clientConfigs.length = 0;
    apiClientRequests.length = 0;
    uploadRequests.length = 0;
    vi.clearAllMocks();
    vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest);
  });

  it('routes standard Gemini HTTP service calls through /api/gemini', async () => {
    const abortSignal = new AbortController().signal;
    const parts: Part[] = [{ text: 'hello' }];

    await generateContentTurnApi('server-managed-marker', 'gemini-3-flash-preview', [], {}, abortSignal);
    await sendStatelessMessageStreamApi(
      'server-managed-marker',
      'gemini-3-flash-preview',
      [],
      parts,
      {},
      abortSignal,
      vi.fn(),
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    await sendStatelessMessageNonStreamApi(
      'server-managed-marker',
      'gemini-3-flash-preview',
      [],
      parts,
      {},
      abortSignal,
      vi.fn(),
      vi.fn(),
    );
    await generateImagesApi('server-managed-marker', 'imagen-4.0-generate-001', 'draw a cat', '1:1', undefined, abortSignal);
    await generateSpeechApi('server-managed-marker', 'gemini-3.1-flash-tts-preview', 'hello', 'Aoede', abortSignal);
    await transcribeAudioApi('server-managed-marker', new File(['audio'], 'sample.wav', { type: 'audio/wav' }), 'gemini-3-flash-preview');
    await translateTextApi('server-managed-marker', 'hello', 'Chinese');
    await generateSuggestionsApi('server-managed-marker', 'hello', 'hi', 'en');
    await generateTitleApi('server-managed-marker', 'hello', 'hi', 'en');
    await countTokensApi('server-managed-marker', 'gemini-3-flash-preview', parts);
    await getFileMetadataApi('server-managed-marker', 'files/test-file');

    expectEveryClientToUseProxy();
  });

  it('routes Files API session creation and upload bytes through /api/gemini', async () => {
    await uploadFileApi(
      'server-managed-marker',
      new File(['hello'], 'sample.txt', { type: 'text/plain' }),
      'text/plain',
      'sample.txt',
      new AbortController().signal,
    );

    expectEveryClientToUseProxy();
    expect(apiClientRequests[0].path).toBe('upload/v1beta/files');
    expect(apiClientRequests[0].httpOptions?.baseUrl).toBe('/api/gemini');
    expect(uploadRequests).toHaveLength(1);
    expect(uploadRequests[0].url).toContain('/api/gemini/upload/v1beta/files/session-1');
    expect(uploadRequests[0].url).not.toContain('generativelanguage.googleapis.com');
  });
});
