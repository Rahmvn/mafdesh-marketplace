import React from "react";

export default function ProductForm({
  formData,
  errors,
  handleChange,
  handleImageChange,
  onSubmit,
  submitLabel,
  isLoading
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">

      {/* Product Name */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Product Name
        </label>
        <input
          type="text"
          name="name"
          value={formData.name}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
        {errors.name && <p className="text-red-500 text-sm">{errors.name}</p>}
      </div>

      {/* Price */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Price
        </label>
        <input
          type="number"
          name="price"
          value={formData.price}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
      </div>

      {/* Stock */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Stock
        </label>
        <input
          type="number"
          name="stock"
          value={formData.stock}
          onChange={handleChange}
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
      </div>

      {/* Overview */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Overview
        </label>
        <textarea
          name="overview"
          value={formData.overview}
          onChange={handleChange}
          rows="3"
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
      </div>

      {/* Features */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Key Features
        </label>
        <textarea
          name="features"
          value={formData.features}
          onChange={handleChange}
          rows="4"
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
      </div>

      {/* Specs */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Specifications
        </label>
        <textarea
          name="specs"
          value={formData.specs}
          onChange={handleChange}
          rows="3"
          className="w-full px-4 py-2 border border-blue-200 rounded-lg"
        />
      </div>

      {/* Images */}
      <div>
        <label className="block text-sm font-semibold text-blue-900 mb-2">
          Images (Min 3)
        </label>

        {formData.images.map((img, index) => (
          <div key={index} className="mb-3">
            <input
              type="file"
              accept="image/*"
              onChange={(e) =>
                handleImageChange(index, e.target.files[0])
              }
            />

            {img && (
              <img
                src={typeof img === "string" ? img : URL.createObjectURL(img)}
                alt=""
                className="mt-2 w-24 h-24 object-contain border"
              />
            )}
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-orange-500 text-white py-3 rounded-lg font-semibold"
      >
        {isLoading ? "Processing..." : submitLabel}
      </button>
    </form>
  );
}
