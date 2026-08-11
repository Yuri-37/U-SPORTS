/**
 * Shared CSV/XLSX upload plumbing for the bulk-import endpoints — originally
 * lived only in routes/students.ts (athlete import); extracted here once
 * routes/teams.ts (team roster import) needed the exact same parsing.
 */
import multer from 'multer'
import { parse } from 'csv-parse/sync'
import ExcelJS from 'exceljs'

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

export function isExcelUpload(file: Express.Multer.File): boolean {
  return file.mimetype === XLSX_MIME || /\.xlsx?$/i.test(file.originalname)
}

/**
 * Parse an uploaded .xlsx into the same `Record<string, unknown>[]` shape the
 * CSV path produces (row 1 = headers). Every cell is read as its formatted text
 * (`cell.text`) so Excel never coerces IDs like `2023-172117` or year labels
 * like `1st Year` into numbers/dates.
 */
export async function parseXlsx(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  const ws = wb.worksheets[0]
  if (!ws) return []

  const headers: string[] = []
  ws.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = String(cell.text ?? '').trim()
  })

  const rows: Record<string, unknown>[] = []
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return
    const record: Record<string, unknown> = {}
    let hasValue = false
    headers.forEach((header, colNumber) => {
      if (!header) return
      const text = row.getCell(colNumber).text?.trim() ?? ''
      record[header] = text
      if (text) hasValue = true
    })
    if (hasValue) rows.push(record)
  })
  return rows
}

/** Parses an uploaded CSV or XLSX file (routed by isExcelUpload) into rows. */
export async function parseUploadedRows(
  file: Express.Multer.File,
): Promise<Record<string, unknown>[]> {
  if (isExcelUpload(file)) return parseXlsx(file.buffer)
  return parse(file.buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, unknown>[]
}
