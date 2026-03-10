import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { Package, Users, ShoppingCart, DollarSign, AlertCircle, Shield } from "lucide-react";

export default function AdminDashboard() {

const navigate = useNavigate();

const [stats, setStats] = useState({
totalOrders:0,
totalProducts:0,
totalSellers:0,
totalBuyers:0,
totalSales:0,
platformFees:0,
escrowMoney:0,
pendingPayouts:0,
disputes:0
});

const [recentOrders,setRecentOrders] = useState([]);
const [loading,setLoading] = useState(true);

useEffect(()=>{
checkAuth();
loadDashboard();
},[]);

const checkAuth = async ()=>{

const storedUser = localStorage.getItem("mafdesh_user");

if(!storedUser){
navigate("/login");
return;
}

const user = JSON.parse(storedUser);

if(user.role !== "admin"){
navigate("/login");
}

};

const loadDashboard = async ()=>{

try{

/* orders */

const { data: orders, error: ordersError } = await supabase
.from("orders")
.select(`
  id,
  status,
  total_amount,
  created_at,
  products:products!orders_product_id_fkey (
    name
  )
`)
.order("created_at", { ascending: false })
.limit(5);

if (ordersError) {
  console.error("Recent orders error:", ordersError);
}
const totalOrders = orders?.length || 0;

/* sales */

let totalSales = 0;
let platformFees = 0;
let escrowMoney = 0;

orders?.forEach(o=>{

totalSales += Number(o.total_amount || 0);
platformFees += Number(o.platform_fee || 0);

if(["PAID_ESCROW","SHIPPED"].includes(o.status)){
escrowMoney += Number(o.total_amount || 0);
}

});

/* products */

const {count:productsCount} = await supabase
.from("products")
.select("*",{count:"exact",head:true});

/* users */

const {data:users} = await supabase
.from("users")
.select("role");

let sellers = 0;
let buyers = 0;

users?.forEach(u=>{
if(u.role==="seller") sellers++;
if(u.role==="buyer") buyers++;
});

/* payouts */

const {data:payouts} = await supabase
.from("seller_payouts")
.select("amount,status");

let pendingPayouts = 0;

payouts?.forEach(p=>{
if(p.status==="PENDING"){
pendingPayouts += Number(p.amount);
}
});

/* disputes */

const {count:disputeCount} = await supabase
.from("orders")
.select("*",{count:"exact",head:true})
.eq("status","DISPUTED");

/* recent orders */

const {data:recent} = await supabase
.from("orders")
.select(`
id,
status,
total_amount,
created_at,
products(name)
`)
.order("created_at",{ascending:false})
.limit(5);

setStats({
totalOrders,
totalProducts:productsCount || 0,
totalSellers:sellers,
totalBuyers:buyers,
totalSales,
platformFees,
escrowMoney,
pendingPayouts,
disputes:disputeCount || 0
});

setRecentOrders(recent || []);

}catch(err){
console.error(err);
}

setLoading(false);

};

if(loading){
return(
<div className="min-h-screen flex items-center justify-center">
Loading admin dashboard...
</div>
);
}

return(

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar/>

<main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

<h1 className="text-3xl font-bold text-blue-900 mb-8">
Admin Dashboard
</h1>

{/* METRICS */}

<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

<Card title="Orders" value={stats.totalOrders} icon={<ShoppingCart/>}/>

<Card title="Products" value={stats.totalProducts} icon={<Package/>}/>

<Card title="Sellers" value={stats.totalSellers} icon={<Users/>}/>

<Card title="Buyers" value={stats.totalBuyers} icon={<Users/>}/>

</div>

{/* FINANCIAL */}

<div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">

<Card title="Total Sales" value={`₦${stats.totalSales.toLocaleString()}`} icon={<DollarSign/>}/>

<Card title="Platform Fees" value={`₦${stats.platformFees.toLocaleString()}`} icon={<DollarSign/>}/>

<Card title="Escrow Money" value={`₦${stats.escrowMoney.toLocaleString()}`} icon={<Shield/>}/>

<Card title="Pending Payouts" value={`₦${stats.pendingPayouts.toLocaleString()}`} icon={<DollarSign/>}/>

</div>

{/* RISK */}

<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

<div className="bg-white border rounded-lg p-6">

<p className="text-sm text-gray-500">
Disputed Orders
</p>

<p className="text-2xl font-bold text-red-600">
{stats.disputes}
</p>

</div>

</div>

{/* RECENT ORDERS */}

<div className="bg-white rounded-lg border">

<div className="p-4 border-b font-semibold">
Recent Orders
</div>

<table className="w-full text-sm">

<thead className="bg-gray-50">

<tr>
<th className="p-3 text-left">Product</th>
<th className="p-3 text-left">Amount</th>
<th className="p-3 text-left">Status</th>
</tr>

</thead>

<tbody>

{recentOrders.length === 0 ? (
<tr>
<td colSpan="3" className="p-6 text-center text-gray-500">
No recent orders
</td>
</tr>
) : (
recentOrders.map(o=>(
<tr key={o.id} className="border-t">

<td className="p-3">
{o.products?.name || "Product"}
</td>

<td className="p-3">
₦{Number(o.total_amount).toLocaleString()}
</td>

<td className="p-3">
{o.status}
</td>

</tr>
))
)}

</tbody>

</table>

</div>

</main>

<Footer/>

</div>

);

}

function Card({title,value,icon}){

return(

<div className="bg-white border rounded-lg p-4 flex items-center justify-between">

<div>

<p className="text-sm text-gray-500">
{title}
</p>

<p className="text-xl font-bold text-blue-900">
{value}
</p>

</div>

<div className="text-blue-600">
{icon}
</div>

</div>

);

}