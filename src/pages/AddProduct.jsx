import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, AlertCircle, Search, Plus, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import { productService } from '../services/productService';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';
import Footer from '../components/Footer';
import { v4 as uuidv4 } from 'uuid';
import ProductPreviewModal from '../components/ProductPreviewModal';

export default function AddProduct() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    overview: '',
    features: '',
    specs: '',
    images: [null, null, null, null, null],
    pickupLocations: [], // new array for pickup locations
  });

  const [newLocation, setNewLocation] = useState(''); // for adding new pickup location
  const [errors, setErrors] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const filteredCategories = PRODUCT_CATEGORIES.filter(cat =>
    cat.toLowerCase().includes(categorySearch.toLowerCase())
  );

  useEffect(() => {
    const checkAuth = () => {
      const storedUser = localStorage.getItem('mafdesh_user');

      if (!storedUser) {
        alert('Please log in to access this page.');
        navigate('/login');
        return;
      }

      const userData = JSON.parse(storedUser);

      if (userData.role !== 'seller') {
        alert('Access denied. Only sellers can add products.');
        navigate('/login');
        return;
      }

      setCurrentUser(userData);
    };

    checkAuth();
  }, [navigate]);

  const handleImageChange = (index, file) => {
    if (!file) return;

    if (file.size > 3 * 1024 * 1024) {
      alert("Each image must be less than 3MB");
      return;
    }

    const updatedImages = [...formData.images];
    updatedImages[index] = file;

    setFormData(prev => ({
      ...prev,
      images: updatedImages
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  // Pickup locations handlers
  const addPickupLocation = () => {
    if (newLocation.trim()) {
      setFormData(prev => ({
        ...prev,
        pickupLocations: [...prev.pickupLocations, newLocation.trim()]
      }));
      setNewLocation('');
    }
  };

  const removePickupLocation = (index) => {
    setFormData(prev => ({
      ...prev,
      pickupLocations: prev.pickupLocations.filter((_, i) => i !== index)
    }));
  };

  const validate = () => {
    const newErrors = {};

    const requiredImages = formData.images.slice(0, 3);

    if (!formData.name.trim() || formData.name.trim().length < 5) {
      newErrors.name = 'Product name must be at least 5 characters';
    }

    if (formData.name.toLowerCase().includes('test')) {
      newErrors.name = 'Invalid product name';
    }
    if (!formData.overview || formData.overview.length < 40) {
      newErrors.overview = "Overview must be at least 40 characters";
    }

    if (!formData.features || formData.features.split('\n').length < 3) {
      newErrors.features = "Add at least 3 key features";
    }

    if (!formData.category) {
      newErrors.category = 'Category is required';
    }

    if (!formData.price || isNaN(formData.price) || parseFloat(formData.price) <= 0) {
      newErrors.price = 'Enter a valid price';
    }

    if (!formData.stock || parseInt(formData.stock) < 0) {
      newErrors.stock = 'Enter valid stock quantity';
    }

    if (requiredImages.some(img => img === null)) {
      newErrors.images = 'At least 3 images are required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const confirmUpload = async () => {
    try {
      if (!validate() || !currentUser) return;

      setIsUploading(true);

      const uploadedUrls = [];

      for (let i = 0; i < formData.images.length; i++) {
        const file = formData.images[i];
        if (!file) continue;

        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${uuidv4()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        uploadedUrls.push(data.publicUrl);
      }

      const fullDescription = `
${formData.overview}

Key Features:
${formData.features}

Specifications:
${formData.specs}
`;

      const productData = {
        description: fullDescription.trim(),
        seller_id: currentUser.id,
        name: formData.name.trim(),
        category: formData.category,
        price: parseFloat(formData.price),
        stock_quantity: parseInt(formData.stock),
        is_approved: true, // default approved
        images: uploadedUrls,
        pickup_locations: formData.pickupLocations, // save pickup locations
      };

      await productService.createProduct(productData);

      alert("Product uploaded");
      navigate("/seller/products");
    } catch (err) {
      console.error(err);
      alert("Upload failed");
    } finally {
      setIsUploading(false);
    }
  };

  const handlePreview = () => {
    if (!validate()) return;

    setPreviewData(formData);
    setShowPreview(true);
  };

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">
      <Navbar />

      <div className="flex-1 px-4 py-6 max-w-4xl mx-auto w-full">
        <button
          onClick={() => navigate('/seller/products')}
          className="flex items-center gap-2 text-blue-700 hover:text-blue-900 mb-6 font-semibold transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          Back to Products
        </button>

        <div className="bg-white rounded-lg border border-blue-200 shadow-sm p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-blue-900 mb-2">Add New Product</h1>
            <p className="text-sm text-blue-600">Fill in the details below to list your product on the marketplace.</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Product Name <span className="text-orange-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                placeholder="e.g., Wireless Headphones"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.name ? 'border-orange-500' : 'border-blue-200'
                  }`}
              />
              {errors.name && <p className="text-sm text-orange-600 mt-1">{errors.name}</p>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <label className="block text-sm font-semibold text-blue-900 mb-2">
                  Category <span className="text-orange-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={showCategoryDropdown ? categorySearch : formData.category}
                    onChange={(e) => {
                      setCategorySearch(e.target.value);
                      setShowCategoryDropdown(true);
                    }}
                    onFocus={() => setShowCategoryDropdown(true)}
                    placeholder="Search categories..."
                    className="w-full px-4 py-2 pr-10 border border-blue-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-blue-400" />
                </div>

                {showCategoryDropdown && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-blue-200 rounded-lg shadow-lg max-h-60 overflow-auto">
                    {filteredCategories.length > 0 ? (
                      filteredCategories.map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({ ...prev, category: cat }));
                            setCategorySearch('');
                            setShowCategoryDropdown(false);
                          }}
                          className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors text-sm text-blue-900"
                        >
                          {cat}
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-sm text-blue-600">No categories found</div>
                    )}
                  </div>
                )}
                {errors.category && <p className="text-sm text-orange-600 mt-1">{errors.category}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-blue-900 mb-2">
                  Price (₦) <span className="text-orange-500">*</span>
                </label>
                <input
                  type="text"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  placeholder="e.g., 15000 or ₦15,000"
                  className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.price ? 'border-orange-500' : 'border-blue-200'
                    }`}
                />
                {errors.price && <p className="text-sm text-orange-600 mt-1">{errors.price}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Stock Quantity <span className="text-orange-500">*</span>
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                placeholder="e.g., 50"
                min="0"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 ${errors.stock ? 'border-orange-500' : 'border-blue-200'
                  }`}
              />
              {errors.stock && <p className="text-sm text-orange-600 mt-1">{errors.stock}</p>}
            </div>

            {/* Pickup Locations Section */}
            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Pickup Locations (Optional)
              </label>
              <p className="text-sm text-blue-600 mb-2">
                Add locations where buyers can pick up this item (e.g., malls, landmarks). Leave empty if not offering pickup.
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g., Ikeja City Mall"
                  className="flex-1 px-4 py-2 border border-blue-200 rounded-lg"
                />
                <button
                  type="button"
                  onClick={addPickupLocation}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
                >
                  <Plus size={18} /> Add
                </button>
              </div>
              <div className="space-y-2">
                {formData.pickupLocations.map((loc, index) => (
                  <div key={index} className="flex items-center gap-2 bg-blue-50 p-2 rounded">
                    <span className="flex-1">{loc}</span>
                    <button
                      type="button"
                      onClick={() => removePickupLocation(index)}
                      className="text-red-600 hover:text-red-800"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Product Images <span className="text-orange-500">*</span>
              </label>
              <div className="space-y-4">
                <p className="text-sm text-blue-600">
                  Upload at least 3 images. First image will be the main display.
                </p>

                {formData.images.map((img, index) => (
                  <div key={index}>
                    <label className="block text-sm font-semibold text-blue-900 mb-1">
                      {index === 0
                        ? "Main Image (Required)"
                        : index < 3
                          ? `Image ${index + 1} (Required)`
                          : `Image ${index + 1} (Optional)`}
                    </label>

                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange(index, e.target.files[0])}
                    />
                    {img && (
                      <img
                        src={URL.createObjectURL(img)}
                        alt="preview"
                        className="w-full max-h-[500px] object-contain rounded-lg border bg-white mt-2"
                      />
                    )}
                  </div>
                ))}
                {errors.images && <p className="text-sm text-orange-600 mt-1">{errors.images}</p>}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Product Description <span className="text-orange-500">*</span>
              </label>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-2">
                    Product Overview *
                  </label>
                  <textarea
                    name="overview"
                    value={formData.overview}
                    onChange={handleChange}
                    placeholder="Clearly explain what this product is..."
                    rows="3"
                    className="w-full px-4 py-2 border border-blue-200 rounded-lg"
                  />
                  {errors.overview && <p className="text-sm text-orange-600 mt-1">{errors.overview}</p>}
                  <p className="text-xs text-blue-600 mt-1">{formData.overview.length} characters</p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-2">
                    Key Features * (List at least 3)
                  </label>
                  <textarea
                    name="features"
                    value={formData.features}
                    onChange={handleChange}
                    placeholder={`• Feature 1\n• Feature 2\n• Feature 3`}
                    rows="4"
                    className="w-full px-4 py-2 border border-blue-200 rounded-lg"
                  />
                  {errors.features && <p className="text-sm text-orange-600 mt-1">{errors.features}</p>}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-blue-900 mb-2">
                    Specifications (Optional)
                  </label>
                  <textarea
                    name="specs"
                    value={formData.specs}
                    onChange={handleChange}
                    placeholder="Size, weight, material, compatibility..."
                    rows="3"
                    className="w-full px-4 py-2 border border-blue-200 rounded-lg"
                  />
                </div>
              </div>
            </div>

            {showPreview && (
              <ProductPreviewModal
                previewData={previewData}
                onClose={() => setShowPreview(false)}
                onConfirm={confirmUpload}
                isUploading={isUploading}
              />
            )}

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => navigate('/seller/products')}
                disabled={isUploading}
                className="px-6 py-3 border-2 border-blue-300 text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePreview}
                disabled={isUploading}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Preview Product'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}