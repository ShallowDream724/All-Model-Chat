import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APP_SETTINGS } from '../../constants/appConstants';
import type { AppSettings, UploadedFile } from '../../types';
import { geminiServiceInstance } from '../../services/geminiService';
import { getKeyForRequest } from '../../utils/apiUtils';
import { getFilePollingDelayMs, useFilePolling } from './useFilePolling';
import { POLLING_INTERVAL_MS } from '../../services/api/filePollingConfig';

vi.mock('../../services/geminiService', () => ({
  geminiServiceInstance: {
    getFileMetadata: vi.fn(),
  },
}));

vi.mock('../../utils/apiUtils', () => ({
  getKeyForRequest: vi.fn(),
}));

vi.mock('../../services/logService', () => ({
  logService: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const getFileMetadataMock = vi.mocked(geminiServiceInstance.getFileMetadata);
const getKeyForRequestMock = vi.mocked(getKeyForRequest);

describe('getFilePollingDelayMs', () => {
  it('uses the base polling interval before failures', () => {
    expect(getFilePollingDelayMs(0)).toBe(POLLING_INTERVAL_MS);
  });

  it('backs off polling after repeated metadata failures', () => {
    expect(getFilePollingDelayMs(1)).toBe(POLLING_INTERVAL_MS * 2);
    expect(getFilePollingDelayMs(2)).toBe(POLLING_INTERVAL_MS * 4);
  });

  it('caps polling backoff so processing files still refresh periodically', () => {
    expect(getFilePollingDelayMs(10)).toBe(POLLING_INTERVAL_MS * 8);
  });
});

describe('useFilePolling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    getKeyForRequestMock.mockReturnValue({ key: 'api-key', isNewKey: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const renderPollingHook = (
    getProps: () => {
      appSettings: AppSettings;
      selectedFiles: UploadedFile[];
      setSelectedFiles: React.Dispatch<React.SetStateAction<UploadedFile[]>>;
      currentChatSettings: AppSettings;
    },
  ) => {
    const container = document.createElement('div');
    const root = createRoot(container);

    const TestComponent = () => {
      useFilePolling(getProps());
      return null;
    };

    const render = () => {
      act(() => {
        root.render(React.createElement(TestComponent));
      });
    };

    render();

    return {
      rerender: render,
      unmount: () => {
        act(() => {
          root.unmount();
        });
      },
    };
  };

  it('keeps polling a processing file after rerenders with new settings object identities', async () => {
    let appSettings = { ...DEFAULT_APP_SETTINGS };
    let currentChatSettings = { ...DEFAULT_APP_SETTINGS };
    let selectedFiles: UploadedFile[] = [
      {
        id: 'video-file',
        name: 'clip.mp4',
        type: 'video/mp4',
        size: 1024,
        uploadState: 'processing_api',
        isProcessing: true,
        progress: 100,
        fileApiName: 'files/video-file',
        fileUri: 'https://generativelanguage.googleapis.com/v1beta/files/video-file',
      },
    ];

    const setSelectedFiles = vi.fn((updater: React.SetStateAction<UploadedFile[]>) => {
      selectedFiles = typeof updater === 'function' ? updater(selectedFiles) : updater;
    });

    getFileMetadataMock.mockResolvedValueOnce({ state: 'PROCESSING' } as Awaited<
      ReturnType<typeof geminiServiceInstance.getFileMetadata>
    >);
    getFileMetadataMock.mockResolvedValueOnce({ state: 'ACTIVE' } as Awaited<
      ReturnType<typeof geminiServiceInstance.getFileMetadata>
    >);

    const hook = renderPollingHook(() => ({
      appSettings,
      selectedFiles,
      setSelectedFiles,
      currentChatSettings,
    }));

    await act(async () => {
      await Promise.resolve();
    });

    expect(getFileMetadataMock).toHaveBeenCalledTimes(1);

    appSettings = { ...appSettings };
    currentChatSettings = { ...currentChatSettings };
    hook.rerender();

    await act(async () => {
      vi.advanceTimersByTime(POLLING_INTERVAL_MS);
      await Promise.resolve();
    });

    expect(getFileMetadataMock).toHaveBeenCalledTimes(2);
    expect(selectedFiles[0]).toMatchObject({
      uploadState: 'active',
      isProcessing: false,
    });

    hook.unmount();
  });
});
