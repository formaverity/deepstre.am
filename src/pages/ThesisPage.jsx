import { Link } from 'react-router-dom'
import './pages.css'

export default function ThesisPage() {
  return (
    <div className="page-root" style={{ position: 'relative' }}>
      <nav className="page-breadcrumb" aria-label="breadcrumb">
        <Link to="/" className="page-breadcrumb-link">deepstre.am</Link>
        <span className="page-breadcrumb-sep">/</span>
        <span className="page-breadcrumb-current">thesis</span>
      </nav>
      <p className="page-title">Thesis</p>
      <p className="page-body">coming soon</p>
    </div>
  )
}
