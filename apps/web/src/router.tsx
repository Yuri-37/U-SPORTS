import React from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import App from './App'

// Layouts (small, always needed — kept eager)
import AppLayout from './components/layout/AppLayout'
import RootRedirect from './components/RootRedirect'
import GuestLayout from './components/layout/GuestLayout'

// Errors (must render even if a lazy chunk fails to load — kept eager)
import RouteErrorPage from './pages/error/RouteErrorPage'

// Auth
const LoginPage = React.lazy(() => import('./pages/auth/LoginPage'))
const ForgotPasswordPage = React.lazy(() => import('./pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = React.lazy(() => import('./pages/auth/ResetPasswordPage'))
const AcceptInvitePage = React.lazy(() => import('./pages/auth/AcceptInvitePage'))
const PrivacyNoticePage = React.lazy(() => import('./pages/PrivacyNoticePage'))

// Super Admin
const SuperAdminLoginPage = React.lazy(() => import('./pages/super-admin/SuperAdminLoginPage'))
const SuperAdminDashboard = React.lazy(() => import('./pages/super-admin/Dashboard'))
const SuperAdminOrganizers = React.lazy(() => import('./pages/super-admin/Organizers'))
const SuperAdminSeasons = React.lazy(() => import('./pages/super-admin/Seasons'))
const SuperAdminSettings = React.lazy(() => import('./pages/super-admin/Settings'))
const SuperAdminPreferences = React.lazy(() => import('./pages/super-admin/Preferences'))
const SuperAdminAudit = React.lazy(() => import('./pages/super-admin/AuditLogs'))

// Organizer
const OrganizerDashboard = React.lazy(() => import('./pages/organizer/Dashboard'))
const OrganizerEvents = React.lazy(() => import('./pages/organizer/Events'))
const OrganizerEventDetail = React.lazy(() => import('./pages/organizer/EventDetail'))
const OrganizerAthletes = React.lazy(() => import('./pages/organizer/Athletes'))
const OrganizerTeams = React.lazy(() => import('./pages/organizer/Teams'))
const OrganizerSeasons = React.lazy(() => import('./pages/organizer/Seasons'))
const OrganizerScoring = React.lazy(() => import('./pages/organizer/Scoring'))
const MatchReview = React.lazy(() => import('./pages/organizer/MatchReview'))
const ScoreSheet = React.lazy(() => import('./pages/organizer/ScoreSheet'))
const OrganizerAnalytics = React.lazy(() => import('./pages/organizer/Analytics'))
const OrganizerAnnouncements = React.lazy(() => import('./pages/organizer/Announcements'))
const OrganizerSettings = React.lazy(() => import('./pages/organizer/Settings'))

// Athlete
const AthleteDashboard = React.lazy(() => import('./pages/athlete/Dashboard'))
const AthleteEventDetail = React.lazy(() => import('./pages/athlete/EventDetail'))
const AthleteProfile = React.lazy(() => import('./pages/athlete/Profile'))
const AthleteEvents = React.lazy(() => import('./pages/athlete/Events'))
const AthleteNotifications = React.lazy(() => import('./pages/athlete/Notifications'))
const AthleteSettings = React.lazy(() => import('./pages/athlete/Settings'))

// Guest
const GuestHub = React.lazy(() => import('./pages/guest/Hub'))
const GuestLeaderboards = React.lazy(() => import('./pages/guest/Leaderboards'))
const GuestEvents = React.lazy(() => import('./pages/guest/Events'))
const GuestEventDetail = React.lazy(() => import('./pages/guest/EventDetail'))
const GuestAthleteProfile = React.lazy(() => import('./pages/guest/AthleteProfile'))
const GuestTeamDetail = React.lazy(() => import('./pages/guest/TeamDetail'))

// Jumbotron
const JumbotronPage = React.lazy(() => import('./pages/jumbotron/JumbotronPage'))

const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <RootRedirect /> },

      // Auth
      { path: 'auth/login', element: <LoginPage /> },
      { path: 'auth/forgot-password', element: <ForgotPasswordPage /> },
      { path: 'auth/reset-password', element: <ResetPasswordPage /> },
      { path: 'auth/accept-invite', element: <AcceptInvitePage /> },
      { path: 'privacy-notice', element: <PrivacyNoticePage /> },

      // Jumbotron (no auth, no layout)
      { path: 'jumbotron/:matchId', element: <JumbotronPage /> },

      // Super Admin login (no layout, public)
      { path: 'super-admin/login', element: <SuperAdminLoginPage /> },

      // Guest (public layout)
      {
        element: <GuestLayout />,
        children: [
          { path: 'guest', element: <GuestHub /> },
          { path: 'guest/leaderboards', element: <GuestLeaderboards /> },
          { path: 'guest/events', element: <GuestEvents /> },
          { path: 'guest/events/:id', element: <GuestEventDetail /> },
          { path: 'guest/athletes/:id', element: <GuestAthleteProfile /> },
          { path: 'guest/teams/:id', element: <GuestTeamDetail /> },
          { path: 'student', element: <Navigate to="/guest" replace /> },
        ],
      },

      // App layout (sidebar + topnav)
      {
        element: <AppLayout />,
        children: [
          // Super Admin
          { path: 'super-admin', element: <SuperAdminDashboard /> },
          { path: 'super-admin/organizers', element: <SuperAdminOrganizers /> },
          { path: 'super-admin/seasons', element: <SuperAdminSeasons /> },
          { path: 'super-admin/settings', element: <SuperAdminSettings /> },
          { path: 'super-admin/preferences', element: <SuperAdminPreferences /> },
          { path: 'super-admin/audit', element: <SuperAdminAudit /> },

          // Organizer
          { path: 'organizer', element: <OrganizerDashboard /> },
          { path: 'organizer/events', element: <OrganizerEvents /> },
          { path: 'organizer/events/:id', element: <OrganizerEventDetail /> },

          { path: 'organizer/athletes', element: <OrganizerAthletes /> },
          { path: 'organizer/teams', element: <OrganizerTeams /> },
          { path: 'organizer/seasons', element: <OrganizerSeasons /> },
          { path: 'organizer/scoring/:matchId', element: <OrganizerScoring /> },
          { path: 'organizer/match-review/:matchId', element: <MatchReview /> },
          { path: 'organizer/match-review/:matchId/score-sheet', element: <ScoreSheet /> },
          { path: 'organizer/analytics', element: <OrganizerAnalytics /> },
          { path: 'organizer/announcements', element: <OrganizerAnnouncements /> },
          { path: 'organizer/settings', element: <OrganizerSettings /> },

          // Athlete
          { path: 'athlete', element: <AthleteDashboard /> },
          { path: 'athlete/events/:id', element: <AthleteEventDetail /> },
          { path: 'athlete/profile', element: <AthleteProfile /> },
          { path: 'athlete/events', element: <AthleteEvents /> },
          { path: 'athlete/notifications', element: <AthleteNotifications /> },
          { path: 'athlete/settings', element: <AthleteSettings /> },
        ],
      },
    ],
  },
])

export default router
