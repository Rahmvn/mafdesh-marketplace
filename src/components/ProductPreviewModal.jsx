import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function ProductPreviewModal({ previewData, onClose, onConfirm, isUploading }) {
  useEffect(() => {
    // lock background scroll while modal is open
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  if (!previewData) return null;

  const modal = (
    <div className="fixed inset-0 z-[999] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto sm:items-center">
      <div className="relative my-4 mx-2 w-full max-w-lg rounded-2xl bg-white shadow-2xl flex flex-col overflow-y-auto max-h-[90vh]">
        <div className="p-6">
          <h2 className="text-2xl font-bold text-blue-900 mb-6">Product Preview</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              {previewData.images?.[0] && (
                <img
                  src={URL.createObjectURL(previewData.images[0])}
                  alt="Main"
                  className="w-full max-h-[500px] object-contain rounded-lg border bg-white"
                />
              )}

              <div className="flex gap-2 mt-4">
                {previewData.images
                  ?.filter((img) => img)
                  .map((img, i) => (
                    <img
                      key={i}
                      src={URL.createObjectURL(img)}
                      alt=""
                      className="w-20 h-20 object-contain rounded border bg-white"
                    />
                  ))}
              </div>
            </div>

            <div>
              <h1 className="text-3xl font-bold text-blue-900">{previewData.name}</h1>

              <div className="flex items-center gap-2 mt-2">
                <span className="text-yellow-500">★★★★★</span>
                <span className="text-sm text-blue-600">(0 Reviews)</span>
              </div>

              <p className="text-orange-600 text-2xl font-bold mt-3">₦{Number(previewData.price).toLocaleString()}</p>

              <div className="mt-6 space-y-3">
                <button className="w-full bg-orange-500 text-white py-3 rounded-lg font-bold">Add to Cart</button>
                <button className="w-full border border-blue-300 text-blue-700 py-3 rounded-lg font-semibold">Buy Now</button>
              </div>

              <div className="mt-6 border-t pt-4 space-y-4 text-sm text-blue-800">
                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Overview</h4>
                  <p>{previewData.overview}</p>
                </div>

                <div>
                  <h4 className="font-semibold text-blue-900 mb-1">Key Features</h4>
                  <ul className="list-disc pl-5 space-y-1">
                    {previewData.features
                      ?.split('\n')
                      .map((f, i) => (
                        <li key={i}>{f.replace('•', '').trim()}</li>
                      ))}
                  </ul>
                </div>

                {previewData.specs && (
                  <div>
                    <h4 className="font-semibold text-blue-900 mb-1">Specifications</h4>
                    <p className="whitespace-pre-line">{previewData.specs}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex gap-3">
          <button onClick={onClose} className="flex-1 border border-blue-300 text-blue-700 py-3 rounded-lg font-semibold">Edit Product</button>
          <button onClick={onConfirm} disabled={isUploading} className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-semibold">{isUploading ? 'Publishing...' : 'Confirm & Publish'}</button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}