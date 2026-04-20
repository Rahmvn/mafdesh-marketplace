import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../components/ui/Modal';

export default function useModal(options = {}) {
  const { darkMode = false } = options;
  const [modalState, setModalState] = useState(null);
  const timerRef = useRef(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const closeModal = useCallback(() => {
    clearTimer();
    setModalState(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const openModal = useCallback(
    ({ autoDismiss = false, ...nextState }) => {
      clearTimer();
      setModalState(nextState);

      if (autoDismiss) {
        timerRef.current = window.setTimeout(() => {
          setModalState(null);
          timerRef.current = null;
        }, 4000);
      }
    },
    [clearTimer]
  );

  const showSuccess = useCallback(
    (title, message) => {
      openModal({
        variant: 'success',
        title,
        message,
        isConfirm: false,
        dismissLabel: 'Got it',
        autoDismiss: true,
      });
    },
    [openModal]
  );

  const showError = useCallback(
    (title, message) => {
      openModal({
        variant: 'error',
        title,
        message,
        isConfirm: false,
        dismissLabel: 'OK',
      });
    },
    [openModal]
  );

  const showWarning = useCallback(
    (title, message) => {
      openModal({
        variant: 'warning',
        title,
        message,
        isConfirm: false,
        dismissLabel: 'OK',
      });
    },
    [openModal]
  );

  const showConfirm = useCallback(
    (title, message, onConfirm) => {
      openModal({
        variant: 'confirm',
        title,
        message,
        isConfirm: true,
        onConfirm,
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
      });
    },
    [openModal]
  );

  const ModalComponent = useMemo(() => {
    return function ModalRenderer() {
      if (!modalState) {
        return null;
      }

      return createElement(Modal, {
        open: Boolean(modalState),
        variant: modalState.variant,
        title: modalState.title,
        message: modalState.message,
        darkMode,
        isConfirm: modalState.isConfirm,
        dismissLabel: modalState.dismissLabel,
        confirmLabel: modalState.confirmLabel,
        cancelLabel: modalState.cancelLabel,
        onClose: closeModal,
        onConfirm: async () => {
          const confirmHandler = modalState.onConfirm;
          closeModal();
          if (confirmHandler) {
            await confirmHandler();
          }
        },
      });
    };
  }, [closeModal, darkMode, modalState]);

  return {
    showSuccess,
    showError,
    showWarning,
    showConfirm,
    ModalComponent,
  };
}
