import { CheckCircle2, Database, Hourglass } from 'lucide-react'

export default function StatusBar({ count }) {
  return (
    <footer className="status-bar">
      <span className="ok"><CheckCircle2 size={17} /> Source inchangée</span>
      <span className="pending"><Hourglass size={17} /> Validation UEFN en attente</span>
      <span><Database size={17} /> {count} assets indexés</span>
    </footer>
  )
}
