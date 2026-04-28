import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translations } from '../../utils/translations';
import { SidebarHeader } from './SidebarHeader';

describe('SidebarHeader', () => {
  let container: HTMLDivElement;
  let root: Root;

  const t = (key: keyof typeof translations) => String(key);

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it('renders the sidebar logo from the PNG asset', () => {
    act(() => {
      root.render(<SidebarHeader isOpen={true} onToggle={vi.fn()} onNewChat={vi.fn()} t={t} themeId="pearl" />);
    });

    const logoButton = container.querySelector('button[aria-label="headerNewChat_aria"]');
    const logo = logoButton?.querySelector('img[alt="AMC WebUI"]');

    expect(logo?.getAttribute('src')).toBe('/sidebar-logo.png');
    expect(logoButton?.getAttribute('type')).toBe('button');
    expect(container.querySelector('a')).toBeNull();
    expect(logoButton?.querySelector('svg')).toBeNull();
  });

  it('uses the dark sidebar logo for the onyx theme', () => {
    act(() => {
      root.render(<SidebarHeader isOpen={true} onToggle={vi.fn()} onNewChat={vi.fn()} t={t} themeId="onyx" />);
    });

    const logo = container.querySelector('button[aria-label="headerNewChat_aria"] img[alt="AMC WebUI"]');

    expect(logo?.getAttribute('src')).toBe('/sidebar-logo-dark.png');
  });

  it('starts a new chat from the logo without navigating away', () => {
    const onNewChat = vi.fn();

    act(() => {
      root.render(<SidebarHeader isOpen={true} onToggle={vi.fn()} onNewChat={onNewChat} t={t} themeId="pearl" />);
    });

    const logoButton = container.querySelector('button[aria-label="headerNewChat_aria"]');

    act(() => {
      logoButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});
