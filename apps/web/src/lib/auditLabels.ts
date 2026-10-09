// Acronyms that should stay uppercase after title-casing an action/entity slug.
const ACRONYMS = ['Pdf', 'Csv', 'Xlsx', 'Ot']

/**
 * Title-cases an audit action or entity slug ("match_score_sheet_pdf_exported"
 * -> "Match Score Sheet PDF Exported"). Shared by the super-admin dashboard's
 * Recent Activity card and the Audit Logs page so both name an entry alike.
 */
export function auditLabel(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .replace(new RegExp(`\b(${ACRONYMS.join('|')})\b`, 'g'), (m) => m.toUpperCase())
}
