import React from 'react';

import { useState, useEffect } from 'react';

import { useNavigate, useSearchParams } from 'react-router-dom';

import { Filter, ArrowUp } from 'lucide-react';

import Navbar from '../components/Navbar';

import Footer from '../components/Footer';

import { useLocation } from 'react-router-dom';

import { PRODUCT_CATEGORIES } from '../utils/categories';

import { productService } from '../services/productService';

import { supabase } from '../supabaseClient';

// import { ShoppingCart, Plus } from 'lucide-react';





export default function BuyerDashboard() {







  const navigate = useNavigate();

  const location = useLocation();

  const searchQuery = new

    URLSearchParams(location.search).get('search') || '';

  const [showScrollTop, setShowScrollTop] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('All');

  const [sortBy, setSortBy] = useState('default');

  const [products, setProducts] = useState([]);

  const [isLoading, setIsLoading] = useState(true);

  const [categorySearch, setCategorySearch] = useState('');



  const availableCategories = ['All', ...PRODUCT_CATEGORIES];

  // const filteredAvailableCategories = availableCategories.filter(cat =>

  //   cat.toLowerCase().includes(categorySearch.toLowerCase())

  // );



  useEffect(() => {

    loadProducts();

  }, []);



  const loadProducts = async () => {

    try {

      setIsLoading(true);



      const data = await productService.getAllProducts();

      console.log("GET ALL PRODUCTS RETURN:", data);



      setProducts(data);

    } catch (error) {

      console.error('Error loading products:', error);

    } finally {

      setIsLoading(false);

    }

  };











  const filteredProducts = products.filter(p =>

    p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||

    p.description?.toLowerCase().includes(searchQuery.toLowerCase())

  );







  const productsByCategory = PRODUCT_CATEGORIES.reduce((acc, cat) => {

    acc[cat] = filteredProducts.filter(p => p.category === cat);

    return acc;

  }, { 'All': filteredProducts });



  const displaySections = selectedCategory === 'All'

    ? PRODUCT_CATEGORIES.map(cat => ({

      title: cat,

      products: productsByCategory[cat]

    })).filter(section => section.products.length > 0)

    : [{ title: selectedCategory, products: productsByCategory[selectedCategory] || [] }];





  const scrollToTop = () => {

    window.scrollTo({ top: 0, behavior: 'smooth' });

  };

  const handleLogout = async () => {

    if (window.confirm('Are you sure you want to logout?')) {

      await supabase.auth.signOut();   // kill Supabase session

      localStorage.clear();            // clear your local data

      window.location.href = '/login'; // hard redirect (no React tricks)

    };

  };







  useEffect(() => {

    const handleScroll = () => {

      setShowScrollTop(window.scrollY > 300);

    };



    window.addEventListener('scroll', handleScroll);

    return () => window.removeEventListener('scroll', handleScroll);

  }, []);



  const ProductCard = ({ product }) => (

    <div

      key={product.id}

      onClick={() => navigate(`/product/${product.id}`)}

      className="min-w-[170px] md:min-w-[190px] bg-white rounded-lg overflow-hidden flex-shrink-0 cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-lg shadow-md  border border-blue-100 hover:border-orange-400 "

    >

      <div className="relative bg-white flex items-center justify-center h-36 sm:h-40 md:h-44 lg:h-48 overflow-hidden">

        <img

          src={product.images?.[0] || 'https://placehold.co/600x600'}

          alt={product.name}

          className="max-h-[85%] max-w-[85%] object-contain transition-transform duration-200 group-hover:scale-105"

        />





        {product.stock_quantity > 0 && (

          <div className="absolute top-2 left-2">

            <span className="bg-orange-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">

              {product.stock_quantity} left

            </span>

          </div>

        )}



      </div>



      {/* <div className="absolute top-3 right-3">

  <button

    onClick={(e) => {

      e.stopPropagation();

      handleQuickAdd(product);

    }}

    className="bg-white hover:bg-orange-500 hover:text-white text-blue-900 p-2 rounded-full shadow-md transition-all duration-200"

  >

    <ShoppingCart size={16} />

  </button>

</div> */}



      <div className="p-2.5">

        <h3 className="text-blue-900 font-semibold text-sm line-clamp-min-h-[40px]">

          {product.name}

        </h3>



        <div className="flex items-center justify-between">

          <p className="text-orange-600 font-bold text-lg mt-1">₦{Number(product.price).toLocaleString()}</p>

          <button className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-md font-medium text-xs transition-colors duration-200">

            View

          </button>

        </div>

      </div>

    </div>

  );



  return (

    <div className="flex flex-col min-h-screen bg-gradient-to-br from-blue-50 via-white to-orange-50 ">

      <Navbar onLogout={handleLogout} />



      <main className="flex-1 w-full py-8 px-4 max-w-7xl mx-auto">



        {/* <div className="text-center mb-4 ">

          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-900 via-blue-700 to-orange-600 bg-clip-text text-transparent mb-1">

            Discover Amazing Products

          </h1>

          <p className="text-blue-800 text-sm">Handpicked quality from trusted sellers</p>

        </div> */}



        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4 bg-white p-3 rounded-lg shadow-sm border border-blue-100">

          <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto scrollbar-hide">

            {availableCategories.map((category) => (

              <button

                key={category}

                onClick={() => setSelectedCategory(category)}

                className={`px-4 py-1.5 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${selectedCategory === category

                    ? 'bg-orange-600 text-white'

                    : 'bg-blue-50 text-blue-700 hover:bg-blue-100'

                  }`}

              >

                {category}

              </button>

            ))}

          </div>



          <div className="flex items-center gap-2 w-full sm:w-auto">

            <Filter size={18} className="text-blue-700" />

            <select

              value={sortBy}

              onChange={(e) => setSortBy(e.target.value)}

              className="px-4 py-2 rounded-lg border-2 border-blue-200 bg-white text-blue-900 text-sm font-semibold focus:outline-none focus:border-orange-500 cursor-pointer hover:border-blue-300 transition-colors"

            >

              <option value="default">Sort by</option>

              <option value="price-low">Price: Low to High</option>

              <option value="price-high">Price: High to Low</option>

              <option value="newest">Newest First</option>

            </select>

          </div>

        </div>



        {isLoading ? (

          <div className="text-center py-20">

            {/* <p className="text-blue-800 text-lg">Loading products...</p> */}

          </div>

        ) : (

          <div>

            {displaySections.length === 0 ? (

              <div className="text-center py-20">

                <p className="text-blue-800 text-lg">No products found{searchQuery ? ` matching "${searchQuery}"` : ''}</p>

              </div>

            ) : (

              displaySections.map((section) => (

                <div key={section.title} className="mb-14">

                  <div className="flex items-center gap-2 mb-3">

                    <h2 className="text-xl font-bold text-blue-900">{section.title}</h2>

                    <div className="h-0.5 flex-1 bg-gradient-to-r from-orange-500 to-transparent"></div>

                    <span className="text-blue-600 text-xs font-medium">{section.products.length} items</span>

                  </div>



                  <div className="flex overflow-x-auto gap-1.5 py-2 scroll-smooth">

                    {section.products.map((product) => (

                      <ProductCard key={product.id} product={product} />

                    ))}

                  </div>

                </div>

              ))

            )}

          </div>

        )}



      </main>



      {showScrollTop && (

        <button

          onClick={scrollToTop}

          className="fixed bottom-8 right-8 bg-orange-600 hover:bg-orange-700 text-white p-3 rounded-full shadow-2xl transition-all duration-300 hover:scale-110 z-50"

          aria-label="Scroll to top"

        >

          <ArrowUp size={24} />

        </button>

      )}



      <Footer />

    </div>

  );

}