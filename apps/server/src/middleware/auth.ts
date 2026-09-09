import { Request, Response, NextFunction } from 'express'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }

  const token = authHeader.split(' ')[1]
  const { data, error } = await supabase.auth.getUser(token)

  if (error || !data.user) {
    return res.status(401).json({ error: 'Invalid or expired token' })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .maybeSingle()

  let role = profile?.role as string | null | undefined
  if (!role) {
    const { data: athlete } = await supabase
      .from('athletes')
      .select('id')
      .eq('profile_id', data.user.id)
      .maybeSingle()
    role = athlete ? 'Athlete' : 'Guest'
  }

  if (role === 'Organizer' || role === 'Coach') {
    const { data: org } = await supabase
      .from('organizers')
      .select('is_active')
      .eq('profile_id', data.user.id)
      .maybeSingle()
    // A missing organizers row used to fall through as an active account:
    // the check only fired when the row existed and said inactive. Staff
    // authority comes from that row (assigned sports, active flag), so its
    // absence means the account is not configured to act, not that it may
    // act without limits.
    if (!org || !org.is_active) {
      return res.status(401).json({ error: 'Account deactivated. Contact your admin.' })
    }
  }

  req.user = {
    id: data.user.id,
    email: data.user.email!,
    role,
  }

  next()
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' })
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }
    next()
  }
}
