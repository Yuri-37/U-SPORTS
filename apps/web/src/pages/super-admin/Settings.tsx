import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Save, Building2, Palette, Upload, Undo2 } from 'lucide-react'
import { Button, Input, Card, Alert } from '../../components/ui'
import PageHeader from '../../components/layout/PageHeader'
import { useInstitutionStore } from '../../stores/institutionStore'
import { toast } from '../../stores/toastStore'
import api from '../../lib/api'
import { describeApiError } from '../../lib/apiError'
import { applyTheme } from '../../lib/utils'

const LOGO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
const LOGO_MAX_BYTES = 5 * 1024 * 1024
const HEX = /^#[0-9a-fA-F]{6}$/

type FormState = {
  name: string
  abbreviation: string
  tagline: string
  primary_color: string
  secondary_color: string
  address: string
  region: string
}

const EMPTY: FormState = {
  name: '',
  abbreviation: '',
  tagline: '',
  primary_color: '#002D62',
  secondary_color: '#FFD700',
  address: '',
  region: '',
}

export default function SuperAdminSettings() {
  const { institution, fetchInstitution } = useInstitutionStore()
  const logoFileRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // A chosen logo is only held here, with a local preview, until Save. Nothing
  // is uploaded or changed on the live site before that.
  const [pendingLogo, setPendingLogo] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)

  const saved: FormState = useMemo(
    () =>
      institution
        ? {
            name: institution.name,
            abbreviation: institution.abbreviation,
            tagline: institution.tagline,
            primary_color: institution.primary_color,
            secondary_color: institution.secondary_color,
            address: institution.address,
            region: institution.region,
          }
        : EMPTY,
    [institution],
  )

  const dirty =
    pendingLogo !== null ||
    removeLogo ||
    (Object.keys(saved) as (keyof FormState)[]).some((k) => (form[k] ?? '') !== (saved[k] ?? ''))

  // Fill the form from the saved profile -- but never over edits in progress
  // (the profile is re-fetched in the background when the tab regains focus).
  const dirtyRef = useRef(false)
  dirtyRef.current = dirty
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (institution && (!hydratedRef.current || !dirtyRef.current)) {
      hydratedRef.current = true
      setForm(saved)
    }
  }, [institution, saved])

  // The color pickers preview live. If the page is left without saving, put the
  // saved theme back so an abandoned preview doesn't linger across the site.
  const savedColorsRef = useRef({ p: saved.primary_color, s: saved.secondary_color })
  savedColorsRef.current = { p: saved.primary_color, s: saved.secondary_color }
  useEffect(() => {
    return () => applyTheme(savedColorsRef.current.p, savedColorsRef.current.s)
  }, [])

  // Release the object URL for a discarded/replaced preview.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  // Closing or reloading the tab with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (field: keyof FormState, value: string) => {
    setForm((f) => ({ ...f, [field]: value }))
    if (field === 'primary_color' && HEX.test(value)) applyTheme(value, form.secondary_color)
    if (field === 'secondary_color' && HEX.test(value)) applyTheme(form.primary_color, value)
  }

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!LOGO_MIME.includes(file.type)) {
      setError('Use a JPEG, PNG, WebP or SVG image.')
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError('That image is larger than 5MB.')
      return
    }
    setError('')
    setPendingLogo(file)
    setRemoveLogo(false)
    setPreviewUrl(URL.createObjectURL(file))
  }

  const clearLogo = () => {
    setPendingLogo(null)
    setPreviewUrl(null)
    setRemoveLogo(true)
  }

  const discard = () => {
    setForm(saved)
    setPendingLogo(null)
    setPreviewUrl(null)
    setRemoveLogo(false)
    setError('')
    applyTheme(saved.primary_color, saved.secondary_color)
  }

  const handleSave = async () => {
    if (!HEX.test(form.primary_color) || !HEX.test(form.secondary_color)) {
      const msg = 'Colors must be a hex value like #002D62.'
      setError(msg)
      toast.error(msg)
      return
    }
    setSaving(true)
    setError('')
    try {
      // 1) the logo, if it changed -- uploading also stores it on the profile
      if (pendingLogo) {
        const fd = new FormData()
        fd.append('file', pendingLogo)
        await api.post('/admin/institution/logo', fd)
      } else if (removeLogo) {
        await api.patch('/admin/institution', { logo_url: null })
      }
      // 2) everything else. logo_url is left out on purpose: sending the old
      //    value back would undo the upload just made.
      await api.patch('/admin/institution', form)
      applyTheme(form.primary_color, form.secondary_color)
      setPendingLogo(null)
      setPreviewUrl(null)
      setRemoveLogo(false)
      await fetchInstitution()
      toast.success('School profile saved')
    } catch (e: unknown) {
      const msg = describeApiError(e, 'Could not save the school profile')
      setError(msg) // the failed request already raised the red toast (lib/api.ts)
    } finally {
      setSaving(false)
    }
  }

  const shownLogo = pendingLogo ? previewUrl : removeLogo ? null : (institution?.logo_url ?? null)

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="School Profile"
        subtitle="Your school's name, logo and colors. Nothing changes on the site until you press Save."
      />

      {error && (
        <Alert type="danger" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <h2 className="font-bold flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-[var(--text-secondary)] shrink-0" aria-hidden />{' '}
          Identity & Branding
        </h2>
        <div className="space-y-4">
          <Input
            label="Institution Name"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Abbreviation"
              value={form.abbreviation}
              onChange={(e) => update('abbreviation', e.target.value)}
            />
            <Input
              label="Tagline"
              value={form.tagline}
              onChange={(e) => update('tagline', e.target.value)}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)] mb-1.5">School logo</p>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              JPEG, PNG, WebP, or SVG · max 5MB · shown across login, guest pages, sidebar, and
              live displays once you save.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-20 h-20 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-base)] overflow-hidden flex items-center justify-center shrink-0">
                {shownLogo ? (
                  <img src={shownLogo} alt="" className="w-full h-full object-contain" />
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
                  disabled={saving}
                  aria-label="Choose school logo"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  icon={<Upload className="w-4 h-4" />}
                  onClick={() => logoFileRef.current?.click()}
                >
                  Choose logo
                </Button>
                {shownLogo ? (
                  <Button
                    type="button"
                    variant="ghost"
                    className="text-[#FF3355] hover:text-[#FF3355]"
                    onClick={clearLogo}
                    disabled={saving}
                  >
                    Remove logo
                  </Button>
                ) : null}
                {pendingLogo || removeLogo ? (
                  <p className="text-xs text-[var(--warning,#d97706)]">
                    {removeLogo ? 'Logo will be removed' : 'New logo'} — not saved yet
                  </p>
                ) : null}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="school-primary-hex"
                className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5"
              >
                Primary Color
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  aria-label="Pick primary color"
                  value={HEX.test(form.primary_color) ? form.primary_color : '#002D62'}
                  onChange={(e) => update('primary_color', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <Input
                  id="school-primary-hex"
                  value={form.primary_color}
                  onChange={(e) => update('primary_color', e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="school-secondary-hex"
                className="text-sm font-medium text-[var(--text-secondary)] block mb-1.5"
              >
                Secondary Color
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  aria-label="Pick secondary color"
                  value={HEX.test(form.secondary_color) ? form.secondary_color : '#FFD700'}
                  onChange={(e) => update('secondary_color', e.target.value)}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <Input
                  id="school-secondary-hex"
                  value={form.secondary_color}
                  onChange={(e) => update('secondary_color', e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            Colors preview on this page as you pick them. They apply to everyone on the website and
            in the Android app after you Save (the app picks them up the next time it opens).
          </p>
          <Input
            label="Address"
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
          />
          <Input
            label="Region"
            value={form.region}
            onChange={(e) => update('region', e.target.value)}
          />
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          icon={<Save className="w-4 h-4" />}
          loading={saving}
          disabled={!dirty}
          onClick={handleSave}
          size="lg"
        >
          Save Changes
        </Button>
        <Button
          variant="secondary"
          size="lg"
          icon={<Undo2 className="w-4 h-4" />}
          disabled={!dirty || saving}
          onClick={discard}
        >
          Discard changes
        </Button>
        {dirty ? (
          <span className="text-xs text-[var(--text-muted)]">You have unsaved changes</span>
        ) : null}
      </div>
    </div>
  )
}
