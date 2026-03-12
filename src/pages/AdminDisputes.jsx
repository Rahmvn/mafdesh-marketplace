import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";

export default function AdminDisputes(){

const navigate = useNavigate();
const [orders,setOrders] = useState([]);
const [loading,setLoading] = useState(true);

useEffect(()=>{
checkAuth();
loadDisputes();
},[]);

/* ========================= */
/* AUTH */
/* ========================= */

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

/* ========================= */
/* LOAD DISPUTES */
/* ========================= */

const loadDisputes = async ()=>{

setLoading(true);

const {data,error} = await supabase
.from("orders")
.select(`
id,
status,
total_amount,
dispute_reason,
disputed_at,
buyer_id,
seller_id,
product:products!orders_product_id_fkey (
  name
)
`)
.eq("status","DISPUTED")
.order("disputed_at",{ascending:false});

if(error){
console.error(error);
}

setOrders(data || []);
setLoading(false);

};

/* ========================= */
/* UI */
/* ========================= */

if(loading){
return(
<div className="min-h-screen flex items-center justify-center">
Loading disputes...
</div>
);
}

return(

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar/>

<main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">

<h1 className="text-3xl font-bold text-blue-900 mb-8">
Admin Disputes
</h1>

<div className="bg-white rounded-lg border overflow-hidden">

<table className="w-full text-sm">

<thead className="bg-gray-50">

<tr>
<th className="p-3 text-left">Product</th>
<th className="p-3 text-left">Amount</th>
<th className="p-3 text-left">Reason</th>
<th className="p-3 text-left">Buyer</th>
<th className="p-3 text-left">Seller</th>
<th className="p-3 text-left">Dispute Date</th>
<th className="p-3 text-left">Action</th>
</tr>

</thead>

<tbody>

{orders.length === 0 ? (

<tr>
<td colSpan="7" className="p-6 text-center text-gray-500">
No disputes found
</td>
</tr>

) : (

orders.map(order => (

<tr key={order.id} className="border-t hover:bg-gray-50">

<td className="p-3">
{order.product?.name || "Unknown Product"}
</td>

<td className="p-3">
₦{Number(order.total_amount).toLocaleString()}
</td>

<td className="p-3 max-w-xs truncate">
{order.dispute_reason || "No reason provided"}
</td>

<td className="p-3 text-xs text-gray-600">
{order.buyer_id}
</td>

<td className="p-3 text-xs text-gray-600">
{order.seller_id}
</td>

<td className="p-3">
{order.disputed_at
? new Date(order.disputed_at).toLocaleDateString()
: "-"
}
</td>

<td className="p-3">

<button
onClick={()=>navigate(`/admin/orders/${order.id}`)}
className="bg-orange-600 text-white px-3 py-1 rounded hover:bg-orange-700"
>
Review
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