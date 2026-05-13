import React, { useCallback, useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { MarketplaceDetailSkeleton } from "../components/MarketplaceLoading";
import Navbar from "../components/Navbar";
import Footer from "../components/FooterSlim";
import { showGlobalError, showGlobalSuccess, showGlobalWarning } from "../hooks/modalService";
import { openBuyerDispute, uploadDisputeEvidence, validateDisputeEvidenceFiles } from "../services/disputeService";
import {
  DISPUTE_MESSAGE_MAX_LENGTH,
  normalizeMultilineText,
  validateDisputeMessage,
} from '../utils/accountValidation';

export default function BuyerDispute(){

const { id } = useParams();
const navigate = useNavigate();

const [order,setOrder] = useState(null);
const [reason,setReason] = useState("");
const [images,setImages] = useState([]);
const [loading,setLoading] = useState(true);
const [loadError, setLoadError] = useState("");
const [submitting, setSubmitting] = useState(false);

const loadOrder = useCallback(async () => {
try {
const {data,error} = await supabase
.from("orders")
.select("*")
.eq("id",id)
.single();

if(error){
throw error;
}

setOrder(data);
setLoadError("");
} catch (error) {
console.error(error);
setLoadError(error.message || "Failed to load order.");
} finally {
setLoading(false);
}

}, [id]);

useEffect(()=>{
const loadInitialOrder = async () => {
await loadOrder();
};

loadInitialOrder();
}, [loadOrder]);

const handleImages = (e)=>{
const files = Array.from(e.target.files);
const fileError = validateDisputeEvidenceFiles(files);

if(fileError){
showGlobalWarning("Invalid Evidence", fileError);
return;
}

setImages(files);

};
const uploadImages = async ()=>{
return uploadDisputeEvidence({
orderId: order.id,
actorId: order.buyer_id,
files: images,
});

};
const submitDispute = async()=>{
if(submitting){
return;
}

const normalizedReason = normalizeMultilineText(reason);
const reasonError = validateDisputeMessage(normalizedReason, { required: true });

if(reasonError){
showGlobalWarning("Description Required", reasonError);
return;
}

if(images.length === 0){
showGlobalWarning("Evidence Required", "Please upload at least one image.");
return;
}

try{
setSubmitting(true);
const imagePaths = await uploadImages();
await openBuyerDispute(order.id, normalizedReason, imagePaths);
} catch (error) {
console.error(error);
showGlobalError("Submission Failed", error.message || "Failed to submit dispute. Please try again.");
return;
} finally {
setSubmitting(false);
}

showGlobalSuccess("Dispute Submitted", "Your dispute was submitted successfully.");

navigate("/orders");

};
if(loading){
return <MarketplaceDetailSkeleton />;
}

if(loadError || !order){
return (
<div className="min-h-screen flex flex-col bg-blue-50">
<Navbar/>
<main className="flex-1 max-w-4xl mx-auto w-full px-4 py-8">
<div className="bg-white p-6 rounded-lg border">
<h1 className="text-2xl font-bold text-blue-900 mb-3">Unable to load order</h1>
<p className="text-slate-600">{loadError || "This order could not be loaded."}</p>
</div>
</main>
<Footer/>
</div>
);
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
maxLength={DISPUTE_MESSAGE_MAX_LENGTH}
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
disabled={submitting}
className="bg-red-600 text-white px-6 py-2 rounded"
>
{submitting ? "Submitting..." : "Submit Dispute"}
</button>

</div>

</main>

<Footer/>

</div>

);
}

