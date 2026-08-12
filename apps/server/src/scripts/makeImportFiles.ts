/**
 * Generates a matching pair of import spreadsheets for testing the two
 * importers end to end, written to your Desktop:
 *
 *   athletes-import.xlsx  21 new athletes (none of them already in the DB)
 *   teams-import.xlsx     3 new teams that roster exactly those 21 athletes
 *
 * Run them in that order. The team importer never creates athletes -- it only
 * looks them up by student_id -- so importing teams first is itself a useful
 * negative test (every row should fail with "no athlete with student ID ...").
 *
 * Run from repo root: pnpm --filter server make:import-files
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import ExcelJS from 'exceljs'

type Sport = 'basketball' | 'volleyball' | 'table-tennis'

// Deliberately distinct from anything resetAndSeed.ts creates: different team
// names, and student IDs in a 2024- block rather than the seeded 2023- block.
const NEW_TEAMS: {
  team: string
  sport: Sport
  department: string
  squad: number
  active: number
}[] = [
  { team: 'SBMA Thunder', sport: 'basketball', department: 'SBMA', squad: 8, active: 5 },
  { team: 'SECA Voltage', sport: 'volleyball', department: 'SECA', squad: 9, active: 6 },
  { team: 'SHS Topspin', sport: 'table-tennis', department: 'SHS', squad: 4, active: 2 },
]

const FIRST = [
  'Rafael', 'Emilio', 'Nico', 'Dante', 'Ramon', 'Luis', 'Arjay', 'Kirby',
  'Migs', 'Teodoro', 'Vincent', 'Harold', 'Jomar', 'Kenneth', 'Rico',
  'Alden', 'Bernard', 'Chester', 'Darius', 'Ellis', 'Fidel',
]
const LAST = [
  'Batungbakal', 'Concepcion', 'Delos Reyes', 'Enriquez', 'Fajardo', 'Galang',
  'Hernandez', 'Ilagan', 'Javier', 'Katigbak', 'Legaspi', 'Macapagal',
  'Nacpil', 'Obispo', 'Padilla', 'Quiambao', 'Rosales', 'Sanchez',
  'Tanjuaquio', 'Ubaldo', 'Valdez',
]

const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
const COURSES = ['BSIT', 'BSCS', 'BSBA', 'BSA', 'BSN', 'BSCE', 'STEM', 'ABM']

const XLSX_MIME_EXT = '.xlsx'

async function main() {
  // On OneDrive-backed Windows profiles the visible Desktop is the redirected
  // OneDrive one, while ~/Desktop still exists but is not what the user sees.
  const candidates = [
    path.join(os.homedir(), 'OneDrive', 'Desktop'),
    path.join(os.homedir(), 'Desktop'),
  ]
  const outDir = candidates.find((d) => fs.existsSync(d)) ?? process.cwd()

  type Row = {
    team: string
    sport: Sport
    department: string
    studentId: string
    fullName: string
    lineup: 'active' | 'bench'
    yearLevel: string
    course: string
  }

  const rows: Row[] = []
  let i = 0
  for (const t of NEW_TEAMS) {
    for (let p = 0; p < t.squad; p++) {
      rows.push({
        team: t.team,
        sport: t.sport,
        department: t.department,
        studentId: `2024-${240100 + i}`,
        fullName: `${FIRST[i % FIRST.length]} ${LAST[(i * 5 + 2) % LAST.length]}`,
        lineup: p < t.active ? 'active' : 'bench',
        yearLevel: YEARS[i % YEARS.length],
        course: COURSES[i % COURSES.length],
      })
      i++
    }
  }

  // ── athletes-import.xlsx ────────────────────────────────────────────────
  // Columns mirror GET /students/import-template exactly. email and password
  // are left blank on purpose so the importer auto-generates them, which is
  // the path most people will actually use.
  {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'U-Sports'
    const ws = wb.addWorksheet('Athletes')
    ws.columns = [
      { header: 'full_name', key: 'full_name', width: 26 },
      { header: 'student_id', key: 'student_id', width: 16 },
      { header: 'department', key: 'department', width: 14 },
      { header: 'sport', key: 'sport', width: 16 },
      { header: 'year_level', key: 'year_level', width: 14 },
      { header: 'course', key: 'course', width: 14 },
      { header: 'email', key: 'email', width: 32 },
      { header: 'password', key: 'password', width: 22 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getColumn('student_id').numFmt = '@'

    for (const r of rows) {
      ws.addRow({
        full_name: r.fullName,
        student_id: r.studentId,
        department: r.department,
        sport: r.sport,
        year_level: r.yearLevel,
        course: r.course,
        email: '',
        password: '',
      })
    }

    for (let row = 2; row <= rows.length + 1; row++) {
      ws.getCell(`C${row}`).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"SBMA,SECA,SASE,SHS"'],
        showErrorMessage: true, errorTitle: 'Invalid department',
        error: 'Choose SBMA, SECA, SASE, or SHS.',
      }
      ws.getCell(`D${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"basketball,volleyball,table-tennis"'],
        showErrorMessage: true, errorTitle: 'Invalid sport',
        error: 'Choose basketball, volleyball, or table-tennis.',
      }
    }

    const out = path.join(outDir, `athletes-import${XLSX_MIME_EXT}`)
    await wb.xlsx.writeFile(out)
    console.log(`athletes-import.xlsx  ${rows.length} athletes  ->  ${out}`)
  }

  // ── teams-import.xlsx ───────────────────────────────────────────────────
  // Columns mirror GET /teams/import-template exactly: one row per player,
  // team_name repeated to group a squad.
  {
    const wb = new ExcelJS.Workbook()
    wb.creator = 'U-Sports'
    const ws = wb.addWorksheet('Teams')
    ws.columns = [
      { header: 'team_name', key: 'team_name', width: 24 },
      { header: 'sport', key: 'sport', width: 16 },
      { header: 'department', key: 'department', width: 14 },
      { header: 'student_id', key: 'student_id', width: 16 },
      { header: 'full_name', key: 'full_name', width: 26 },
      { header: 'lineup', key: 'lineup', width: 12 },
    ]
    ws.getRow(1).font = { bold: true }
    ws.getColumn('student_id').numFmt = '@'

    for (const r of rows) {
      ws.addRow({
        team_name: r.team,
        sport: r.sport,
        department: r.department,
        student_id: r.studentId,
        full_name: r.fullName,
        lineup: r.lineup,
      })
    }

    for (let row = 2; row <= rows.length + 1; row++) {
      ws.getCell(`B${row}`).dataValidation = {
        type: 'list', allowBlank: false, formulae: ['"basketball,volleyball,table-tennis"'],
        showErrorMessage: true, errorTitle: 'Invalid sport',
        error: 'Choose basketball, volleyball, or table-tennis.',
      }
      ws.getCell(`C${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"SBMA,SECA,SASE,SHS"'],
        showErrorMessage: true, errorTitle: 'Invalid department',
        error: 'Choose SBMA, SECA, SASE, or SHS.',
      }
      ws.getCell(`F${row}`).dataValidation = {
        type: 'list', allowBlank: true, formulae: ['"active,bench"'],
        showErrorMessage: true, errorTitle: 'Invalid lineup',
        error: 'Choose active or bench.',
      }
    }

    const out = path.join(outDir, `teams-import${XLSX_MIME_EXT}`)
    await wb.xlsx.writeFile(out)
    console.log(`teams-import.xlsx     ${NEW_TEAMS.length} teams / ${rows.length} rows  ->  ${out}`)
  }

  console.log('\nTeams in teams-import.xlsx:')
  for (const t of NEW_TEAMS) {
    console.log(`  ${t.team.padEnd(16)} ${t.sport.padEnd(13)} ${t.squad} players (${t.active} active, ${t.squad - t.active} bench)`)
  }
  console.log('\nImport athletes-import.xlsx FIRST, then teams-import.xlsx.')
  console.log(`Logins are auto-generated: <student_id>@students.nu-dasma.edu.ph / UrSports-<student_id>-2026!\n`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
