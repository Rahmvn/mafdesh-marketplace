import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

export default function AdminOrders(){

const navigate = useNavigate();

const [orders,setOrders] = useState([]);
const [loading,setLoading] = useState(true);
const [statusFilter,setStatusFilter] = useState("ALL");

useEffect(()=>{
checkAuth();
loadOrders();
},[]);

const checkAuth = () => {

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

const loadOrders = async () => {

setLoading(true);

let query = supabase
.from("orders")
.select(`
id,
status,
total_amount,
delivery_type,
created_at,
product_id,
buyer_id,
seller_id
`)
.order("created_at",{ascending:false});

if(statusFilter !== "ALL"){
query = query.eq("status",statusFilter);
}

const {data,error} = await query;

if(error){
console.error(error);
setLoading(false);
return;
}

/* get product names */

const productIds = data.map(o=>o.product_id);

const {data:products} = await supabase
.from("products")
.select("id,name")
.in("id",productIds);

const productMap = {};
products?.forEach(p=>{
productMap[p.id] = p.name;
});

/* merge */

const merged = data.map(o=>({
...o,
product_name:productMap[o.product_id] || "Product"
}));

setOrders(merged);

setLoading(false);

};

const getStatusColor = (status) => {

switch(status){

case "PENDING_PAYMENT":
return "bg-gray-100 text-gray-700";

case "PAID_ESCROW":
return "bg-blue-100 text-blue-700";

case "SHIPPED":
return "bg-purple-100 text-purple-700";

case "COMPLETED":
return "bg-green-100 text-green-700";

case "DISPUTED":
return "bg-red-100 text-red-700";

case "CANCELLED":
return "bg-orange-100 text-orange-700";

default:
return "bg-gray-100 text-gray-700";

}

};

if(loading){
return(
<div className="min-h-screen flex items-center justify-center">
Loading orders...
</div>
);
}

return(

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar/>

<main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

<h1 className="text-3xl font-bold text-blue-900 mb-6">
Admin Orders
</h1>

{/* FILTER */}

<div className="mb-6">

<select
value={statusFilter}
onChange={(e)=>{
setStatusFilter(e.target.value);
setTimeout(loadOrders,100);
}}
className="border rounded-lg p-2"
>

<option value="ALL">All Orders</option>
<option value="PENDING_PAYMENT">Pending Payment</option>
<option value="PAID_ESCROW">Paid Escrow</option>
<option value="SHIPPED">Shipped</option>
<option value="COMPLETED">Completed</option>
<option value="DISPUTED">Disputed</option>
<option value="CANCELLED">Cancelled</option>

</select>

</div>

{/* TABLE */}

<div className="bg-white border rounded-lg overflow-x-auto">

<table className="w-full text-sm">

<thead className="bg-gray-50">

<tr>

<th className="p-3 text-left">Order ID</th>
<th className="p-3 text-left">Product</th>
<th className="p-3 text-left">Amount</th>
<th className="p-3 text-left">Delivery</th>
<th className="p-3 text-left">Status</th>
<th className="p-3 text-left">Date</th>
<th className="p-3 text-left">Action</th>

</tr>

</thead>

<tbody>

{orders.length === 0 ? (

<tr>
<td colSpan="7" className="p-6 text-center text-gray-500">
No orders found
</td>
</tr>

) : (

orders.map(o=>(

<tr key={o.id} className="border-t">

<td className="p-3 text-xs">
{o.id.slice(0,8)}...
</td>

<td className="p-3">
{o.product_name}
</td>

<td className="p-3">
₦{Number(o.total_amount).toLocaleString()}
</td>

<td className="p-3 capitalize">
{o.delivery_type}
</td>

<td className="p-3">

<span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(o.status)}`}>

{o.status}

</span>

</td>

<td className="p-3">
{new Date(o.created_at).toLocaleDateString()}
</td>

<td className="p-3">

<button
onClick={()=>navigate(`/admin/order/${o.id}`)}
className="text-blue-600 font-semibold"
>

View

</button>

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