import React from 'react'
import { useEffect, useState } from 'react'
import GuestNavbar from './GuestNavbar'
import Navbar from './Navbar'
import { supabase } from '../supabaseClient'

export default function AuthNavbarWrapper() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    let mounted = true

    const getUser = async () => {
      const { data } = await supabase.auth.getUser()
      if (mounted) setUser(data?.user || null)
    }

    getUser()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) setUser(session?.user || null)
      }
    )

    return () => {
      mounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])   // 👈 EMPTY dependency array — runs ONCE

  return user ? <Navbar /> : <GuestNavbar />
}