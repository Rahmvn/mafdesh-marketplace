import { supabase } from "../supabaseClient";

export const runOrderAutomation = async () => {

  const now = new Date();

  const { data: orders, error } = await supabase
    .from("orders")
    .select("id, delivered_at")
    .eq("status", "DELIVERED");

  if (error) {
    console.error("Automation error:", error);
    return;
  }

  for (const order of orders) {

    const deliveredTime = new Date(order.delivered_at);

    const hoursPassed =
      (now - deliveredTime) / (1000 * 60 * 60);

    if (hoursPassed >= 72) {

      await supabase
        .from("orders")
        .update({
          status: "COMPLETED",
          completed_at: new Date()
        })
        .eq("id", order.id);

      console.log("Order auto-completed:", order.id);

    }

  }

};