import { FormEvent, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, apiErrorMessage } from '../lib/api';
import { Modal } from './ui/Modal';

export interface RecordField {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'select';
  options?: string[];
  placeholder?: string;
  required?: boolean;
  full?: boolean; // span both columns
}

/**
 * Create-or-edit form modal shared by Leads / Contacts / Accounts.
 * `record` null → create (POST /:resource); otherwise edit (PATCH /:resource/:id).
 * When `canEdit` is false the form is read-only (view). On edit, only changed
 * fields are sent; a cleared field is sent as null so optional validators pass.
 */
export function RecordFormModal({
  resource,
  record,
  fields,
  entityLabel,
  canEdit,
  onClose,
  onSaved,
}: {
  resource: string;
  record: any | null;
  fields: RecordField[];
  entityLabel: string;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!record;
  const [error, setError] = useState('');
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of fields) v[f.name] = record?.[f.name] != null ? String(record[f.name]) : '';
    return v;
  });

  const saveM = useMutation({
    mutationFn: () => {
      const body: any = {};
      for (const f of fields) {
        const val = values[f.name] ?? '';
        if (isEdit) {
          const orig = record?.[f.name] != null ? String(record[f.name]) : '';
          if (val !== orig) body[f.name] = val === '' ? null : val;
        } else if (val !== '') {
          body[f.name] = val;
        }
      }
      return isEdit ? api.patch(`/${resource}/${record.id}`, body) : api.post(`/${resource}`, body);
    },
    onSuccess: onSaved,
    onError: (e) => setError(apiErrorMessage(e)),
  });

  function set(name: string, v: string) {
    setValues((s) => ({ ...s, [name]: v }));
  }
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    saveM.mutate();
  }

  const title = isEdit ? `${canEdit ? 'Edit' : 'View'} ${entityLabel}` : `New ${entityLabel}`;

  return (
    <Modal open onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4">
        {fields.map((f) => (
          <div key={f.name} className={f.full ? 'col-span-2' : ''}>
            <label className="label">{f.label}{f.required && !isEdit ? ' *' : ''}</label>
            {f.type === 'select' ? (
              <select className="input" value={values[f.name]} disabled={!canEdit} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">—</option>
                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input
                className="input"
                type={f.type === 'email' ? 'email' : 'text'}
                value={values[f.name]}
                placeholder={f.placeholder}
                required={f.required && !isEdit}
                disabled={!canEdit}
                onChange={(e) => set(f.name, e.target.value)}
              />
            )}
          </div>
        ))}
        {error && <div className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        <div className="col-span-2 flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>{canEdit ? 'Cancel' : 'Close'}</button>
          {canEdit && (
            <button className="btn-primary" disabled={saveM.isPending}>
              {saveM.isPending ? 'Saving…' : isEdit ? 'Save changes' : `Create ${entityLabel}`}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
}
