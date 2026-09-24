// Builds FUNCTIONAL_NON_FUNCTIONAL_TESTING.docx.
//
// The test-case tables follow the Form J1 "Sample Test Case Result" template
// exactly: landscape, plain black-ruled cells, a Test Specification block above
// the table, and the eight columns Test Case # / Description / Test Steps /
// Test Data / Expected Results / Actual Results / Pass-Fail / Performed by-Date.
//
// The surrounding sections follow the Appendix F reference, which shows what a
// finished test document contains.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { generalModules, webModules, mobileModules } from './content-modules.mjs'
import { webTests, mobileTests } from './content-tests.mjs'
import {
  testEnvironment, browserCompatibility, androidCompatibility,
  securityHeaders, secureCoding, defects, recommendations, scopeNote,
} from './content-nfr.mjs'

const require = createRequire(import.meta.url)
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun,
  WidthType, AlignmentType, BorderStyle, PageOrientation, Header, Footer,
  VerticalAlign, TableLayoutType,
} = require('docx')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = path.join(ROOT, 'screenshots')
const OUTDIR = path.resolve(ROOT, '..', '..')

const PROJECT = 'U-Sports: University Sports Management Platform'
const NAVY = '1F3864'
const BAND = '203864'
const RULE = '2E74B5'
const SANS = 'Arial'
const SERIF = 'Times New Roman'
const C = AlignmentType.CENTER

// Portrait Letter for the Appendix-F style sections, landscape for Form J1.
const P_W = 12240, P_H = 15840, P_MARGIN = 1000
const P_USABLE = P_W - P_MARGIN * 2            // 10240
const L_MARGIN = 700
const L_USABLE = P_H - L_MARGIN * 2            // 14440 (page is 15840 wide in landscape)

const px = (file) => {
  const b = fs.readFileSync(file)
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}
const fit = (file, boxW, boxH) => {
  const { w, h } = px(file)
  const s = Math.min(boxW / w, boxH / h)
  return { width: Math.round(w * s), height: Math.round(h * s) }
}

// ── text ─────────────────────────────────────────────────────────────────────
const run = (text, o = {}) => new TextRun({
  text: String(text), font: o.font ?? SANS, size: o.size ?? 18,
  bold: o.bold, italics: o.italics, color: o.color,
})
const p = (text, o = {}) => new Paragraph({
  children: Array.isArray(text) ? text : [run(text, o)],
  alignment: o.align,
  spacing: { before: o.before ?? 0, after: o.after ?? 40 },
})
const blank = (after = 120) => new Paragraph({ children: [run('')], spacing: { after } })
const pageBreak = () => new Paragraph({ children: [], pageBreakBefore: true })

const sectionTitle = text => new Paragraph({
  children: [run(text, { bold: true, size: 20 })],
  spacing: { before: 200, after: 180 },
})

// ── table primitives ─────────────────────────────────────────────────────────
const cell = (children, o = {}) => new TableCell({
  children: Array.isArray(children) ? children : [children],
  width: o.width ? { size: o.width, type: WidthType.DXA } : undefined,
  shading: o.fill ? { fill: o.fill, val: 'clear', color: 'auto' } : undefined,
  columnSpan: o.span,
  rowSpan: o.rowSpan,
  verticalAlign: o.valign ?? VerticalAlign.CENTER,
  margins: { top: 40, bottom: 40, left: 70, right: 70 },
})
/** Navy header cell — used by the Appendix-F style tables. */
const th = (text, width, o = {}) => cell(
  p(text, { bold: true, color: 'FFFFFF', size: o.size ?? 16, align: C }),
  { width, fill: NAVY, span: o.span, rowSpan: o.rowSpan },
)
/** Plain header cell — used by the Form J1 test-case tables. */
const thPlain = (text, width, o = {}) => cell(
  p(text, { bold: true, size: o.size ?? 16, align: C }),
  { width, span: o.span, rowSpan: o.rowSpan },
)
const td = (text, width, o = {}) => cell(
  p(text, { size: o.size ?? 15, align: o.align, bold: o.bold }),
  { width, fill: o.fill, valign: o.valign ?? VerticalAlign.TOP, span: o.span, rowSpan: o.rowSpan },
)
const bandRow = (label, widths) => new TableRow({
  children: [cell(p(label, { bold: true, color: 'FFFFFF', size: 16 }), { span: widths.length, fill: BAND })],
})

const table = (rows, widths) => new Table({
  rows,
  width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
  columnWidths: widths,
  layout: TableLayoutType.FIXED,
  alignment: C,
  borders: {
    top: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '000000' },
  },
})

const steps = items => items.map((t, i) => new Paragraph({
  children: [run(`${i + 1}.  ${t}`, { size: 15 })],
  spacing: { after: 40 },
}))
const dashed = items => items.map(t => new Paragraph({
  children: [run(`-  ${t}`, { size: 15 })],
  spacing: { after: 40 },
}))

// ── running header / footer (Appendix F style) ───────────────────────────────
const logoPath = path.join(ROOT, '..', '..', 'apps', 'web', 'public', 'apple-touch-icon.png')
const docHeader = () => new Header({
  children: [
    new Paragraph({
      alignment: C, spacing: { after: 20 },
      children: [
        ...(fs.existsSync(logoPath) ? [new ImageRun({
          type: 'png', data: fs.readFileSync(logoPath), transformation: { width: 20, height: 20 },
        }), run(' ')] : []),
        run('NU DASMARIÑAS', { bold: true, size: 26, color: NAVY }),
      ],
    }),
    p('COMPUTING AND INFORMATION TECHNOLOGY', { bold: true, size: 18, color: NAVY, font: SERIF, align: C, after: 0 }),
    p('CAPSTONE PROJECT 2', { bold: true, size: 18, color: NAVY, font: SERIF, align: C, after: 40 }),
    new Paragraph({
      spacing: { after: 60 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 1 } },
      children: [run('')],
    }),
  ],
})
const docFooter = () => new Footer({
  children: [
    new Paragraph({
      border: { top: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 1 } },
      children: [run('')], spacing: { after: 40 },
    }),
    p(PROJECT, { size: 15 }),
  ],
})

// ── FUNCTIONALITY TESTING (Appendix F) ───────────────────────────────────────
const FN_W = [900, 2500, 2200, 4640]
function functionalityTable() {
  const rows = [new TableRow({
    tableHeader: true,
    children: [th('Module No.', FN_W[0]), th('Module Name', FN_W[1]), th('Function Name', FN_W[2]), th('Description', FN_W[3])],
  })]
  const group = (label, groups) => {
    rows.push(bandRow(label, FN_W))
    for (const [no, name, fns] of groups) {
      fns.forEach(([fn, desc], i) => {
        rows.push(new TableRow({
          children: [
            ...(i === 0 ? [
              td(no, FN_W[0], { align: C, bold: true, rowSpan: fns.length, valign: VerticalAlign.CENTER }),
              td(name, FN_W[1], { bold: true, align: C, rowSpan: fns.length, valign: VerticalAlign.CENTER }),
            ] : []),
            td(fn, FN_W[2]),
            td(desc, FN_W[3]),
          ],
        }))
      })
    }
  }
  group('GENERAL MODULES (WEB AND MOBILE APPLICATION)', generalModules)
  group('WEB APPLICATION SYSTEM', webModules)
  group('MOBILE APPLICATION SYSTEM', mobileModules)
  return table(rows, FN_W)
}

// ── Summary of Results (Appendix F) ──────────────────────────────────────────
const MODULE_LABELS = {
  W1: 'Public Hub and Guest Browsing', W2: 'Login / Authentication', W3: 'Data Privacy Notice',
  W4: 'Super Admin Management', W5: 'Organizer Management', W6: 'Scoring and Match Records',
  W7: 'Coach Access', W8: 'Athlete Access',
  M9: 'Guest Browsing', M10: 'Login / Authentication', M11: 'Coach — My Teams', M12: 'Athlete Access',
}
const SUM_W = [900, 2700, 1000, 3040, 2600]
function summaryTable() {
  const rows = [new TableRow({
    tableHeader: true,
    children: [th('Module No.', SUM_W[0]), th('Module Name', SUM_W[1]), th('Test Code', SUM_W[2]),
      th('Function Name', SUM_W[3]), th('Remark / Status', SUM_W[4])],
  })]
  const group = (label, list, sys) => {
    rows.push(bandRow(label, SUM_W))
    const byModule = new Map()
    for (const t of list) {
      const mod = t.id.split('-')[0]
      if (!byModule.has(mod)) byModule.set(mod, [])
      byModule.get(mod).push(t)
    }
    let code = 0
    let moduleNo = 0
    for (const [mod, cases] of byModule) {
      moduleNo += 1
      cases.forEach((t, i) => {
        code += 1
        const failed = t.result === 'Fail'
        rows.push(new TableRow({
          children: [
            ...(i === 0 ? [
              td(String(moduleNo), SUM_W[0], { align: C, bold: true, rowSpan: cases.length, valign: VerticalAlign.CENTER }),
              td(MODULE_LABELS[sys + mod] ?? '', SUM_W[1], { align: C, rowSpan: cases.length, valign: VerticalAlign.CENTER }),
            ] : []),
            td(String(code).padStart(3, '0'), SUM_W[2], { align: C }),
            td(t.description.replace(/^Verify (that )?/i, '').replace(/\.$/, '').replace(/^./, c => c.toUpperCase()), SUM_W[3]),
            cell([
              p(failed ? 'FAILED' : 'PASSED', { bold: true, size: 15, align: C, color: failed ? 'C00000' : '000000' }),
              ...(t.note ? [p(t.note, { size: 13, italics: true, align: C })] : []),
            ], { width: SUM_W[4] }),
          ],
        }))
      })
    }
  }
  group('WEB APPLICATION SYSTEM', webTests, 'W')
  group('MOBILE APPLICATION SYSTEM', mobileTests, 'M')
  return table(rows, SUM_W)
}

// ── Form J1 test script ──────────────────────────────────────────────────────
// Columns follow the Form J1 sample exactly.
const TS_W = [900, 1700, 2600, 1200, 3200, 2600, 900, 1340]   // 14440

function specBlock(num, moduleLines, objectives, platformLines) {
  const W = [6500, 7940]
  const labelled = (label, lines) => [
    p(label, { bold: true, size: 17 }),
    ...lines.map(l => p(l, { bold: true, size: 17 })),
  ]
  return table([
    new TableRow({ children: [cell(p(`Test Specification - ${num}`, { bold: true, size: 17 }), { span: 2, valign: VerticalAlign.TOP })] }),
    new TableRow({
      children: [
        cell(labelled('Designed by:', ['Dacuba, Yuri Gabriel C.', 'Parco, Mark Christian P.', 'Rodriguez, Robin Kris P.']), { width: W[0], valign: VerticalAlign.TOP }),
        cell(labelled('Modules:', moduleLines), { width: W[1], valign: VerticalAlign.TOP }),
      ],
    }),
    new TableRow({
      children: [
        cell(labelled('Objectives:', [objectives]), { width: W[0], valign: VerticalAlign.TOP }),
        cell(labelled('Browser Platform:', platformLines), { width: W[1], valign: VerticalAlign.TOP }),
      ],
    }),
  ], W)
}

function testScriptTable(list) {
  const rows = [new TableRow({
    tableHeader: true,
    children: [
      thPlain('Test\nCase\n#', TS_W[0]), thPlain('Description', TS_W[1]), thPlain('Test Steps', TS_W[2]),
      thPlain('Test\nData', TS_W[3]), thPlain('Expected Results', TS_W[4]), thPlain('Actual\nResults', TS_W[5]),
      thPlain('Pass/\nFail', TS_W[6]), thPlain('Performed\nby /\nDate', TS_W[7]),
    ],
  })]
  for (const t of list) {
    const shot = path.join(SHOTS, t.shot)
    const imgPara = fs.existsSync(shot)
      ? new Paragraph({
        alignment: C, spacing: { after: 20 },
        children: [new ImageRun({ type: 'png', data: fs.readFileSync(shot), transformation: fit(shot, 118, 260) })],
      })
      : p('[screenshot missing]', { size: 13, italics: true })
    const pass = t.result !== 'Fail'
    rows.push(new TableRow({
      children: [
        td(t.id, TS_W[0], { align: C, valign: VerticalAlign.TOP }),
        td(t.description, TS_W[1], { size: 15 }),
        cell(steps(t.steps), { width: TS_W[2], valign: VerticalAlign.TOP }),
        td(t.data, TS_W[3], { size: 15 }),
        cell(dashed(t.expected), { width: TS_W[4], valign: VerticalAlign.TOP }),
        cell([imgPara], { width: TS_W[5] }),
        cell(p(pass ? 'Pass' : 'Fail', { bold: true, size: 16, align: C, color: pass ? '000000' : 'C00000' }), { width: TS_W[6] }),
        cell([p(t.by, { size: 14, align: C }), p(t.on, { size: 14, align: C })], { width: TS_W[7] }),
      ],
    }))
  }
  return table(rows, TS_W)
}

// ── NON-FUNCTIONAL REQUIREMENT TESTING (Appendix F) ──────────────────────────
function loadLighthouse() {
  const dir = path.join(process.env.TEMP, 'usports-test', 'lh')
  const labels = {
    '01-landing-guest-hub': 'Public Hub (Landing Page)',
    '02-login-page': 'Login Page',
    '03-guest-standings': 'Standings (Guest)',
    '04-guest-events': 'Events (Guest)',
    '05-athlete-dashboard': 'Home Page (Athlete)',
    '06-athlete-profile': 'Athlete Profile',
    '07-organizer-dashboard': 'Home Page (Organizer)',
    '08-organizer-events': 'Event Management Module',
    '09-organizer-athletes': 'Athlete Account Module',
    '10-organizer-teams': 'Team Management Module',
    '11-organizer-analytics': 'Analytics Module',
    '12-organizer-announcements': 'Announcement Module',
    '13-live-scoring': 'Live Scoring Module',
    '14-superadmin-dashboard': 'Home Page (Super Admin)',
    '15-superadmin-staff': 'Staff Account Module',
    '16-superadmin-audit': 'Audit Log Module',
    '17-help-center': 'Help Center',
  }
  const out = []
  for (const [key, label] of Object.entries(labels)) {
    const runs = []
    for (const suffix of ['', '-r2', '-r3']) {
      const f = path.join(dir, `${key}${suffix}.json`)
      if (!fs.existsSync(f)) continue
      const r = JSON.parse(fs.readFileSync(f, 'utf8'))
      const c = r.categories, a = r.audits
      runs.push({
        perf: Math.round(c.performance.score * 100),
        a11y: Math.round(c.accessibility.score * 100),
        bp: Math.round(c['best-practices'].score * 100),
        seo: Math.round(c.seo.score * 100),
        lcp: a['largest-contentful-paint'].numericValue / 1000,
        tbt: a['total-blocking-time'].numericValue,
        cls: a['cumulative-layout-shift'].numericValue,
      })
    }
    if (runs.length) out.push({ key, label, runs })
  }
  return out
}
const avg = (runs, k) => runs.reduce((a, r) => a + r[k], 0) / runs.length
const f1 = n => (Math.round(n * 100) / 100).toString()
const f2 = n => n.toFixed(2)

const NFR_W = [2340, 1200, 1250, 1250, 1000, 1080, 1060, 1060]
function vitalsHeader(w, firstLabel) {
  return [
    new TableRow({
      tableHeader: true,
      children: [
        th(firstLabel, w[0], { rowSpan: 2 }), th('Performance Score', w[1], { rowSpan: 2 }),
        th('Accessibility Score', w[2], { rowSpan: 2 }), th('Best Practices Score', w[3], { rowSpan: 2 }),
        th('SEO Score', w[4], { rowSpan: 2 }), th('WEB VITALS', w[5] + w[6] + w[7], { span: 3 }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      children: [th('LCP (sec)', w[5]), th('TBT (ms)', w[6]), th('CLS', w[7])],
    }),
  ]
}
function nfrSummaryTable(data) {
  const rows = [
    new TableRow({ children: [cell(p('OVERALL AVERAGE', { bold: true, color: 'FFFFFF', size: 17, align: C }), { span: 8, fill: BAND })] }),
    ...vitalsHeader(NFR_W, 'Module Name'),
  ]
  for (const d of data) {
    rows.push(new TableRow({
      children: [
        td(d.label, NFR_W[0], { size: 14 }),
        td(f1(avg(d.runs, 'perf')), NFR_W[1], { align: C }),
        td(f1(avg(d.runs, 'a11y')), NFR_W[2], { align: C }),
        td(f1(avg(d.runs, 'bp')), NFR_W[3], { align: C }),
        td(f1(avg(d.runs, 'seo')), NFR_W[4], { align: C }),
        td(f2(avg(d.runs, 'lcp')) + 's', NFR_W[5], { align: C }),
        td(Math.round(avg(d.runs, 'tbt')) + 'ms', NFR_W[6], { align: C }),
        td(f2(avg(d.runs, 'cls')), NFR_W[7], { align: C }),
      ],
    }))
  }
  return table(rows, NFR_W)
}
function perModuleRunTables(data) {
  const out = []
  for (const d of data) {
    const rows = [
      new TableRow({
        children: [
          cell(p('Module Name', { bold: true, color: 'FFFFFF', size: 16, align: C }), { width: NFR_W[0], fill: BAND }),
          cell(p(d.label, { bold: true, color: 'FFFFFF', size: 16 }), { span: 7, fill: BAND }),
        ],
      }),
      ...vitalsHeader(NFR_W, 'Run(s)'),
    ]
    d.runs.forEach((r, i) => {
      rows.push(new TableRow({
        children: [
          td(String(i + 1), NFR_W[0], { align: C, bold: true }),
          td(String(r.perf), NFR_W[1], { align: C }), td(String(r.a11y), NFR_W[2], { align: C }),
          td(String(r.bp), NFR_W[3], { align: C }), td(String(r.seo), NFR_W[4], { align: C }),
          td(f2(r.lcp) + 's', NFR_W[5], { align: C }), td(Math.round(r.tbt) + 'ms', NFR_W[6], { align: C }),
          td(f2(r.cls), NFR_W[7], { align: C }),
        ],
      }))
    })
    rows.push(new TableRow({
      children: [
        cell(p('Overall Mean', { bold: true, color: 'FFFFFF', size: 15, align: C }), { width: NFR_W[0], fill: BAND }),
        ...['perf', 'a11y', 'bp', 'seo'].map((k, i) =>
          cell(p(f1(avg(d.runs, k)), { bold: true, color: 'FFFFFF', size: 15, align: C }), { width: NFR_W[i + 1], fill: BAND })),
        cell(p(f2(avg(d.runs, 'lcp')) + 's', { bold: true, color: 'FFFFFF', size: 15, align: C }), { width: NFR_W[5], fill: BAND }),
        cell(p(Math.round(avg(d.runs, 'tbt')) + 'ms', { bold: true, color: 'FFFFFF', size: 15, align: C }), { width: NFR_W[6], fill: BAND }),
        cell(p(f2(avg(d.runs, 'cls')), { bold: true, color: 'FFFFFF', size: 15, align: C }), { width: NFR_W[7], fill: BAND }),
      ],
    }))
    out.push(table(rows, NFR_W))
    out.push(blank(180))
  }
  return out
}

// ── compatibility, security, secure coding (Appendix F) ──────────────────────
const COMPAT_W = [3400, 3400, 3440]
function compatTable(headers, groupName, rows) {
  const trs = [new TableRow({ tableHeader: true, children: headers.map((h, i) => th(h, COMPAT_W[i])) })]
  rows.forEach(([version, status], i) => {
    trs.push(new TableRow({
      children: [
        ...(i === 0 ? [cell(p(groupName, { size: 15, align: C }), { width: COMPAT_W[0], rowSpan: rows.length })] : []),
        td(version, COMPAT_W[1], { align: C }),
        td(status, COMPAT_W[2], { align: C }),
      ],
    }))
  })
  return table(trs, COMPAT_W)
}

const SEC_W = [3000, 1800, 5440]
function headerTable(rows) {
  const trs = [new TableRow({
    tableHeader: true,
    children: [th('Header', SEC_W[0]), th('Status', SEC_W[1]), th('Value Observed', SEC_W[2])],
  })]
  for (const [name, status, value] of rows) {
    trs.push(new TableRow({
      children: [
        td(name, SEC_W[0], { size: 14 }),
        td(status.toUpperCase(), SEC_W[1], { align: C, bold: true, size: 14 }),
        td(value, SEC_W[2], { size: 13 }),
      ],
    }))
  }
  return table(trs, SEC_W)
}

const SC_W = [4400, 5840]
function secureCodingTable() {
  const trs = [new TableRow({
    tableHeader: true,
    children: [th('Secure Coding Practices', SC_W[0]), th('Compliance Status', SC_W[1])],
  })]
  for (const [name, status] of secureCoding.rows) {
    trs.push(new TableRow({
      children: [td(name, SC_W[0], { size: 15 }), td(status.toUpperCase(), SC_W[1], { size: 15 })],
    }))
  }
  return table(trs, SC_W)
}

const DEF_W = [2200, 8040]
function defectTables() {
  const out = []
  for (const d of defects) {
    out.push(p(`${d.id}  —  ${d.title}`, { bold: true, size: 17, before: 200, after: 100 }))
    out.push(table([
      ['Severity', d.severity], ['Status', d.status], ['Area', d.area],
      ['Found in', d.found], ['Source file', d.file],
      ['What happens', d.description], ['Cause', d.cause], ['Resolution', d.fix],
    ].map(([k, v]) => new TableRow({
      children: [td(k, DEF_W[0], { bold: true, size: 14 }), td(v, DEF_W[1], { size: 14 })],
    })), DEF_W))
    out.push(blank(160))
  }
  return out
}

// ── assemble ─────────────────────────────────────────────────────────────────
const lh = loadLighthouse()
const runCount = lh.length ? lh[0].runs.length : 0
const allTests = [...webTests, ...mobileTests]
const passed = allTests.filter(t => t.result !== 'Fail').length
const failed = allTests.length - passed

const pageBorders = {
  pageBorderTop: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 24 },
  pageBorderBottom: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 24 },
  pageBorderLeft: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 24 },
  pageBorderRight: { style: BorderStyle.SINGLE, size: 8, color: RULE, space: 24 },
}
const portrait = children => ({
  properties: {
    page: {
      size: { orientation: PageOrientation.PORTRAIT, width: P_W, height: P_H },
      margin: { top: 1500, right: P_MARGIN, bottom: 1100, left: P_MARGIN, header: 400, footer: 400 },
      borders: pageBorders,
    },
  },
  headers: { default: docHeader() },
  footers: { default: docFooter() },
  children,
})
// docx swaps width/height when the orientation is landscape, so the portrait
// values are passed here on purpose.
const landscape = children => ({
  properties: {
    page: {
      size: { orientation: PageOrientation.LANDSCAPE, width: P_W, height: P_H },
      margin: { top: 1400, right: L_MARGIN, bottom: 900, left: L_MARGIN, header: 350, footer: 350 },
      borders: pageBorders,
    },
  },
  headers: { default: docHeader() },
  footers: { default: docFooter() },
  children,
})

const doc = new Document({
  creator: 'Dacuba, Parco, Rodriguez',
  title: 'U-Sports — Functional and Non-Functional Testing',
  description: 'Test documents for the U-Sports University Sports Management Platform',
  styles: { default: { document: { run: { font: SANS, size: 18 } } } },
  sections: [
    // Cover + front matter + functionality + summary
    portrait([
      blank(2800),
      p('FUNCTIONAL AND', { bold: true, size: 52, align: C, after: 0 }),
      p('NON-FUNCTIONAL TESTING', { bold: true, size: 52, align: C, after: 280 }),
      p('Test Documents', { size: 36, align: C, after: 220 }),
      p(PROJECT, { size: 22, align: C }),
      blank(2400),

      pageBreak(),
      sectionTitle('TEST ENVIRONMENT'),
      p('Every result and screenshot in this document was produced in the environment below.', { size: 16, after: 140 }),
      table(testEnvironment.map(([k, v]) => new TableRow({
        children: [td(k, 3400, { bold: true, size: 15 }), td(v, 6840, { size: 15 })],
      })), [3400, 6840]),
      blank(180),
      p('Scope of this test cycle', { bold: true, size: 17, after: 80 }),
      p(scopeNote, { size: 15 }),

      pageBreak(),
      sectionTitle('FUNCTIONALITY TESTING'),
      functionalityTable(),

      pageBreak(),
      sectionTitle('Summary of Results'),
      p(`${allTests.length} test cases were executed — ${webTests.length} on the web application and ${mobileTests.length} on the Android application. ${passed} passed and ${failed} failed.`, { size: 15, after: 140 }),
      summaryTable(),
    ]),

    // Form J1 test scripts (landscape)
    landscape([
      p('Test Script Document Identifier – TS01', { bold: true, size: 18, after: 140 }),
      specBlock('01',
        ['U-Sports Web Application System'],
        'Test basic functionality',
        ['Microsoft Edge (Version 153.0.4234.32)'],
      ),
      blank(180),
      testScriptTable(webTests),

      pageBreak(),
      p('Test Script Document Identifier – TS02', { bold: true, size: 18, after: 140 }),
      specBlock('02',
        ['U-Sports Mobile Application System (Android)'],
        'Test basic functionality',
        ['Emulator: Android 15 (API level 35), 1080 x 1920'],
      ),
      blank(180),
      testScriptTable(mobileTests),
    ]),

    // Non-functional and compliance (portrait)
    portrait([
      sectionTitle('NON-FUNCTIONAL REQUIREMENT TESTING'),
      p('Testing Tool: Lighthouse', { bold: true, size: 17, after: 100 }),
      p(`Each module was measured ${runCount} times; the tables below report every run and its mean. Authenticated modules were measured with a signed-in session for the role named.`, { size: 15, after: 160 }),
      p('Summary of the Efficiency, Reliability and Performance Test', { bold: true, size: 17, after: 120 }),
      nfrSummaryTable(lh),
      blank(220),
      ...perModuleRunTables(lh),

      pageBreak(),
      sectionTitle('SUPPORTABILITY / COMPATIBILITY'),
      compatTable(['Mobile Operating Systems', 'Version', 'Compatibility'], 'Android',
        androidCompatibility.rows.map(r => [r[1], r[2].split(' — ')[0]])),
      p(androidCompatibility.note, { size: 14, italics: true, before: 100, after: 240 }),
      compatTable(['Web Browser', 'Version', 'Compatibility'], 'Chromium-based',
        browserCompatibility.rows.map(r => [`${r[0]}${r[1] !== '—' ? ' ' + r[1] : ''}`, r[2].split(' — ')[0]])),
      p(browserCompatibility.note, { size: 14, italics: true, before: 100 }),

      pageBreak(),
      sectionTitle('SYSTEM COMPLIANCE (WEB SECURITY HEADERS)'),
      p('Assessment Summary Report — API', { bold: true, size: 17, after: 60 }),
      p(securityHeaders.api.host, { size: 14, italics: true, after: 120 }),
      headerTable(securityHeaders.api.rows),
      blank(220),
      p('Assessment Summary Report — Web Client', { bold: true, size: 17, after: 60 }),
      p(securityHeaders.web.host, { size: 14, italics: true, after: 120 }),
      headerTable(securityHeaders.web.rows),
      blank(180),
      p(securityHeaders.summary, { size: 15 }),

      pageBreak(),
      sectionTitle('WEB SECURE CODING PRACTICES'),
      p([run('Link: ', { bold: true, size: 15 }), run(secureCoding.link, { size: 15 })], { after: 140 }),
      secureCodingTable(),

      pageBreak(),
      sectionTitle('NOTES ON DEFECTS FOUND DURING TESTING'),
      p('Three defects were found while executing this cycle. One was fixed and re-tested within the cycle; the other two remain open and are carried into the recommendations.', { size: 15, after: 140 }),
      ...defectTables(),
      sectionTitle('RECOMMENDATIONS'),
      table(recommendations.map(([id, text]) => new TableRow({
        children: [td(id, 1000, { bold: true, align: C, size: 15 }), td(text, 9240, { size: 15 })],
      })), [1000, 9240]),
    ]),
  ],
})

const out = path.join(OUTDIR, 'FUNCTIONAL_NON_FUNCTIONAL_TESTING.docx')
const buf = await Packer.toBuffer(doc)
fs.writeFileSync(out, buf)
console.log('wrote', out, (buf.length / 1024 / 1024).toFixed(2) + ' MB')
console.log('lighthouse modules:', lh.length, '| runs per module:', runCount)
console.log('test cases:', webTests.length, 'web +', mobileTests.length, 'mobile |', passed, 'passed,', failed, 'failed')
