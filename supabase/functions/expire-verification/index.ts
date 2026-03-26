import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.cron('expire-verification', '0 0 * * *', async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('users')
    .update({ is_verified: false })
    .lte('verification_expiry', now)
    .eq('is_verified', true)
    .select('id')

  if (error) {
    console.error('Expiry cron error:', error)
    return
  }

  if (data && data.length > 0) {
    console.log(`Unverified ${data.length} sellers due to expiry`)
    for (const user of data) {
      await supabase.from('admin_actions').insert({
        admin_id: null,
        order_id: null,
        action_type: 'AUTO_UNVERIFY',
        reason: 'Verification expired',
        metadata: { user_id: user.id, expired_at: now }
      })
    }
  }
})