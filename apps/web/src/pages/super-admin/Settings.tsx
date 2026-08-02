import React, { useEffect, useRef, useState } from 'react'
import { Save, Building2, Palette, Upload } from 'lucide-react'
import { Button, Input, Card, Alert } from '../../components/ui'
import { useInstitutionStore } from '../../stores/institutionStore'
import api from '../../lib/api'
import { applyTheme } from '../../lib/utils'
import type { Institution } from '../../types'

export default function SuperAdminSettings() {
  const { institution, fetchInstitution } = useInstitutionStore()
  const logoFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState({
    name: '', abbreviation: '', tagline: '',
    primary_color: '#002D62', secondary_color: '#FFD700',
    address: '', region: '',
    logo_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (institution) {
      setForm({
        name: institution.name, abbreviation: institution.abbreviation,
        tagline: institution.tagline, primary_color: institution.primary_color,
        secondary_color: institution.secondary_color, address: institution.address,
        region: institution.region,
        logo_url: institution.logo_url ?? '',
      })
    }
  }, [institution])

  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess(false)
    try {
      await api.patch('/admin/institution', form)
      applyTheme(form.primary_color, form.secondary_color)
      await fetchInstitution()
      setSuccess(true)
    } catch (e: any) { setError(e.response?.data?.error ?? 'Save failed') }
    finally { setSaving(false) }
  }

  const update = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const handleLogoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setLogoUploading(true)
    setError('')
    setSuccess(false)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post<Institution>('/admin/institution/logo', fd)
      setForm((f) => ({ ...f, logo_url: data.logo_url ?? '' }))
      await fetchInstitution()
      setSuccess(true)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Logo upload failed')
    } finally {
      setLogoUploading(false)
    }
  }

  const clearLogo = async () => {
    setSaving(true)
    setError('')
    setSuccess(false)
    try {
      await api.patch('/admin/institution', { logo_url: null })
      setForm((f) => ({ ...f, logo_url: '' }))
      await fetchInstitution()
      setSuccess(true)
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined
      setError(msg ?? 'Could not remove logo')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">School Profile</h1>
        <p className="text-[var(--text-muted)] text-sm">Changes reflect immediately across the platform</p>
      </div>

      {success && <Alert type="success" onDismiss={() => setSuccess(false)}>School profile updated successfully!</Alert>}
      {error && <Alert type="danger" onDismiss={() => setError('')}>{error}</Alert>}

      <Card>
        <h2 className="font-bold flex items-center gap-2 mb-4"><Building2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" aria-hidden /> Identity & Branding</h2>
        <div className="space-y-4">
          <Input label="Institution Name" value={form.name} onChange={e => update('name', e.target.value)} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Abbreviation" value={form.abbreviation} onChange={e => update('abbreviation', e.target.value)} />
            <Input label="Tagline" value={form.tagline} onChange={e => update('tagline', e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">School logo</label>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              JPEG, PNG, WebP, or SVG · max 5MB · visible across login, guest pages, sidebar, and live displays.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-20 h-20 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden flex items-center justify-center shrink-0">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Palette className="w-8 h-8 text-[var(--text-muted)] opacity-40" aria-hidden />
                )}
              </div>
              <div className="flex flex-col gap-2 items-start">
                <input
                  ref={logoFileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="hidden"
                  onChange={handleLogoFile}
                  disabled={logoUploading}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={logoUploading}
                  loading={logoUploading}
                  icon={logoUploading ? undefined : <Upload className="w-4 h-4" />}
                  onClick={() => logoFileRef.current?.click()}
                >
                  {logoUploading ? 'Uploading…' : 'Upload logo'}
                </Button>
                {form.logo_url ? (
                  <Button type="button" variant="ghost" className="text-[#FF3355] hover:text-[#FF3355]" onClick={clearLogo} disabled={saving}>
                    Remove logo
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.primary_color} onChange={e => { update('primary_color', e.target.value); applyTheme(e.target.value, form.secondary_color) }} className="w-10 h-10 rounded cursor-pointer" />
                <Input value={form.primary_color} onChange={e => update('primary_color', e.target.value)} className="font-mono" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5">Secondary Color</label>
              <div className="flex gap-2 items-center">
                <input type="color" value={form.secondary_color} onChange={e => { update('secondary_color', e.target.value); applyTheme(form.primary_color, e.target.value) }} className="w-10 h-10 rounded cursor-pointer" />
                <Input value={form.secondary_color} onChange={e => update('secondary_color', e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>
          <Input label="Address" value={form.address} onChange={e => update('address', e.target.value)} />
          <Input label="Region" value={form.region} onChange={e => update('region', e.target.value)} />
        </div>
      </Card>

      <Button icon={<Save className="w-4 h-4" />} loading={saving} onClick={handleSave} size="lg">
        Save Changes
      </Button>
    </div>
  )
}
