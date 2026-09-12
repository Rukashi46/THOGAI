import { supabase, isSupabaseConfigured } from '../lib/supabase'
import type { Session, User } from '@supabase/supabase-js'

export interface AuthUser {
  id: string
  email: string
  name?: string
  avatarUrl?: string
}

function mapUser(user: User | null): AuthUser | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email || '',
    name: user.user_metadata?.name || user.email?.split('@')[0] || 'User',
    avatarUrl: user.user_metadata?.avatar_url
  }
}

function friendlyErrorMessage(err: any): string {
  if (!err) return 'Something went wrong. Please try again.'
  const msg = err.message || String(err)
  if (msg.includes('Invalid login credentials')) {
    return 'Invalid email or password. Please check your credentials.'
  }
  if (msg.includes('User already registered') || msg.includes('already exists')) {
    return 'An account with this email already exists. Try logging in.'
  }
  if (msg.includes('Password should be at least')) {
    return 'Password is too weak. Please use at least 6 characters.'
  }
  if (msg.includes('rate limit')) {
    return 'Too many attempts. Please wait a few moments and try again.'
  }
  if (msg.toLowerCase().includes('email not confirmed')) {
    return 'Your email has not been verified yet. Please check your inbox for the verification link.'
  }
  if (msg.includes('network') || msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return "You're offline. Please check your internet connection."
  }
  // Sanitize any raw technical database or internal errors
  if (
    msg.includes('500') ||
    msg.includes('TypeError') ||
    msg.includes('PostgrestError') ||
    msg.includes('schema') ||
    msg.includes('violates') ||
    msg.includes('column') ||
    msg.includes('relation') ||
    msg.includes('Supabase') ||
    msg.includes('undefined')
  ) {
    return 'Something went wrong. Please try again.'
  }
  return msg
}

export const authService = {
  isConfigured(): boolean {
    return isSupabaseConfigured()
  },

  async getSession(): Promise<{ session: Session | null; user: AuthUser | null }> {
    if (!isSupabaseConfigured()) {
      return { session: null, user: null }
    }
    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) throw error
      return {
        session: data.session,
        user: mapUser(data.session?.user || null)
      }
    } catch {
      return { session: null, user: null }
    }
  },

  async getUser(): Promise<AuthUser | null> {
    if (!isSupabaseConfigured()) return null
    try {
      const { data } = await supabase.auth.getUser()
      return mapUser(data.user)
    } catch {
      return null
    }
  },

  async signUp(email: string, password: string, name: string): Promise<{ user: AuthUser; hasSession: boolean }> {
    if (!isSupabaseConfigured()) {
      throw new Error('Cloud services are currently unavailable. Please try again later.')
    }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name: name.trim() }
      }
    })
    if (error) throw new Error(friendlyErrorMessage(error))
    if (!data.user) throw new Error('Failed to create account. Please try again.')

    // Ensure profile row exists
    try {
      await supabase.from('profiles').upsert({
        id: data.user.id,
        name: name.trim(),
        email: data.user.email,
        updated_at: new Date().toISOString()
      })
    } catch {}

    const mapped = mapUser(data.user)
    if (!mapped) throw new Error('Account setup failed. Please try again.')
    return { user: mapped, hasSession: !!data.session }
  },

  async resendConfirmationEmail(email: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error("We couldn't send the verification email. Please try again.")
    }
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: {
        emailRedirectTo: redirectUrl
      }
    })
    if (error) throw new Error("We couldn't send the verification email. Please try again.")
  },

  async signIn(email: string, password: string): Promise<AuthUser> {
    if (!isSupabaseConfigured()) {
      throw new Error('Cloud services are currently unavailable. Please try again later.')
    }
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })
    if (error) throw new Error(friendlyErrorMessage(error))
    if (!data.user) throw new Error('Invalid email or password. Please try again.')

    const mapped = mapUser(data.user)
    if (!mapped) throw new Error('Unable to log in. Please try again.')
    return mapped
  },

  async signOut(): Promise<void> {
    if (!isSupabaseConfigured()) return
    await supabase.auth.signOut()
  },

  async resetPassword(email: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Unable to send reset link right now. Please try again later.')
    }
    const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl
    })
    if (error) throw new Error(friendlyErrorMessage(error))
  },

  async updatePassword(newPassword: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      throw new Error('Unable to update password right now. Please try again later.')
    }
    const { error } = await supabase.auth.updateUser({
      password: newPassword
    })
    if (error) throw new Error(friendlyErrorMessage(error))
  },

  async updateProfile(name: string): Promise<void> {
    if (!isSupabaseConfigured()) return
    const { data } = await supabase.auth.updateUser({
      data: { name }
    })
    if (data.user) {
      await supabase.from('profiles').update({
        name,
        updated_at: new Date().toISOString()
      }).eq('id', data.user.id)
    }
  },

  onAuthStateChange(callback: (event: string, session: Session | null, user: AuthUser | null) => void) {
    if (!isSupabaseConfigured()) {
      return { unsubscribe: () => {} }
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(event, session, mapUser(session?.user || null))
    })
    return subscription
  }
}
