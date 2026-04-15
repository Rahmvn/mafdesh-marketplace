import React, { useMemo, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const CONFIRM_TONE_STYLES = {
  danger: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
  warning: "bg-orange-600 hover:bg-orange-700 focus:ring-orange-500",
  success: "bg-green-600 hover:bg-green-700 focus:ring-green-500",
  primary: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
};

function AdminActionModalContent({
  title,
  description,
  actionLabel,
  reasonLabel,
  reasonPlaceholder,
  confirmTone,
  loading,
  riskNotice,
  confirmationKeyword,
  confirmationLabel,
  confirmationPlaceholder,
  onClose,
  onConfirm,
  children,
}) {
  const [reason, setReason] = useState("");
  const [confirmationValue, setConfirmationValue] = useState("");

  const normalizedKeyword = useMemo(
    () => confirmationKeyword.trim(),
    [confirmationKeyword]
  );

  const requiresTypedConfirmation = normalizedKeyword.length > 0;
  const confirmationMatches =
    !requiresTypedConfirmation ||
    confirmationValue.trim().toUpperCase() === normalizedKeyword.toUpperCase();

  const handleSubmit = async (event) => {
    event.preventDefault();
    await onConfirm({ reason: reason.trim() });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6">
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-orange-100 p-2 text-orange-600">
              <AlertTriangle size={18} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-gray-600">{description}</p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-md p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-4">
          {children}

          {riskNotice && (
            <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
              {riskNotice}
            </div>
          )}

          <div>
            <label className="mb-2 block text-sm font-semibold text-gray-800">
              {reasonLabel}
            </label>
            <textarea
              rows="4"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder={reasonPlaceholder}
              required
            />
          </div>

          {requiresTypedConfirmation && (
            <div>
              <label className="mb-2 block text-sm font-semibold text-gray-800">
                {confirmationLabel || `Type ${normalizedKeyword} to continue`}
              </label>
              <input
                type="text"
                value={confirmationValue}
                onChange={(event) => setConfirmationValue(event.target.value)}
                className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder={
                  confirmationPlaceholder || `Enter ${normalizedKeyword}`
                }
                autoComplete="off"
              />
              {!confirmationMatches && confirmationValue.trim() && (
                <p className="mt-2 text-xs text-red-600">
                  Confirmation text must exactly match {normalizedKeyword}.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                loading ||
                !reason.trim() ||
                (requiresTypedConfirmation && !confirmationMatches)
              }
              className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white focus:outline-none focus:ring-2 disabled:opacity-50 ${
                CONFIRM_TONE_STYLES[confirmTone] || CONFIRM_TONE_STYLES.danger
              }`}
            >
              {loading ? "Processing..." : actionLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function AdminActionModal({
  isOpen,
  title,
  description,
  actionLabel = "Confirm Action",
  reasonLabel = "Reason",
  reasonPlaceholder = "Explain why this action is necessary...",
  confirmTone = "danger",
  loading = false,
  riskNotice = "",
  confirmationKeyword = "",
  confirmationLabel,
  confirmationPlaceholder,
  onClose,
  onConfirm,
  children,
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <AdminActionModalContent
      key={`${title}-${actionLabel}-${confirmTone}`}
      title={title}
      description={description}
      actionLabel={actionLabel}
      reasonLabel={reasonLabel}
      reasonPlaceholder={reasonPlaceholder}
      confirmTone={confirmTone}
      loading={loading}
      riskNotice={riskNotice}
      confirmationKeyword={confirmationKeyword}
      confirmationLabel={confirmationLabel}
      confirmationPlaceholder={confirmationPlaceholder}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      {children}
    </AdminActionModalContent>
  );
}
