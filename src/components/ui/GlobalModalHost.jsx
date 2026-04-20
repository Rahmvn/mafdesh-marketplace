import React, { useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { subscribeToModal } from '../../hooks/modalService';

export default function GlobalModalHost() {
  const [modalState, setModalState] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    return subscribeToModal((nextModal) => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      setModalState(nextModal);

      if (nextModal?.autoDismiss) {
        timerRef.current = window.setTimeout(() => {
          setModalState(null);
          timerRef.current = null;
        }, nextModal.autoDismiss);
      }
    });
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  if (!modalState) {
    return null;
  }

  return (
    <Modal
      open={Boolean(modalState)}
      variant={modalState.variant}
      title={modalState.title}
      message={modalState.message}
      isConfirm={modalState.isConfirm}
      dismissLabel={modalState.dismissLabel}
      confirmLabel={modalState.confirmLabel}
      cancelLabel={modalState.cancelLabel}
      onClose={() => setModalState(null)}
      onConfirm={async () => {
        const handler = modalState.onConfirm;
        setModalState(null);
        if (handler) {
          await handler();
        }
      }}
    />
  );
}
