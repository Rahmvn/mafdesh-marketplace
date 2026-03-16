import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    // 1. Verify the user is authenticated (optional but recommended)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response('Unauthorized', { status: 401 })
    }

    // Create a Supabase client with the user's JWT to verify identity
    const supabaseClient = createClient(
      Deno.env.get('https://aoykcclwqbxnrlslxzky.supabase.co')!,
      Deno.env.get('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFveWtjY2x3cWJ4bnJsc2x4emt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0MDEzMTQsImV4cCI6MjA4Njk3NzMxNH0.AzWU1ydArpa0rFReDZG07h-jxMj426q9PXTDa2lmv60')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    if (userError || !user) {
      return new Response('Unauthorized', { status: 401 })
    }

    // 2. Parse the request body to get the order ID
    const { orderId } = await req.json()
    if (!orderId) {
      return new Response('Missing orderId', { status: 400 })
    }

    // 3. Create a service role client (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get('https://aoykcclwqbxnrlslxzky.supabase.co')!,
      Deno.env.get('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFveWtjY2x3cWJ4bnJsc2x4emt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTQwMTMxNCwiZXhwIjoyMDg2OTc3MzE0fQ.G8uxSYNxwrLd7G6ixxxxpyhnHqSkNsfXr60pzE5crjU')!
    )

    // 4. Call the atomic stock deduction function
    const { data: success, error } = await supabaseAdmin.rpc('deduct_stock', {
      order_id: orderId,
    })

    if (error) {
      console.error('RPC error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
    }

    if (!success) {
      // Stock deduction failed (insufficient stock or order already processed)
      return new Response(JSON.stringify({ error: 'Order cannot be completed' }), { status: 409 })
    }

    // 5. Return success
    return new Response(JSON.stringify({ success: true }), { status: 200 })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 })
  }
})