import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function AdminOrderDetails(){

const { id } = useParams();
const navigate = useNavigate();
const admin = JSON.parse(localStorage.getItem("mafdesh_user"));

const [order,setOrder] = useState(null);
const [product,setProduct] = useState(null);
const [buyer,setBuyer] = useState(null);
const [seller,setSeller] = useState(null);
const [evidence,setEvidence] = useState([]);
const [loading,setLoading] = useState(true);

useEffect(()=>{
checkAuth();
loadOrder();
},[id]);

/* ========================= */
/* AUTH */
/* ========================= */

const checkAuth = ()=>{

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
const logAdminAction = async (action) => {

await supabase
.from("admin_actions")
.insert({
admin_id: admin.id,
order_id: order.id,
action: action
});

};

/* ========================= */
/* LOAD ORDER */
/* ========================= */

const loadOrder = async()=>{

setLoading(true);

/* ORDER */

const {data:orderData,error} = await supabase
.from("orders")
.select("*")
.eq("id",id)
.single();

if(error || !orderData){
console.error(error);
setLoading(false);
return;
}

/* PRODUCT */

const {data:productData} = await supabase
.from("products")
.select("name,images")
.eq("id",orderData.product_id)
.single();

/* BUYER */

const {data:buyerUser} = await supabase
.from("users")
.select("id,email,phone_number")
.eq("id",orderData.buyer_id)
.maybeSingle();

const {data:buyerProfile} = await supabase
.from("profiles")
.select("full_name,username,location")
.eq("id",orderData.buyer_id)
.maybeSingle();

/* SELLER */

const {data:sellerUser} = await supabase
.from("users")
.select("id,email,phone_number")
.eq("id",orderData.seller_id)
.maybeSingle();

const {data:sellerProfile} = await supabase
.from("profiles")
.select("full_name,username,location")
.eq("id",orderData.seller_id)
.maybeSingle();

/* MERGE DATA */

setOrder(orderData);
setProduct(productData || {});
setBuyer({...buyerUser,...buyerProfile});
setSeller({...sellerUser,...sellerProfile});

/* LOAD DISPUTE IMAGES */

if(orderData.dispute_images?.length){

const urls = [];

for(const path of orderData.dispute_images){

const {data} = await supabase.storage
.from("dispute-evidence")
.createSignedUrl(path,3600);

if(data?.signedUrl){
urls.push(data.signedUrl);
}

}

setEvidence(urls);

}

setLoading(false);

};

/* ========================= */
/* ADMIN ACTIONS */
/* ========================= */

const releaseEscrow = async () => {

const confirm = window.confirm("Release escrow to seller?");

if(!confirm) return;

const { error } = await supabase
.from("orders")
.update({
status:"COMPLETED",
completed_at:new Date()
})
.eq("id",order.id);

if(error){
console.error(error);
alert("Failed to release escrow");
return;
}

await logAdminAction("RELEASE_ESCROW");

alert("Escrow released");

navigate("/admin/disputes");

};

const refundBuyer = async () => {

const confirm = window.confirm("Refund buyer?");

if(!confirm) return;

const { error } = await supabase
.from("orders")
.update({
status: "REFUNDED"
})
.eq("id", order.id);

if(error){
console.error(error);
alert("Refund failed");
return;
}

await logAdminAction("REFUND_BUYER");

alert("Buyer refunded");

navigate("/admin/disputes");

};

const cancelOrder = async () => {

const confirm = window.confirm("Cancel order?");

if(!confirm) return;

const { error } = await supabase
.from("orders")
.update({
status:"CANCELLED"
})
.eq("id",order.id);

if(error){
console.error(error);
alert("Cancel failed");
return;
}

await logAdminAction("CANCEL_ORDER");

alert("Order cancelled");

navigate("/admin/disputes");

};

/* ========================= */
/* UI */
/* ========================= */

if(loading){
return(
<div className="min-h-screen flex items-center justify-center">
Loading order...
</div>
);
}

if(!order){
return(
<div className="min-h-screen flex items-center justify-center">
Order not found
</div>
);
}

return(

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar/>

<main className="flex-1 max-w-6xl mx-auto w-full px-4 py-8">

<h1 className="text-3xl font-bold text-blue-900 mb-8">
Admin Order Details
</h1>

<div className="grid md:grid-cols-2 gap-6">

{/* PRODUCT */}

<div className="bg-white p-6 rounded-lg border">

<h2 className="font-semibold mb-4 text-blue-900">
Product
</h2>

<img
src={product?.images?.[0]}
alt={product?.name}
className="w-40 h-40 object-contain mb-4"
/>

<p className="font-semibold text-lg">
{product?.name}
</p>

</div>

{/* ORDER */}

<div className="bg-white p-6 rounded-lg border">

<h2 className="font-semibold mb-4 text-blue-900">
Order Info
</h2>

<p><strong>Order ID:</strong> {order.id}</p>
<p><strong>Status:</strong> {order.status}</p>
<p><strong>Amount:</strong> ₦{Number(order.total_amount).toLocaleString()}</p>
<p><strong>Platform Fee:</strong> ₦{Number(order.platform_fee).toLocaleString()}</p>
<p><strong>Delivery Type:</strong> {order.delivery_type}</p>
<p><strong>Date:</strong> {new Date(order.created_at).toLocaleDateString()}</p>

</div>

{/* BUYER */}

<div className="bg-white p-6 rounded-lg border">

<h2 className="font-semibold mb-4 text-blue-900">
Buyer
</h2>

<p><strong>Name:</strong> {buyer?.full_name || buyer?.username || "Unknown"}</p>
<p><strong>Email:</strong> {buyer?.email ?? "Unknown"}</p>
<p><strong>Phone:</strong> {buyer?.phone_number ?? "Unknown"}</p>
<p><strong>ID:</strong> {buyer?.id ?? "Unknown"}</p>

</div>

{/* SELLER */}

<div className="bg-white p-6 rounded-lg border">

<h2 className="font-semibold mb-4 text-blue-900">
Seller
</h2>

<p><strong>Name:</strong> {seller?.full_name ?? "Unknown"}</p>
<p><strong>Email:</strong> {seller?.email ?? "Unknown"}</p>
<p><strong>Phone:</strong> {seller?.phone_number ?? "Unknown"}</p>
<p><strong>ID:</strong> {seller?.id ?? "Unknown"}</p>

</div>

{/* DELIVERY */}

{order.delivery_type === "delivery" && (

<div className="bg-white p-6 rounded-lg border md:col-span-2">

<h2 className="font-semibold mb-4 text-blue-900">
Delivery Info
</h2>

<p><strong>State:</strong> {order.delivery_state}</p>
<p><strong>Address:</strong> {order.delivery_address}</p>

</div>

)}

{/* DISPUTE SECTION */}

{order.status === "DISPUTED" && (

<div className="bg-white p-6 rounded-lg border md:col-span-2">

<h2 className="font-semibold mb-4 text-red-600">
Dispute Details
</h2>

<p className="mb-4">
<strong>Reason:</strong> {order.dispute_reason}
</p>

<div className="grid grid-cols-2 md:grid-cols-3 gap-4">

{evidence.map((img,i)=>(
<img
key={i}
src={img}
alt="evidence"
className="rounded border"
/>
))}

</div>

</div>

)}

{/* ADMIN ACTIONS */}

<div className="bg-white p-6 rounded-lg border md:col-span-2">

<h2 className="font-semibold mb-4 text-blue-900">
Admin Actions
</h2>

<div className="flex gap-4 flex-wrap">

<button
onClick={refundBuyer}
className="bg-red-600 text-white px-4 py-2 rounded"
>
Refund Buyer
</button>

<button
onClick={releaseEscrow}
className="bg-green-600 text-white px-4 py-2 rounded"
>
Release Escrow
</button>

<button
onClick={cancelOrder}
className="bg-orange-600 text-white px-4 py-2 rounded"
>
Cancel Order
</button>

</div>

</div>

</div>

</main>

<Footer/>

</div>

);

}