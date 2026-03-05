import { supabase } from '../supabaseClient';

export const verificationService = {
  async createVerificationPayment(sellerId, planType, amount, paymentReference) {
    const expiresAt = new Date();
    if (planType === 'monthly') {
      expiresAt.setMonth(expiresAt.getMonth() + 1);
    } else {
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    }

    const { data, error } = await supabase
      .from('verification_payments')
      .insert([{
        seller_id: sellerId,
        plan_type: planType,
        amount,
        payment_reference: paymentReference,
        payment_status: 'pending',
        expires_at: expiresAt.toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  async updatePaymentStatus(paymentReference, status) {
    const { data, error } = await supabase
      .from('verification_payments')
      .update({ payment_status: status })
      .eq('payment_reference', paymentReference)
      .select()
      .single();

    if (error) throw error;

    if (status === 'successful') {
      const { error: userError } = await supabase
        .from('users')
        .update({ 
          is_verified: true,
          verification_expiry: data.expires_at
        })
        .eq('id', data.seller_id);

      if (userError) throw userError;
    }

    return data;
  },

  async checkVerificationStatus(sellerId) {
    const { data, error } = await supabase
      .from('users')
      .select('is_verified, verification_expiry')
      .eq('id', sellerId)
      .single();

    if (error) throw error;

    if (data.is_verified && data.verification_expiry) {
      const now = new Date();
      const expiry = new Date(data.verification_expiry);
      
      if (expiry < now) {
        await supabase
          .from('users')
          .update({ is_verified: false })
          .eq('id', sellerId);
        
        return { is_verified: false, expired: true };
      }
    }

    return { is_verified: data.is_verified, expired: false };
  }
};
