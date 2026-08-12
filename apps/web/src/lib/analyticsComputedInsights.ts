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
    // kill_pct is not a stored key — recompute_player_season_stats only sums
    // raw counters — so derive it from kills/attacks the same way the
    // leaderboard column does.
    const killPct = (p: (typeof leaderboard)[number]) => {
      const attacks = p.stats?.attacks ?? 0
      if (attacks <= 0) return 0
      return Math.round(((p.stats?.kills ?? 0) / attacks) * 100)
    }
    const byEff = [...leaderboard]
      .filter((p) => p.games_played >= MIN_GP_PLAYER && killPct(p) > 0)
      .sort((a, b) => killPct(b) - killPct(a))[0]
    if (byEff) {
      const pct = killPct(byEff)
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
    // Built on winners/errors/points, which scoring actually logs. This block
    // previously ranked on `mw` and `win_pct` — neither is ever written, so
    // both insights were unreachable and table tennis produced none at all.
    const qualifying = leaderboard.filter((p) => p.games_played >= MIN_GP_PLAYER)
    if (qualifying.length > 0) {
      const byWinners = [...qualifying].sort(
        (a, b) => (b.stats?.winners ?? 0) - (a.stats?.winners ?? 0),
      )[0]
      if ((byWinners.stats?.winners ?? 0) > 0) {
        const nm = byWinners.athlete?.profile?.full_name ?? 'A competitor'
        out.push({
          id: 'tt-winners',
          tone: 'positive',
          parts: [
            { type: 'link', value: nm, href: playerHref(byWinners.athlete_id) },
            {
              type: 'text',
              value: ` leads in winners (${byWinners.stats?.winners ?? 0} across ${byWinners.games_played} GP).`,
            },
          ],
        })
      }
    }
    // Winners-per-error: the cleanest available read on shot discipline.
    const we = (p: (typeof leaderboard)[number]) => {
      const errors = p.stats?.errors ?? 0
      const winners = p.stats?.winners ?? 0
      if (errors <= 0) return winners
      return winners / errors
    }
    const byRatio = [...leaderboard]
      .filter((p) => p.games_played >= MIN_GP_PLAYER && we(p) > 0)
      .sort((a, b) => we(b) - we(a))[0]
    if (byRatio) {
      const nm = byRatio.athlete?.profile?.full_name ?? 'One player'
      out.push({
        id: 'tt-we',
        tone: 'positive',
        parts: [
          { type: 'link', value: nm, href: playerHref(byRatio.athlete_id) },
          {
            type: 'text',
            value: ` has the best winners-to-errors ratio (${we(byRatio).toFixed(1)}).`,
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
