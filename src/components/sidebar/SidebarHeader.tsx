import React from 'react';
import { translations } from '../../utils/translations';
import { IconSidebarToggle } from '../icons/CustomIcons';
import { FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS } from '../../constants/appConstants';

interface SidebarHeaderProps {
  onToggle: () => void;
  onNewChat: () => void;
  isOpen: boolean;
  t: (key: keyof typeof translations) => string;
  themeId: string;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({ onToggle, onNewChat, isOpen, t, themeId }) => (
  <div className="p-2 sm:p-3 flex items-center justify-between flex-shrink-0 h-[60px]">
    <button
      type="button"
      onClick={onNewChat}
      className="flex items-center gap-2 pl-2 pr-0 py-0 bg-transparent border-0 hover:opacity-80 transition-opacity cursor-pointer"
      aria-label={t('headerNewChat_aria')}
    >
      <img
        src={themeId === 'onyx' ? '/sidebar-logo-dark.png' : '/sidebar-logo.png'}
        alt="AMC WebUI"
        className="h-8 w-auto object-contain"
      />
    </button>
    <button
      onClick={onToggle}
      className={`p-2 text-[var(--theme-icon-history)] hover:bg-[var(--theme-bg-tertiary)] rounded-md ${FOCUS_VISIBLE_RING_PRIMARY_OFFSET_CLASS}`}
      aria-label={isOpen ? t('historySidebarClose') : t('historySidebarOpen')}
    >
      <IconSidebarToggle size={20} strokeWidth={2} />
    </button>
  </div>
);
