import * as React from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import type { Template } from '../../shared/types'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/Shell'
import { useApp } from '@/hooks/useApp'
import { uid } from '@/lib/utils'

export function TemplatesView() {
  const { t, templates, saveTemplate, removeTemplate, toast } = useApp()
  const [editing, setEditing] = React.useState<Template | null>(null)

  const fieldLabels: Record<Template['field'], string> = {
    company: t('fieldCompany'),
    school: t('fieldSchool'),
    instruction: t('fieldInstruction'),
  }

  function startNew() {
    setEditing({ id: uid(), title: '', field: 'company', text: '' })
  }

  async function handleSave(template: Template) {
    if (!template.title.trim() || !template.text.trim()) return
    await saveTemplate(template)
    setEditing(null)
    toast(t('toastSaved'))
  }

  async function handleDelete(id: string) {
    await removeTemplate(id)
    toast(t('toastDeleted'))
  }

  return (
    <>
      <PageHeader
        title={t('templatesTitle')}
        description={t('templatesIntro')}
        actions={
          <Button onClick={startNew}>
            <Plus />
            {t('templateNew')}
          </Button>
        }
      />

      {templates.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          {t('templatesEmpty')}
        </Card>
      ) : (
        <div className="space-y-2">
          {templates.map((tpl) => (
            <Card key={tpl.id}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{tpl.title}</span>
                    <Badge variant="outline">{fieldLabels[tpl.field]}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">
                    {tpl.text}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" onClick={() => setEditing(tpl)}>
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(tpl.id)}
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <TemplateDialog
          template={editing}
          fieldLabels={fieldLabels}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </>
  )
}

function TemplateDialog({
  template,
  fieldLabels,
  onCancel,
  onSave,
}: {
  template: Template
  fieldLabels: Record<Template['field'], string>
  onCancel: () => void
  onSave: (template: Template) => void
}) {
  const { t } = useApp()
  const [draft, setDraft] = React.useState(template)
  const valid = draft.title.trim().length > 0 && draft.text.trim().length > 0

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('templateNew')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">{t('templateTitleLabel')}</Label>
            <Input
              id="tpl-title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>{t('templateFieldLabel')}</Label>
            <Select
              value={draft.field}
              onValueChange={(v) => setDraft({ ...draft, field: v as Template['field'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(fieldLabels) as Template['field'][]).map((f) => (
                  <SelectItem key={f} value={f}>
                    {fieldLabels[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-text">{t('templateTextLabel')}</Label>
            <Textarea
              id="tpl-text"
              value={draft.text}
              onChange={(e) => setDraft({ ...draft, text: e.target.value })}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button onClick={() => onSave(draft)} disabled={!valid}>
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
