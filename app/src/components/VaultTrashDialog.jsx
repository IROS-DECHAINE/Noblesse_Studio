import { AlertTriangle, ArchiveRestore, ShieldCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function VaultTrashDialog({ plan, busy, onCancel, onConfirm }) {
  const [step, setStep] = useState(1)
  useEffect(() => setStep(1), [plan?.operationId])
  if (!plan) return null

  return (
    <div className="vault-trash-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel() }}>
      <section className="vault-trash-dialog" role="dialog" aria-modal="true" aria-labelledby="vault-trash-title">
        <header>
          <span><AlertTriangle size={22} /></span>
          <div><h2 id="vault-trash-title">Mettre « {plan.title} » dans la corbeille ?</h2><p>Validation {step} sur 2 · aucune suppression définitive</p></div>
          <button type="button" aria-label="Fermer" disabled={busy} onClick={onCancel}><X size={18} /></button>
        </header>

        {plan.blocked ? (
          <div className="vault-trash-blocked" role="alert">
            <AlertTriangle size={20} />
            <div><strong>Action bloquée</strong><p>{plan.blockers.length} autre{plan.blockers.length > 1 ? 's' : ''} élément{plan.blockers.length > 1 ? 's utilisent' : ' utilise'} encore cette source : {plan.blockers.map((item) => item.name).join(', ')}.</p></div>
          </div>
        ) : step === 1 ? (
          <div className="vault-trash-review">
            <div><Trash2 size={21} /><span><strong>{plan.targetCount} entrée{plan.targetCount > 1 ? 's' : ''} retirée{plan.targetCount > 1 ? 's' : ''} du Coffre</strong><small>{plan.targets.map((item) => item.name).join(' · ')}</small></span></div>
            <div><ShieldCheck size={21} /><span><strong>Originaux préservés</strong><small>Les fichiers restent immuables et la restauration reste possible.</small></span></div>
          </div>
        ) : (
          <div className="vault-trash-final-check">
            <ArchiveRestore size={25} />
            <strong>Seconde confirmation</strong>
            <p>L’élément disparaîtra du Coffre et de ses index. Tu pourras le restaurer depuis Sécurité et récupération.</p>
          </div>
        )}

        <footer>
          <button type="button" disabled={busy} onClick={onCancel}>{plan.blocked ? 'Fermer' : 'Annuler'}</button>
          {!plan.blocked && step === 1 && <button className="is-warning" type="button" onClick={() => setStep(2)}>J’ai vérifié le plan · Continuer</button>}
          {!plan.blocked && step === 2 && <button className="is-danger" type="button" disabled={busy} onClick={onConfirm}><Trash2 size={16} /> {busy ? 'Mise en corbeille…' : 'Confirmer la mise en corbeille'}</button>}
        </footer>
      </section>
    </div>
  )
}
