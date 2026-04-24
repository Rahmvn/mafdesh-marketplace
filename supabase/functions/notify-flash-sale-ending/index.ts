import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.cron('notify-flash-sale-ending', '*/5 * * * *', async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.rpc('create_flash_sale_ending_notifications')

  if (error) {
    console.error('Flash sale ending notification cron failed:', error)
    return
  }

  if (Number(data || 0) > 0) {
    console.log(`Created ${Number(data || 0)} flash sale ending notification(s)`)
  }
})
