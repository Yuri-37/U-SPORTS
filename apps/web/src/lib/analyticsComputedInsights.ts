/** Narratives derived from `player_season_stats` / `team_season_stats` aggregates (no raw match recomputation). */

export type AggregateInsightPart =
  { type: 'text'; value: string } | { type: 'link'; value: string; href: string }

export type AggregateInsight = {
  id: string
  tone: 'positive' | 'watch' | 'neutral'
  parts: AggregateInsightPart[]
}

/** Plain sentence for CSV / logs */
export function aggregateInsightPlainText(row: AggregateInsight): string {
  return row.parts.map((p) => p.value).join('')
}

export function buildSeasonAggregateInsights(
  sport: string,
  leaderboard: {
    id: string
    athlete_id: string
    games_played: number
    stats?: Record<string, number> | null
    kill_pct?: number | null
    athlete?: { profile?: { full_name?: string | null } | null } | null
  }[],
  teamStats: {
    id?: string
    team_id: string
    wins: number
    losses: number
    team?: { name?: string | null; sport?: string | null } | null
  }[],
): AggregateInsight[] {
  const out: AggregateInsight[] = []
  const MIN_GP_PLAYER = 1
  const MIN_GP_TEAM = 1

  const playerHref = (athleteId: string) => `/guest/athletes/${athleteId}`
  const teamHref = (teamId: string) => `/guest/teams/${teamId}`

  if (sport === 'basketball' && leaderboard.length > 0) {
    const qualifying = leaderboard.filter((p) => p.games_played >= MIN_GP_PLAYER)
    if (qualifying.length > 0) {
      const sorted = [...qualifying].sort(
        (a, b) =>
          (b.stats?.total_points ?? 0) / Math.max(1, b.games_played) -
          (a.stats?.total_points ?? 0) / Math.max(1, a.games_played),
      )
      const top = sorted[0]
      const name = top.athlete?.profile?.full_name ?? 'A scorer'
      const ppg = ((top.stats?.total_points ?? 0) / Math.max(1, top.games_played)).toFixed(1)
      if (top.games_played >= 3) {
        out.push({
          id: 'bb-ppg',
          tone: 'positive',
          parts: [
            { type: 'link', value: name, href: playerHref(top.athlete_id) },
            {
              type: 'text',
              value: ` leads qualifying volume scorers at ${ppg} PPG (${top.games_played} games logged).`,
            },
          ],
        })
      } else {
        out.push({
          id: 'bb-ppg-small',
          tone: 'neutral',
          parts: [
            { type: 'link', value: name, href: playerHref(top.athlete_id) },
            {
              type: 'text',
              value: ` leads scoring so far at ${ppg} PPG (${top.games_played} game${top.games_played > 1 ? 's' : ''} logged).`,
            },
          ],
        })
      }
    }

    const iron = [...leaderboard].sort((a, b) => b.games_played - a.games_played)[0]
    if (iron && iron.games_played >= 2) {
      const nm = iron.athlete?.profile?.full_name ?? 'One athlete'
      out.push({
        id: 'bb-gp',
        tone: 'neutral',
        parts: [
          { type: 'link', value: nm, href: playerHref(iron.athlete_id) },
          { type: 'text', value: ` has the most games logged (${iron.games_played} GP).` },
        ],
      })
    }

    const glass = [...leaderboard]
      .filter((p) => p.games_played >= MIN_GP_PLAYER)
      .sort(
        (a, b) =>
          (b.stats?.total_rebounds ?? 0) / Math.max(1, b.games_played) -
          (a.stats?.total_rebounds ?? 0) / Math.max(1, a.games_played),
      )[0]
    if (glass) {
      const rpg = ((glass.stats?.total_rebounds ?? 0) / Math.max(1, glass.games_played)).toFixed(1)
      const nm = glass.athlete?.profile?.full_name ?? 'A rebounder'
      out.push({
        id: 'bb-reb',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(glass.athlete_id) },
          { type: 'text', value: ` leads rebounding at ${rpg} RPG (${glass.games_played} GP).` },
        ],
      })
    }
  }

  if (sport === 'volleyball' && leaderboard.length > 0) {
    const qualifying = leaderboard.filter((p) => p.games_played >= MIN_GP_PLAYER)
    if (qualifying.length > 0) {
      const byKills = [...qualifying].sort(
        (a, b) => (b.stats?.kills ?? 0) - (a.stats?.kills ?? 0),
      )[0]
      const nm = byKills.athlete?.profile?.full_name ?? 'An attacker'
      out.push({
        id: 'vb-kills',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(byKills.athlete_id) },
          {
            type: 'text',
            value: ` leads recorded kills (${byKills.stats?.kills ?? 0}) among logged athletes.`,
          },
        ],
      })
    }
    const byEff = [...leaderboard]
      .filter((p) => p.games_played >= MIN_GP_PLAYER && (p.stats?.kill_pct ?? p.kill_pct ?? 0) > 0)
      .sort(
        (a, b) => (b.stats?.kill_pct ?? b.kill_pct ?? 0) - (a.stats?.kill_pct ?? a.kill_pct ?? 0),
      )[0]
    if (byEff) {
      const pct = byEff.stats?.kill_pct ?? byEff.kill_pct ?? 0
      const nm = byEff.athlete?.profile?.full_name ?? 'One hitter'
      out.push({
        id: 'vb-eff',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(byEff.athlete_id) },
          {
            type: 'text',
            value: ` holds the top kill efficiency among logged contributors (${pct}% kill rate).`,
          },
        ],
      })
    }
  }

  if (sport === 'table-tennis' && leaderboard.length > 0) {
    const qualifying = leaderboard.filter((p) => p.games_played >= MIN_GP_PLAYER)
    if (qualifying.length > 0) {
      const byW = [...qualifying].sort((a, b) => (b.stats?.mw ?? 0) - (a.stats?.mw ?? 0))[0]
      const nm = byW.athlete?.profile?.full_name ?? 'A competitor'
      out.push({
        id: 'tt-wins',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(byW.athlete_id) },
          { type: 'text', value: ` leads in recorded match wins (${byW.stats?.mw ?? 0}).` },
        ],
      })
    }
    const byPct = [...leaderboard]
      .filter((p) => p.games_played >= MIN_GP_PLAYER && Number(p.stats?.win_pct ?? 0) > 0)
      .sort((a, b) => Number(b.stats?.win_pct ?? 0) - Number(a.stats?.win_pct ?? 0))[0]
    if (byPct) {
      const nm = byPct.athlete?.profile?.full_name ?? 'One player'
      out.push({
        id: 'tt-pct',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(byPct.athlete_id) },
          {
            type: 'text',
            value: ` owns the top win percentage (${byPct.stats?.win_pct ?? 0}% across ${byPct.games_played} GP).`,
          },
        ],
      })
    }
  }

  const teamsFiltered = teamStats.filter((t) => (t.team?.sport ?? sport) === sport)
  const rankedTeams = teamsFiltered
    .map((t) => {
      const gp = t.wins + t.losses
      const pct = gp > 0 ? t.wins / gp : 0
      return { ...t, gp, pct }
    })
    .filter((t) => t.gp >= MIN_GP_TEAM)
    .sort((a, b) => b.pct - a.pct)

  if (rankedTeams.length > 0) {
    const best = rankedTeams[0]
    const tname = best.team?.name ?? 'A squad'
    out.push({
      id: 'team-winpct',
      tone: 'positive',
      parts: [
        { type: 'link', value: tname, href: teamHref(best.team_id) },
        {
          type: 'text',
          value: ` leads team win rate (${Math.round(best.pct * 100)}% over ${best.gp} match${best.gp > 1 ? 'es' : ''}).`,
        },
      ],
    })
  }

  const busiestTeam = [...teamsFiltered]
    .map((t) => ({ ...t, gp: t.wins + t.losses }))
    .sort((a, b) => b.gp - a.gp)[0]
  if (busiestTeam && busiestTeam.wins + busiestTeam.losses >= 2) {
    const gp = busiestTeam.wins + busiestTeam.losses
    const tname = busiestTeam.team?.name ?? 'One team'
    out.push({
      id: 'team-busy',
      tone: 'neutral',
      parts: [
        { type: 'link', value: tname, href: teamHref(busiestTeam.team_id) },
        { type: 'text', value: ` has played the most recorded fixtures (${gp} decisions).` },
      ],
    })
  }

  return out.slice(0, 8)
}
