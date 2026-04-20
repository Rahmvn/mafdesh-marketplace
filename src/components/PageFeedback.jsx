import React from "react";
import { AlertTriangle } from "lucide-react";

export function GenericContentSkeleton({
  className = "",
  blocks = [
    "h-28 w-full",
    "h-24 w-11/12",
    "h-20 w-full",
    "h-16 w-9/12",
  ],
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      {blocks.map((blockClass, index) => (
        <div
          key={`${blockClass}-${index}`}
          className={`animate-pulse rounded-xl bg-gray-100 ${blockClass}`}
        />
      ))}
    </div>
  );
}

export function InlineLoadingSkeleton({
  className = "",
  blocks = ["h-4 w-36", "h-4 w-24"],
}) {
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((blockClass, index) => (
        <div
          key={`${blockClass}-${index}`}
          className={`animate-pulse rounded bg-gray-100 ${blockClass}`}
        />
      ))}
    </div>
  );
}

export function RetryablePageError({
  title = "We could not load this page",
  message = "Please try again.",
  onRetry,
  className = "",
  buttonLabel = "Try again",
}) {
  return (
    <div className={`flex items-center justify-center px-4 py-12 ${className}`}>
      <div className="w-full max-w-md rounded-2xl border border-orange-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{message}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-6 rounded-lg bg-orange-600 px-5 py-3 font-semibold text-white transition hover:bg-orange-700"
          >
            {buttonLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
