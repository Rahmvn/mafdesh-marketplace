import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { showGlobalError, showGlobalSuccess, showGlobalWarning } from "../hooks/modalService";

export default function BuyerDispute(){

const { id } = useParams();
const navigate = useNavigate();

const [order,setOrder] = useState(null);
const [reason,setReason] = useState("");
const [images,setImages] = useState([]);
const [loading,setLoading] = useState(true);

const loadOrder = useCallback(async () => {

const {data,error} = await supabase
.from("orders")
.select("*")
.eq("id",id)
.single();

if(error){
console.error(error);
return;
}

setOrder(data);
setLoading(false);

}, [id]);

useEffect(()=>{
const loadInitialOrder = async () => {
await loadOrder();
};

loadInitialOrder();
}, [loadOrder]);

const handleImages = (e)=>{

const files = Array.from(e.target.files);

if(files.length > 5){
showGlobalWarning("Too Many Images", "You can upload a maximum of 5 images.");
return;
}

setImages(files);

};
const uploadImages = async ()=>{

const paths = [];

for(const file of images){

const filePath = `disputes/${order.id}/${Date.now()}-${file.name}`;

const {error} = await supabase.storage
.from("dispute-evidence")
.upload(filePath,file);

if(error){
console.error(error);
continue;
}

paths.push(filePath);

}

return paths;

};
const submitDispute = async()=>{

if(!reason.trim()){
showGlobalWarning("Description Required", "Please explain the problem.");
return;
}

if(images.length === 0){
showGlobalWarning("Evidence Required", "Please upload at least one image.");
return;
}

const imagePaths = await uploadImages();

const {error} = await supabase
.from("orders")
.update({
status:"DISPUTED",
dispute_reason:reason,
dispute_images:imagePaths,
disputed_at:new Date()
})
.eq("id",order.id);

if(error){
console.error(error);
showGlobalError("Submission Failed", "Failed to submit dispute. Please try again.");
return;
}

showGlobalSuccess("Dispute Submitted", "Your dispute was submitted successfully.");

navigate("/orders");

};
if(loading){
return <MarketplaceDetailSkeleton />;
}

return(

<div className="min-h-screen flex flex-col bg-blue-50">

<Navbar/>

<main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">

<h1 className="text-3xl font-bold text-blue-900 mb-6">
Report Issue
</h1>

<div className="bg-white p-6 rounded-lg border">

<p className="mb-2 font-semibold">
Explain the problem
</p>

<textarea
className="w-full border p-3 rounded mb-4"
rows="5"
value={reason}
onChange={(e)=>setReason(e.target.value)}
placeholder="Describe what went wrong"
/>

<p className="mb-2 font-semibold">
Upload evidence photos
</p>

<input
type="file"
multiple
accept="image/*"
onChange={handleImages}
className="mb-4"
/>

<button
onClick={submitDispute}
className="bg-red-600 text-white px-6 py-2 rounded"
>
Submit Dispute
</button>

</div>

</main>

<Footer/>

</div>

);
}

