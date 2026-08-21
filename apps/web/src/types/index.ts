/** Staff roles stored on `profiles.role` (post-migration 037). Athletes carry a null DB role. */
export type StaffRole = 'Admin' | 'Organizer' | 'Coach'

/**
 * Effective role used throughout the UI. `Admin`/`Organizer`/`Coach` come from
 * `profiles.role`; `Athlete` is derived from the presence of an `athletes` row;
 * `Guest` is any signed-in user with neither.
 */
export type Role = StaffRole | 'Athlete' | 'Guest'

export type EnrollmentStatus = 'unverified' | 'verified'

export type Sport = 'basketball' | 'volleyball' | 'table-tennis'

export type SeasonStatus = 'active' | 'inactive'

export type SeasonLifecycle = 'draft' | 'active' | 'completed' | 'archived'

export type EventFormat = 'single_elim' | 'double_elim' | 'round_robin'

export type EventStatus = 'draft' | 'registration' | 'in_progress' | 'completed' | 'cancelled'

export type MatchStatus = 'scheduled' | 'live' | 'completed' | 'cancelled'

export type AnnouncementType = 'emergency' | 'reschedule' | 'reminder' | 'system'

export type AnnouncementUrgency = 'critical' | 'high' | 'normal' | 'low'

export type AudienceType = 'all' | 'sport' | 'event' | 'team'

export type InsightType =
  'trending_up' | 'trending_down' | 'streak' | 'milestone' | 'debut_standout' | 'first_win'

export type ParticipantType = 'team' | 'athlete' | 'doubles_pair'

export interface Institution {
  id: string
  name: string
  abbreviation: string
  tagline: string
  primary_color: string
  secondary_color: string
  logo_url: string | null
  banner_url: string | null
  address: string
  region: string
  created_at: string
}

export interface SportConfig {
  id: string
  slug: Sport
  display_name: string
  icon: string
  is_active: boolean
  stat_definitions: Record<string, StatDefinition>
  positions: string[]
}

export interface StatDefinition {
  label: string
  type: 'count' | 'percentage' | 'decimal' | 'integer'
  derived?: boolean
  description?: string
}

export interface Profile {
  id: string
  role: Role
  full_name: string
  avatar_url: string | null
  email: string
  created_at: string
  enrollment_status?: EnrollmentStatus | null
  /** Set when an organizer moved enrollment from verified → unverified; drives resubmit-COR copy in the app. */
  enrollment_verification_reset_at?: string | null
  student_id?: string | null
  year_level?: string | null
  department?: string | null
  /** Null means the user has never used self-service change-password. */
  password_changed_at?: string | null
  /** Null means the user has not accepted the privacy notice yet — App.tsx blocks on this. */
  privacy_accepted_at?: string | null
  /** Keyed by tour id. A stored version behind the tour's current version auto-starts it again. */
  tours_completed?: Record<string, { at: string; version: number }> | null
}

export interface Organizer {
  id: string
  profile_id: string
  assigned_sports: Sport[]
  permissions: Record<string, boolean>
  is_active: boolean
  profile?: Profile
  /** Present on GET /admin/organizers. */
  season_staff?: { season_id: string }[]
}

export interface Athlete {
  id: string
  profile_id: string
  student_id: string
  sport: Sport
  position: string
  jersey_number: string | null
  year_level: string
  department: string
  season_status: SeasonStatus
  profile?: Profile
}

export interface Team {
  id: string
  name: string
  sport: Sport
  season_id: string
  captain_id: string | null
  department?: string | null
  members?: Athlete[]
  coaches?: Organizer[]
}

export interface Season {
  id: string
  name: string
  status: SeasonLifecycle
  start_date: string
  end_date: string
  created_at: string
  /** Present on GET /admin/seasons; absent on the plain `seasons` table select. */
  sports?: string[]
  staff?: { organizer_id: string; full_name: string; role: string }[]
}

export interface Event {
  id: string
  slug: string
  name: string
  sport: Sport
  season_id: string
  format: EventFormat
  status: EventStatus
  category: string | null
  description?: string | null
  created_by: string
  created_at: string
  season?: Season
}

export interface Bracket {
  id: string
  event_id: string
  round: number
  match_order: number
  participant_a_id: string | null
  participant_b_id: string | null
  winner_id: string | null
  next_bracket_id: string | null
  is_bye: boolean
  /** 'winners' | 'losers' | 'losers_final' | 'grand_final' | 'round_robin' | 'rr_pool_a' | 'rr_pool_b' | 'crossover_semi' | 'knockout_final' from DB */
  bracket_type?: string | null
}

export interface Match {
  id: string
  event_id: string
  bracket_id: string | null
  participant_a_id: string | null
  participant_b_id: string | null
  status: MatchStatus
  scheduled_at: string | null
  venue: string | null
  scored_by: string | null
  scoring_locked_by: string | null
  finalized_at: string | null
  /** Persisted game clock (basketball) — see migration 055. Null until a scorer starts the clock. */
  clock_seconds?: number | null
  clock_running?: boolean
  shot_clock_seconds?: number | null
  shot_clock_running?: boolean
  clock_updated_at?: string | null
  /** Independent of scoring_locked_by — see migration 057. Lets a different organizer run the clock. */
  clock_locked_by?: string | null
  clock_locked_at?: string | null
}

export interface MatchScore {
  id: string
  match_id: string
  participant_id: string
  sport: Sport
  q1?: number
  q2?: number
  q3?: number
  q4?: number
  ot?: number
  ot2?: number
  ot3?: number
  total?: number
  set1?: number
  set2?: number
  set3?: number
  set4?: number
  set5?: number
  sets_won?: number
  game1?: number
  game2?: number
  game3?: number
  game4?: number
  game5?: number
  game6?: number
  game7?: number
  games_won?: number
}

export interface ScoringAction {
  id: string
  match_id: string
  athlete_id: string | null
  action_type: string
  value: number
  quarter_or_set: number | null
  timestamp: string
  undone: boolean
}

export interface PlayerGameStats {
  id: string
  match_id: string
  athlete_id: string
  sport: Sport
  stats: Record<string, number>
}

export interface PlayerSeasonStats {
  id: string
  athlete_id: string
  season_id: string
  sport: Sport
  games_played: number
  stats: Record<string, number>
  updated_at: string
  athlete?: Athlete
}

export interface TeamSeasonStats {
  id: string
  team_id: string
  season_id: string
  wins: number
  losses: number
  stats: Record<string, number>
  updated_at: string
  team?: Team
}

export interface LeaderboardVisibility {
  id: string
  athlete_id: string
  season_id: string
  is_visible: boolean
}

export interface Insight {
  id: string
  entity_type: 'player' | 'team'
  entity_id: string
  sport: Sport
  season_id?: string | null
  insight_text: string
  insight_type: InsightType
  data: Record<string, unknown>
  created_at: string
  expires_at: string
}

export interface Announcement {
  id: string
  created_by: string
  type: AnnouncementType
  title: string
  body: string
  /** Auto-derived from type by DB trigger (emergency→critical, reschedule→high, system→low, reminder→normal). */
  urgency: AnnouncementUrgency
  audience_type: AudienceType
  audience_id: string | null
  /** Set when audience_type === 'sport'; holds the sport slug (basketball/volleyball/table-tennis). */
  audience_sport: string | null
  is_public: boolean
  linked_match_id: string | null
  new_scheduled_at: string | null
  new_venue: string | null
  display_mode: 'banner' | 'notification_only' | 'hero_slider'
  published_at: string
  expires_at: string | null
  creator?: Profile
}

export interface Notification {
  id: string
  recipient_id: string
  type: string
  title: string
  body: string
  data: Record<string, unknown>
  read: boolean
  hidden: boolean
  created_at: string
}

export interface AuditLog {
  id: string
  actor_id: string
  action: string
  entity_type: string
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
  actor?: Profile
}

export interface TeamCoach {
  id: string
  organizer_id: string
  team_id: string
  assigned_at: string
  organizer?: Organizer
  team?: Team
}
