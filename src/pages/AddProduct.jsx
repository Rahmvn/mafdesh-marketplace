import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, AlertCircle, Search } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { PRODUCT_CATEGORIES } from '../utils/categories';

export default function AddProduct() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(null);

  const [formData, setFormData] = useState({
  name: '',
  category: PRODUCT_CATEGORIES[0],
  price: '',
  stock: '',
  description: '',
  imageFile: null,
  imagePreview: null
});


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

  const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    alert("Image must be less than 5MB");
    return;
  }

  const img = new Image();
  img.src = URL.createObjectURL(file);

  img.onload = () => {
    if (img.width < 800) {
      alert("Image must be at least 800px wide.");
      return;
    }

    setFormData(prev => ({
      ...prev,
      imageFile: file,
      imagePreview: img.src
    }));
  };
};


  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) newErrors.name = 'Product name is required';
    if (!formData.price.trim()) newErrors.price = 'Price is required';
    if (!formData.stock.trim()) newErrors.stock = 'Stock quantity is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    if (!formData.imageFile) newErrors.image = 'Product image is required';


    if (formData.price && isNaN(parseFloat(formData.price.replace(/[₦,]/g, '')))) {
      newErrors.price = 'Please enter a valid price';
    }

    if (formData.stock && (isNaN(parseInt(formData.stock)) || parseInt(formData.stock) < 0)) {
      newErrors.stock = 'Please enter a valid stock quantity';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleUpload = async () => {
    if (!validate() || !currentUser) return;

    setIsUploading(true);

    try {
      const priceValue = parseFloat(formData.price.replace(/[₦,]/g, '').trim());

      const productData = {
  name: formData.name.trim(),
  category: formData.category,
  price: priceValue,
  stock: parseInt(formData.stock),
  description: formData.description.trim(),
  image: formData.imagePreview
};


      await productService.createProduct(productData);

      alert('Product uploaded successfully! It is now live on the marketplace.');
      navigate('/seller/products');

    } catch (error) {
      console.error(error);
      alert('Failed to upload product: ' + error.message);
    } finally {
      setIsUploading(false);
    }
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

            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Product Image <span className="text-orange-500">*</span>
              </label>
              <input type="file"  
              accept="image/*"
              onChange={ handleImageChange }
               />
            </div>

            <div>
              <label className="block text-sm font-semibold text-blue-900 mb-2">
                Product Description <span className="text-orange-500">*</span>
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                placeholder="Describe your product in detail..."
                rows="4"
                className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none ${errors.description ? 'border-orange-500' : 'border-blue-200'
                  }`}
              />
              {errors.description && <p className="text-sm text-orange-600 mt-1">{errors.description}</p>}
              <p className="text-xs text-blue-600 mt-1">{formData.description.length} characters</p>
            </div>

            <div className="flex gap-4 pt-4">
              <button
                onClick={() => navigate('/seller/products')}
                disabled={isUploading}
                className="px-6 py-3 border-2 border-blue-300 text-blue-700 font-semibold rounded-lg hover:bg-blue-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="flex-1 px-6 py-3 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-lg transition-colors shadow-md disabled:opacity-50"
              >
                {isUploading ? 'Uploading...' : 'Upload Product'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
