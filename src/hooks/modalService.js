const listeners = new Set();

function emit(modal) {
  listeners.forEach((listener) => listener(modal));
}

export function subscribeToModal(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function showGlobalSuccess(title, message) {
  emit({
    variant: 'success',
    title,
    message,
    isConfirm: false,
    dismissLabel: 'Got it',
    autoDismiss: 4000,
  });
}

export function showGlobalError(title, message) {
  emit({
    variant: 'error',
    title,
    message,
    isConfirm: false,
    dismissLabel: 'OK',
  });
}

export function showGlobalWarning(title, message) {
  emit({
    variant: 'warning',
    title,
    message,
    isConfirm: false,
    dismissLabel: 'OK',
  });
}

export function showGlobalConfirm(title, message, onConfirm) {
  emit({
    variant: 'confirm',
    title,
    message,
    isConfirm: true,
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    onConfirm,
  });
}

export function showGlobalLoginRequired(message, onConfirm, onCancel, options = {}) {
  emit({
    variant: 'warning',
    title: options.title || 'Login Required',
    message,
    isConfirm: true,
    confirmLabel: options.confirmLabel || 'Log In',
    cancelLabel: options.cancelLabel || 'Not Now',
    onConfirm,
    onCancel,
  });
}
