import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, Trash2, X, XCircle } from 'lucide-react';

const MODAL_STYLES = {
  success: {
    circle: 'bg-green-100 text-green-600',
    title: 'text-slate-900',
    Icon: Check,
  },
  error: {
    circle: 'bg-red-100 text-red-600',
    title: 'text-slate-900',
    Icon: XCircle,
  },
  warning: {
    circle: 'bg-orange-100 text-orange-600',
    title: 'text-slate-900',
    Icon: AlertTriangle,
  },
  confirm: {
    circle: 'bg-red-100 text-red-600',
    title: 'text-slate-900',
    Icon: Trash2,
  },
};

export default function Modal({
  open,
  variant = 'success',
  title,
  message,
  darkMode = false,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  dismissLabel = 'Got it',
  isConfirm = false,
  onConfirm,
  onClose,
}) {
  const [visible, setVisible] = useState(false);
  const style = MODAL_STYLES[variant] || MODAL_STYLES.success;
  const { Icon } = style;

  useEffect(() => {
    if (!open) {
      setVisible(false);
      return undefined;
    }

    const frameId = window.requestAnimationFrame(() => {
      setVisible(true);
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [open]);

  if (!open) {
    return null;
  }

  const cardClass = darkMode
    ? 'bg-slate-900 text-slate-100'
    : 'bg-white text-slate-900';
  const messageClass = darkMode ? 'text-slate-400' : 'text-slate-500';
  const secondaryButtonClass = darkMode
    ? 'bg-slate-800 text-slate-200 hover:bg-slate-700'
    : 'bg-slate-100 text-slate-700 hover:bg-slate-200';

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm"
      onClick={() => {
        if (!isConfirm) {
          onClose?.();
        }
      }}
    >
      <div
        className={`mx-4 w-full max-w-sm rounded-2xl shadow-2xl transition-all duration-150 ease-out ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        } ${cardClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 pb-6 pt-7 text-center">
          <div
            className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${style.circle}`}
          >
            <Icon className="h-7 w-7" />
          </div>

          <h2 className={`mt-4 text-lg font-bold ${darkMode ? 'text-slate-100' : style.title}`}>
            {title}
          </h2>
          <p className={`mt-2 text-sm ${messageClass}`}>{message}</p>

          {isConfirm ? (
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={onConfirm}
                className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                {confirmLabel}
              </button>
              <button
                type="button"
                onClick={onClose}
                className={`w-full rounded-xl px-4 py-3 text-sm font-semibold transition-colors ${secondaryButtonClass}`}
              >
                {cancelLabel}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              {dismissLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
