import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { supabase } from "../supabaseClient";
import { productService } from "../services/productService";

export default function SellerDashboard() {

const navigate = useNavigate();

const [currentUser, setCurrentUser] = useState(null);
const [products, setProducts] = useState([]);
const [orders, setOrders] = useState([]);

const [loading, setLoading] = useState(true);

const [stats, setStats] = useState({
pending: 0,
shipped: 0,
completed: 0,
products: 0
});

const handleLogout = async () => {

    if (window.confirm('Are you sure you want to logout?')) {

      await supabase.auth.signOut();   // kill Supabase session

      localStorage.clear();            // clear your local data

      window.location.href = '/login'; // hard redirect (no React tricks)

    };

  };

useEffect(() => {
init();
}, []);

const init = async () => {

const { data } = await supabase.auth.getSession();

if (!data.session) {
navigate("/login");
return;
}

const user = data.session.user;

const { data: userData } = await supabase
.from("users")
.select("*")
.eq("id", user.id)
.single();

if (!userData || userData.role !== "seller") {
navigate("/login");
return;
}

setCurrentUser(userData);

loadDashboardData(userData.id);

};

const loadDashboardData = async (sellerId) => {

try {

setLoading(true);

 

/* PRODUCTS */

const sellerProducts =
await productService.getSellerProducts(sellerId);

setProducts(sellerProducts);

/* ORDERS */

const { data: sellerOrders } = await supabase
.from("orders")
.select(`
id,
status,
created_at,
products:products!orders_product_id_fkey (
name,
images
)
`)
.eq("seller_id", sellerId)
.order("created_at", { ascending: false });

setOrders(sellerOrders || []);

/* STATS */

setStats({
pending: sellerOrders?.filter(o => o.status === "PAID_ESCROW").length || 0,
shipped: sellerOrders?.filter(o => o.status === "SHIPPED").length || 0,
completed: sellerOrders?.filter(o => o.status === "COMPLETED").length || 0,
products: sellerProducts.length
});

} catch (error) {

console.error("Dashboard error:", error);

} finally {

setLoading(false);

}

};

if (loading) {
return (
<div className="min-h-screen flex items-center justify-center">
Loading dashboard...
</div>
);
}

return (

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar onLogout={handleLogout} />

<main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

{/* HEADER */}

<div className="flex items-center justify-between mb-8">

<div>

<h1 className="text-3xl font-bold text-blue-900">
{currentUser?.business_name || currentUser?.full_name}
</h1>

<p className="text-sm text-gray-500">
Seller Dashboard
</p>

</div>

{/* <button
onClick={() => navigate("/seller/products/new")}
className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-lg flex items-center gap-2"
>

<Plus className="w-5 h-5" />
Add Product

</button> */}

</div>

{/* STATS */}

<div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">

<div className="bg-white p-4 rounded-lg border">

<p className="text-sm text-gray-500">
Orders To Ship
</p>

<p className="text-3xl font-bold text-orange-600">
{stats.pending}
</p>

</div>

<div className="bg-white p-4 rounded-lg border">

<p className="text-sm text-gray-500">
Orders in transit 
</p>


<p className="text-3xl font-bold text-blue-600">
{stats.shipped}
</p>
<p className="text-sm text-gray-500 mt-1">
  Awaiting buyer confirmation 
</p>

</div>

<div className="bg-white p-4 rounded-lg border">

<p className="text-sm text-gray-500">
Completed Orders
</p>

<p className="text-3xl font-bold text-green-600">
{stats.completed}
</p>

</div>

<div className="bg-white p-4 rounded-lg border">

<p className="text-sm text-gray-500">
Products
</p>

<p className="text-3xl font-bold text-blue-900">
{stats.products}
</p>

</div>

</div>

{/* RECENT ORDERS */}

<div className="bg-white rounded-lg border mb-8">

<div className="p-4 border-b flex justify-between">

<h2 className="font-bold text-blue-900">
Recent Orders
</h2>

<button
onClick={() => navigate("/seller/orders")}
className="text-sm text-orange-600"
>

View All

</button>

</div>

{orders.length === 0 ? (

<div className="p-6 text-center text-gray-500">
No orders yet
</div>

) : (

orders.slice(0,5).map(order => (

<div
key={order.id}
className="p-4 border-b flex items-center justify-between"
>

<div className="flex items-center gap-3">

<img
src={order.products?.images?.[0] || "https://placehold.co/100"}
className="w-12 h-12 object-cover rounded"
/>

<div>

<p className="font-semibold">
{order.products?.name}
</p>

<p className="text-xs text-gray-500">
{new Date(order.created_at).toLocaleDateString()}
</p>

</div>

</div>

<div className="flex items-center gap-3">

<span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
{order.status}
</span>

<button
onClick={() => navigate(`/seller/orders/${order.id}`)}
className="text-sm text-blue-600"
>

View

</button>

</div>

</div>

))

)}

</div>

{/* PRODUCTS */}

<div className="bg-white rounded-lg border">

<div className="p-4 border-b flex justify-between">

<h2 className="font-bold text-blue-900">
Products
</h2>

<button
onClick={() => navigate("/seller/products")}
className="text-sm text-orange-600"
>

Manage

</button>

</div>

{products.length === 0 ? (

<div className="p-6 text-center text-gray-500">
No products yet
</div>

) : (

products.slice(0,5).map(product => (

<div
key={product.id}
className="p-4 border-b flex justify-between items-center"
>

<div className="flex gap-3 items-center">

<img
src={product.images?.[0] || "https://placehold.co/100"}
className="w-12 h-12 object-cover rounded"
/>

<p className="font-semibold">
{product.name}
</p>

</div>

<p className="text-orange-600 font-semibold">
₦{Number(product.price).toLocaleString()}
</p>

</div>

))

)}

</div>

</main>

<Footer />

</div>

);

}