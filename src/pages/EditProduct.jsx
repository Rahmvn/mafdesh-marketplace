import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, X } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';

export default function EditProduct() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [errors, setErrors] = useState({});

  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    stock: '',
    overview: '',
    features: '',
    specs: '',
    images: [],
    pickupLocations: [],
    imageFiles: [null, null, null, null, null],
  });

  const [newLocation, setNewLocation] = useState('');

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
        alert('Access denied. Only sellers can edit products.');
        navigate('/login');
        return;
      }
      setCurrentUser(userData);
      loadProduct();
    };
    checkAuth();
  }, [navigate, id]);

  const loadProduct = async () => {
    try {
      const data = await productService.getProductById(id);
      const parts = data.description?.split("Key Features:") || [];
      const overview = parts[0]?.trim() || "";
      const rest = parts[1]?.split("Specifications:") || [];
      const features = rest[0]?.trim() || "";
      const specs = rest[1]?.trim() || "";

      setFormData({
        name: data.name || "",
        category: data.category || "",
        price: String(data.price) || "",
        stock: String(data.stock_quantity) || "",
        overview,
        features,
        specs,
        images: data.images || [],
        pickupLocations: data.pickup_locations || [],
        imageFiles: [null, null, null, null, null],
      });
    } catch (error) {
      console.error('Error loading product:', error);
      alert('Failed to load product');
      navigate('/seller/products');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageChange = (index, file) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      alert('Image must be less than 3MB');
      return;
    }
    const updatedFiles = [...formData.imageFiles];
    updatedFiles[index] = file;
    setFormData(prev => ({ ...prev, imageFiles: updatedFiles }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors(prev => ({ ...prev, [name]: '' }));
  };

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
    if (!formData.name.trim()) newErrors.name = "Required";
    if (!formData.price) newErrors.price = "Required";
    if (!formData.stock) newErrors.stock = "Required";
    if (!formData.overview.trim()) newErrors.overview = "Required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsUploading(true);
    try {
      let imageUrls = [...formData.images]; // existing images

      // Upload new images
      for (let i = 0; i < formData.imageFiles.length; i++) {
        const file = formData.imageFiles[i];
        if (!file) continue;

        const fileExt = file.name.split('.').pop();
        const fileName = `${currentUser.id}/${Date.now()}-${i}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('product-images')
          .upload(fileName, file);
        if (uploadError) throw uploadError;

        const { data } = supabase.storage
          .from('product-images')
          .getPublicUrl(fileName);

        if (i < imageUrls.length) {
          imageUrls[i] = data.publicUrl;
        } else {
          imageUrls.push(data.publicUrl);
        }
      }

      const fullDescription = `
${formData.overview}

Key Features:
${formData.features}

Specifications:
${formData.specs}
`;

      // Update product – set is_approved to false to require admin re‑approval
await productService.updateProduct(id, {
  name: formData.name.trim(),
  category: formData.category,
  price: parseFloat(formData.price),
  stock_quantity: parseInt(formData.stock),
  description: fullDescription.trim(),
  images: imageUrls,
  pickup_locations: formData.pickupLocations,
  is_approved: false,
  updated_at: new Date().toISOString(), // add this line
});

      alert('Product updated successfully! It is now pending admin approval and will be hidden until approved.');
      navigate('/seller/products');
    } catch (error) {
      console.error(error);
      alert('Update failed');
    } finally {
      setIsUploading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex justify-center items-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/seller/products')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft size={20} />
          Back to Products
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold mb-6">Edit Product</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Product Name */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={`w-full px-4 py-2 border rounded-lg ${errors.name ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.name && <p className="text-sm text-red-600 mt-1">{errors.name}</p>}
            </div>

            {/* Category and Price */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Category <span className="text-red-500">*</span>
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="">Select a category</option>
                  {PRODUCT_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                {errors.category && <p className="text-sm text-red-600 mt-1">{errors.category}</p>}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Price (₦) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="price"
                  value={formData.price}
                  onChange={handleChange}
                  className={`w-full px-4 py-2 border rounded-lg ${errors.price ? 'border-red-500' : 'border-gray-300'}`}
                />
                {errors.price && <p className="text-sm text-red-600 mt-1">{errors.price}</p>}
              </div>
            </div>

            {/* Stock */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Stock Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                name="stock"
                value={formData.stock}
                onChange={handleChange}
                min="0"
                className={`w-full px-4 py-2 border rounded-lg ${errors.stock ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.stock && <p className="text-sm text-red-600 mt-1">{errors.stock}</p>}
            </div>

            {/* Pickup Locations */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Pickup Locations (Optional)
              </label>
              <p className="text-sm text-gray-600 mb-2">
                Edit pickup locations where buyers can collect the item.
              </p>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="e.g., Ikeja City Mall"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
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

            {/* Images */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Images
              </label>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {formData.images.map((url, index) => (
                  <div key={index} className="border rounded p-2">
                    {url && (
                      <img src={url} alt={`Product ${index + 1}`} className="w-full h-24 object-contain mb-2" />
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleImageChange(index, e.target.files[0])}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Description fields */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Product Overview <span className="text-red-500">*</span>
              </label>
              <textarea
                name="overview"
                value={formData.overview}
                onChange={handleChange}
                rows="4"
                className={`w-full px-4 py-2 border rounded-lg ${errors.overview ? 'border-red-500' : 'border-gray-300'}`}
              />
              {errors.overview && <p className="text-sm text-red-600 mt-1">{errors.overview}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Key Features
              </label>
              <textarea
                name="features"
                value={formData.features}
                onChange={handleChange}
                rows="4"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Specifications (Optional)
              </label>
              <textarea
                name="specs"
                value={formData.specs}
                onChange={handleChange}
                rows="3"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Submit button */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => navigate('/seller/products')}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg disabled:opacity-50"
              >
                {isUploading ? 'Saving...' : 'Update Product'}
              </button>
            </div>
          </form>
        </div>
      </div>
      <Footer />
    </div>
  );
}