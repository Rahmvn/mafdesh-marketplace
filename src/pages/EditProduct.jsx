import React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Upload, AlertCircle } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';
import { PRODUCT_CATEGORIES } from '../utils/categories';
import { supabase } from '../supabaseClient';
import ProductForm from '../components/ProductForm';

export default function EditProduct() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [currentUser, setCurrentUser] = useState(null);
  const [product, setProduct] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

const [formData, setFormData] = useState({
  name: '',
  category: '',
  price: '',
  stock: '',
  overview: '',
  features: '',
  specs: '',
  images: [null, null, null, null, null],
});

  const [errors, setErrors] = useState({});
  const [isUploading, setIsUploading] = useState(false);

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
      setProduct(data);
      setFormData(prev => ({
        ...prev,
        name: data.name || '',
        category: data.category || PRODUCT_CATEGORIES[0],
        price: String(data.price) ?? '',
        stock: String(data.stock_quantity) ?? '',
        
        imagePreview: data.image_url || null
      }));
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
  images: data.images || [null, null, null, null, null]
});
    } catch (error) {
      console.error('Error loading product:', error);
      alert('Failed to load product');
      navigate('/seller/products');
    } finally {
      setIsLoading(false);
    }
  };

 const handleImageChange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  if (file.size > 3 * 1024 * 1024) {
    alert('Image must be less than 3MB');
    return;
  }

  setFormData(prev => ({
    ...prev,
    imageFile: file
  }));
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
    let imageUrls = product.images || []; // keep old images by default

    if (formData.imageFile) {
      const fileExt = formData.imageFile.name.split('.').pop();
      const fileName = `${currentUser.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, formData.imageFile);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      imageUrl = data.publicUrl;
    }

    const fullDescription = `
${formData.overview}

Key Features:
${formData.features}

Specifications:
${formData.specs}
`;

    await productService.updateProduct(id, {
      name: formData.name.trim(),
      category: formData.category,
      price: parseFloat(formData.price),
      stock_quantity: parseInt(formData.stock),
      description: fullDescription.trim(),
      images: imageUrls
    });

    alert('Product updated successfully!');
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

      <div className="max-w-2xl mx-auto px-4 py-8">
        <button
          onClick={() => navigate('/seller/products')}
          className="flex items-center gap-2 text-blue-600 hover:text-blue-700 mb-6"
        >
          <ArrowLeft size={20} />
          Back to Products
        </button>

        <div className="bg-white rounded-lg shadow-md p-6">
          <h1 className="text-3xl font-bold mb-6">Edit Product</h1>

          <ProductForm
  formData={formData}
  setFormData={setFormData}
  errors={errors}
  handleChange={handleChange}
  handleImageChange={(index, file) => {
    const updated = [...formData.images];
    updated[index] = file;
    setFormData(prev => ({ ...prev, images: updated }));
  }}
  onSubmit={handleSubmit}
  submitLabel="Update Product"
  isLoading={isUploading}
/>
        </div>
      </div>

      <Footer />
    </div>
  );
}
