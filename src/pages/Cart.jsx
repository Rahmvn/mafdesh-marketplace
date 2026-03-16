import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";

export default function Cart() {

  const navigate = useNavigate();

  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cartId, setCartId] = useState(null);
  const [stockIssues, setStockIssues] = useState([]);

  useEffect(() => {
    loadCart();
  }, []);

  const loadCart = async () => {

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session) {
      navigate("/login");
      return;
    }

    const userId = sessionData.session.user.id;

    /* get cart */

    const { data: cart } = await supabase
      .from("carts")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

  if (!cart) {
  const { data: newCart } = await supabase
    .from("carts")
    .insert({
      user_id: userId
    })
    .select()
    .single();

  setCartId(newCart.id);
  setCartItems([]);
  setLoading(false);
  return;

}
setCartId(cart.id);
   

/* get cart items */

    const { data, error } = await supabase
      .from("cart_items")
      .select(`
        *,
        products (
          id,
          name,
          price,
          images,
          stock_quantity,
          seller_id
        )
      `)
      .eq("cart_id", cart.id);

    if (error) {
      console.error(error);
    } else {
      setCartItems(data);
    }

    setLoading(false);
  };

  const removeItem = async (id) => {

    const confirm = window.confirm("Remove item from cart?");
    if (!confirm) return;

    await supabase
      .from("cart_items")
      .delete()
      .eq("id", id);

    loadCart();
  };

const updateQuantity = async (item, change) => {

  const newQty = item.quantity + change;

  if (newQty < 1) return;

  if (newQty > item.products.stock_quantity) {
    alert("Only " + item.products.stock_quantity + " items available");
    return;
  }

  await supabase
    .from("cart_items")
    .update({ quantity: newQty })
    .eq("id", item.id);

  loadCart();

  window.dispatchEvent(new Event("cartUpdated"));
};


const checkCartStock = async () => {
  const issues = [];
  for (const item of cartItems) {
    const { data, error } = await supabase
      .from('products')
      .select('stock_quantity')
      .eq('id', item.products.id)
      .single();

    if (data && data.stock_quantity < item.quantity) {
      issues.push({
        name: item.products.name,
        available: data.stock_quantity,
        requested: item.quantity
      });
    }
  }
  setStockIssues(issues);
};

useEffect(() => {
  if (cartItems.length) {
    checkCartStock();
  }
}, [cartItems]);

  const getTotal = () => {

    let total = 0;

    cartItems.forEach(item => {
      total += item.products.price * item.quantity;
    });

    return total;
  };

 const checkout = () => {
  if (cartItems.length === 0) {
    alert("Cart is empty");
    return;
  }
  alert("Multi‑item checkout coming soon! For now, please buy items individually.");
};

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading cart...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-blue-50">

      <Navbar />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

        <h1 className="text-2xl font-bold text-blue-900 mb-6">
          Shopping Cart
        </h1>

        {cartItems.length === 0 ? (

          <div className="bg-white p-8 rounded-xl border text-center">
            <p>Your cart is empty.</p>
          </div>

        ) : (

          <div className="space-y-6">

            {cartItems.map(item => (

              <div
                key={item.id}
                className="bg-white p-4 rounded-xl border flex gap-4"
              >

                <img
                  src={item.products?.images?.[0]}
                  alt={item.products?.name}
                  className="w-24 h-24 object-contain border rounded"
                />

                <div className="flex-1">

                  <p className="font-semibold text-blue-900">
                    {item.products?.name}
                  </p>

                  <p className="text-orange-600 font-bold">
                    ₦{Number(item.products?.price).toLocaleString()}
                  </p>

                  <div className="flex items-center gap-3 mt-3">

                    <button
                      onClick={() => updateQuantity(item, -1)}
                      className="px-3 py-1 bg-gray-200 rounded"
                    >
                      -
                    </button>

                    <span>{item.quantity}</span>

                   <button
  disabled={item.quantity >= item.products.stock_quantity}
  onClick={() => updateQuantity(item, 1)}
>
                      +
                    </button>

                  </div>

                </div>

                <button
                  onClick={() => removeItem(item.id)}
                  className="text-red-500"
                >
                  Remove
                </button>

              </div>

            ))}

            <div className="bg-white p-6 rounded-xl border">

              <p className="text-lg font-bold">
                Total: ₦{getTotal().toLocaleString()}
              </p>
  {stockIssues.length > 0 && (
  <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
    <p className="text-red-700 font-semibold mb-2">Some items have stock issues:</p>
    {stockIssues.map((issue, idx) => (
      <p key={idx} className="text-sm text-red-600">
        • {issue.name}: only {issue.available} available, you have {issue.requested}
      </p>
    ))}
  </div>
)}
             <button
  onClick={checkout}
  disabled={cartItems.length === 0 || stockIssues.length > 0}
  className="mt-4 w-full bg-orange-600 text-white py-3 rounded-lg disabled:opacity-50"
>
  Proceed to Checkout
</button>

            </div>

          </div>

        )}

      </main>

      <Footer />

    </div>
  );
}