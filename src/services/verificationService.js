import { supabase } from '../supabaseClient';

export const EARLY_VERIFICATION_FEE = 1500;
export const SELLER_VERIFICATION_PROOFS_BUCKET = 'seller-verification-proofs';
export const SELLER_VERIFICATION_STATUSES = {
  NOT_SUBMITTED: 'not_submitted',
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
};
export const SELLER_VERIFICATION_PAYMENT_STATUSES = {
  PENDING: 'pending',
  MANUAL_PENDING: 'manual_pending',
};

function sanitizeFileName(name) {
  return String(name || 'proof')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'proof';
}

function buildProofPath(sellerId, fileName) {
  const safeName = sanitizeFileName(fileName);
  return `${sellerId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeName}`;
}

function normalizeSellerVerificationStatus(userRecord, submission) {
  const userStatus = String(userRecord?.verification_status || '').trim().toLowerCase();
  const submissionStatus = String(submission?.verification_status || '').trim().toLowerCase();

  if (userRecord?.is_verified_seller || userStatus === SELLER_VERIFICATION_STATUSES.APPROVED) {
    return SELLER_VERIFICATION_STATUSES.APPROVED;
  }

  if (submissionStatus === SELLER_VERIFICATION_STATUSES.PENDING) {
    return SELLER_VERIFICATION_STATUSES.PENDING;
  }

  if (userStatus === SELLER_VERIFICATION_STATUSES.REJECTED) {
    return SELLER_VERIFICATION_STATUSES.REJECTED;
  }

  if (submissionStatus === SELLER_VERIFICATION_STATUSES.REJECTED) {
    return SELLER_VERIFICATION_STATUSES.REJECTED;
  }

  if (userStatus === SELLER_VERIFICATION_STATUSES.PENDING) {
    return SELLER_VERIFICATION_STATUSES.PENDING;
  }

  return SELLER_VERIFICATION_STATUSES.NOT_SUBMITTED;
}

export async function fetchSellerVerificationSnapshot(sellerId) {
  const [userResult, submissionResult] = await Promise.all([
    supabase
      .from('users')
      .select(`
        id,
        role,
        email,
        business_name,
        is_verified,
        is_verified_seller,
        university_id,
        university_name,
        university_state,
        university_zone,
        university_role,
        verification_status,
        verification_submitted_at,
        verification_approved_at
      `)
      .eq('id', sellerId)
      .single(),
    supabase
      .from('seller_verifications')
      .select(`
        id,
        seller_id,
        university_id,
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
        updated_at
      `)
      .eq('seller_id', sellerId)
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  if (userResult.error) {
    throw userResult.error;
  }

  if (userResult.data?.role !== 'seller') {
    throw new Error('Only seller accounts can access verification.');
  }

  if (submissionResult.error) {
    throw submissionResult.error;
  }

  const latestSubmission = submissionResult.data?.[0] || null;

  return {
    user: userResult.data,
    latestSubmission,
    status: normalizeSellerVerificationStatus(userResult.data, latestSubmission),
  };
}

export async function uploadSellerVerificationProof(sellerId, proofFile) {
  if (!proofFile) {
    return null;
  }

  const storagePath = buildProofPath(sellerId, proofFile.name);
  const { error } = await supabase.storage
    .from(SELLER_VERIFICATION_PROOFS_BUCKET)
    .upload(storagePath, proofFile, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  return storagePath;
}

export async function submitSellerVerificationApplication({
  sellerId,
  universityId = null,
  universityName,
  universityState,
  universityZone,
  universityRole,
  matricOrStaffId,
  proofFile,
}) {
  const proofPath = await uploadSellerVerificationProof(sellerId, proofFile);

  try {
    const submissionPayload = {
      seller_id: sellerId,
      university_id: universityId || null,
      university_name: universityName,
      university_state: universityState || null,
      university_zone: universityZone || null,
      university_role: universityRole,
      matric_or_staff_id: matricOrStaffId || null,
      proof_url: proofPath,
      payment_amount: EARLY_VERIFICATION_FEE,
      payment_status: SELLER_VERIFICATION_PAYMENT_STATUSES.MANUAL_PENDING,
      verification_status: SELLER_VERIFICATION_STATUSES.PENDING,
    };

    const { data: submission, error: submissionError } = await supabase
      .from('seller_verifications')
      .insert(submissionPayload)
      .select(`
        id,
        seller_id,
        university_id,
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
        updated_at
      `)
      .single();

    if (submissionError) {
      throw submissionError;
    }

    const submittedAt = new Date().toISOString();
    const userUpdatePayload = {
      university_id: universityId || null,
      university_name: universityName,
      university_state: universityState || null,
      university_zone: universityZone || null,
      university_role: universityRole,
      verification_status: SELLER_VERIFICATION_STATUSES.PENDING,
      verification_submitted_at: submittedAt,
    };

    const { data: user, error: userUpdateError } = await supabase
      .from('users')
      .update(userUpdatePayload)
      .eq('id', sellerId)
      .select(`
        id,
        role,
        email,
        business_name,
        is_verified,
        is_verified_seller,
        university_id,
        university_name,
        university_state,
        university_zone,
        university_role,
        verification_status,
        verification_submitted_at,
        verification_approved_at
      `)
      .single();

    return {
      submission,
      user: user || null,
      status: SELLER_VERIFICATION_STATUSES.PENDING,
      userSyncError: userUpdateError || null,
    };
  } catch (error) {
    if (proofPath) {
      await supabase.storage
        .from(SELLER_VERIFICATION_PROOFS_BUCKET)
        .remove([proofPath])
        .catch(() => undefined);
    }

    throw error;
  }
}
