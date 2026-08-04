import React, { useMemo } from 'react'

function score(password: string) {
  if (!password) return null

  let points = 0
  if (password.length >= 8) points++
  if (password.length >= 12) points++
  if (/[A-Z]/.test(password)) points++
  if (/[0-9]/.test(password)) points++
  if (/[^A-Za-z0-9]/.test(password)) points++

  if (points <= 1)
    return { label: 'Weak', barColor: 'bg-[#FF3355]', textColor: 'text-[#FF3355]', width: 'w-1/4' }
  if (points === 2)
    return { label: 'Fair', barColor: 'bg-amber-400', textColor: 'text-amber-400', width: 'w-2/4' }
  if (points === 3)
    return { label: 'Good', barColor: 'bg-[#0066FF]', textColor: 'text-[#0066FF]', width: 'w-3/4' }
  return {
    label: 'Strong',
    barColor: 'bg-[var(--success)]',
    textColor: 'text-[var(--success)]',
    width: 'w-full',
  }
}

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const result = useMemo(() => score(password), [password])

  if (!result) return null

  return (
    <div className="mt-2 space-y-1">
      <div className="h-1 w-full rounded-full bg-[var(--border-subtle)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${result.barColor} ${result.width}`}
        />
      </div>
      <p className={`text-xs font-medium ${result.textColor}`}>{result.label}</p>
    </div>
  )
}
