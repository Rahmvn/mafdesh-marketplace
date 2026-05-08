import { supabase } from '../supabaseClient';

const SELLER_VERIFICATION_PROOFS_BUCKET = 'seller-verification-proofs';
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function getProofExtension(path) {
  const fileName = String(path || '').split('/').pop() || '';
  const extension = fileName.split('.').pop() || '';
  return extension.toLowerCase();
}

export function isImageProof(path) {
  return ['png', 'jpg', 'jpeg', 'webp'].includes(getProofExtension(path));
}

async function buildSignedProofUrl(proofPath) {
  if (!proofPath) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(SELLER_VERIFICATION_PROOFS_BUCKET)
    .createSignedUrl(proofPath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn('Failed to create signed verification proof URL:', error);
    return null;
  }

  return data?.signedUrl || null;
}

export async function fetchPendingVerificationRequests() {
  const { data, error } = await supabase
    .from('seller_verifications')
    .select(`
      id,
      seller_id,
      university_name,
      university_state,
      university_zone,
      university_role,
      matric_or_staff_id,
      proof_url,
      payment_amount,
      payment_status,
      verification_status,
      admin_notes,
      reviewed_by,
      reviewed_at,
      created_at,
      updated_at,
      seller:users!seller_verifications_seller_id_fkey (
        id,
        email,
        full_name,
        business_name,
        is_verified_seller,
        verification_status
      )
    `)
    .eq('verification_status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    throw error;
  }

  const requests = await Promise.all(
    (data || []).map(async (request) => {
      const signedProofUrl = await buildSignedProofUrl(request.proof_url);

      return {
        ...request,
        signedProofUrl,
        isImageProof: isImageProof(request.proof_url),
      };
    })
  );

  return requests;
}

export async function reviewSellerVerification({
  verificationId,
  decision,
  adminNotes = '',
}) {
  const { data, error } = await supabase.rpc('review_seller_verification', {
    p_verification_id: verificationId,
    p_decision: decision,
    p_admin_notes: adminNotes || null,
  });

  if (error) {
    throw error;
  }

  return data;
}
