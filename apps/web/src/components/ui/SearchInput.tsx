import React from 'react'
import { Search } from 'lucide-react'
import { Input } from './index'

/**
 * The one search box. Every list that can be filtered uses this, so the
 * control looks and behaves the same whether you are filtering athletes,
 * staff, seasons or your own notifications.
 */
export default function SearchInput({
  value,
  onChange,
  placeholder,
  label = 'Search',
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label?: string
  className?: string
}) {
  return (
    <Input
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      icon={<Search className="w-4 h-4" />}
      className={className}
    />
  )
}

/** Case-insensitive "do all the typed words appear in this row" test. */
export function matchesSearch(query: string, ...fields: (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  const haystack = fields.filter(Boolean).join(' ').toLowerCase()
  return q.split(/\s+/).every((word) => haystack.includes(word))
}
