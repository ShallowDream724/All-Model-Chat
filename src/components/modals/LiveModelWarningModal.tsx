import React from 'react';
import { ConfirmationModal } from './ConfirmationModal';
import { useI18n } from '../../contexts/I18nContext';

interface LiveModelWarningModalProps {
  isOpen: boolean;
  modelName?: string;
  onClose: () => void;
  onConfirm: () => void;
}

export const LiveModelWarningModal: React.FC<LiveModelWarningModalProps> = ({
  isOpen,
  modelName,
  onClose,
  onConfirm,
}) => {
  const { t } = useI18n();
  const message = `${modelName ? `${modelName}: ` : ''}${t('liveModelWarningMessage')}`;

  return (
    <ConfirmationModal
      isOpen={isOpen}
      onClose={onClose}
      onConfirm={onConfirm}
      title={t('liveModelWarningTitle')}
      message={message}
      confirmLabel={t('liveModelWarningConfirm')}
      cancelLabel={t('cancel')}
      isDanger
    />
  );
};
