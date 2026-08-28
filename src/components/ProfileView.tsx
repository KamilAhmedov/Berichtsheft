import * as React from 'react'
import type { Profile } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/Shell'
import { useApp } from '@/hooks/useApp'

const DURATIONS = [2, 2.5, 3, 3.5]

export function ProfileView() {
  const { t, profile, saveProfile, toast } = useApp()
  const [draft, setDraft] = React.useState<Profile>(profile)

  React.useEffect(() => setDraft(profile), [profile])

  const dirty = JSON.stringify(draft) !== JSON.stringify(profile)

  const field = <K extends keyof Profile>(key: K, value: Profile[K]) =>
    setDraft((d) => ({ ...d, [key]: value }))

  async function handleSave() {
    await saveProfile(draft)
    toast(t('toastSaved'))
  }

  return (
    <>
      <PageHeader title={t('profileTitle')} description={t('profileIntro')} />

      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="fullName">{t('fieldFullName')}</Label>
              <Input
                id="fullName"
                value={draft.fullName}
                onChange={(e) => field('fullName', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="occupation">{t('fieldOccupation')}</Label>
              <Input
                id="occupation"
                value={draft.occupation}
                onChange={(e) => field('occupation', e.target.value)}
                placeholder="Fachinformatiker/in für Anwendungsentwicklung"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="specialization">
                {t('fieldSpecialization')}{' '}
                <span className="font-normal text-muted-foreground">({t('optional')})</span>
              </Label>
              <Input
                id="specialization"
                value={draft.specialization}
                onChange={(e) => field('specialization', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">{t('fieldAddress')}</Label>
              <Input
                id="address"
                value={draft.address}
                onChange={(e) => field('address', e.target.value)}
                placeholder="Musterstraße 1, 12345 Musterstadt"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company">{t('fieldCompanyName')}</Label>
              <Input
                id="company"
                value={draft.company}
                onChange={(e) => field('company', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">
                {t('fieldDepartment')}{' '}
                <span className="font-normal text-muted-foreground">({t('optional')})</span>
              </Label>
              <Input
                id="department"
                value={draft.department}
                onChange={(e) => field('department', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trainer">{t('fieldTrainer')}</Label>
              <Input
                id="trainer"
                value={draft.trainer}
                onChange={(e) => field('trainer', e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="startDate">{t('fieldStartDate')}</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => field('startDate', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('fieldDuration')}</Label>
                <Select
                  value={String(draft.durationYears)}
                  onValueChange={(v) => field('durationYears', Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATIONS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        {d} {t('durationYears')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-5">
            <div className="space-y-2">
              <Label htmlFor="bookNumber">{t('fieldBookNumber')}</Label>
              <Input
                id="bookNumber"
                value={draft.bookNumber}
                onChange={(e) => field('bookNumber', e.target.value)}
                className="w-24"
              />
              <p className="text-xs text-muted-foreground">{t('fieldBookNumberHint')}</p>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('profileCoverHint')}</p>

          <div className="flex justify-end pt-1">
            <Button onClick={handleSave} disabled={!dirty}>
              {dirty ? t('save') : t('saved')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
