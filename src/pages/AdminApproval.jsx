import { useEffect, useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { productService } from '../services/productService';

export default function AdminApprovals() {
  const [products, setProducts] = useState([]);

  const loadPending = async () => {
    const data = await productService.getAllProductsAdmin();
    setProducts(data.filter(p => !p.is_approved));
  };

  useEffect(() => {
    loadPending();
  }, []);

  const approve = async (id) => {
    await productService.toggleApproval(id, true);
    loadPending();
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
        <h1 className="text-2xl font-bold mb-6">Pending Approvals</h1>

        {products.length === 0 ? (
          <p>No pending products.</p>
        ) : (
          products.map(p => (
            <div key={p.id} className="border p-4 mb-4 rounded">
              <p className="font-semibold">{p.name}</p>
              <button
                onClick={() => approve(p.id)}
                className="mt-2 px-4 py-2 bg-blue-600 text-white rounded"
              >
                Approve
              </button>
            </div>
          ))
        )}
      </div>
      <Footer />
    </div>
  );
}