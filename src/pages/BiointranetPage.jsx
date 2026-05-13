import { Link } from 'react-router-dom'
import './pages.css'

export default function BiointranetPage() {
  return (
    <div className="page-root" style={{ position: 'relative' }}>
      <nav className="page-breadcrumb" aria-label="breadcrumb">
        <Link to="/" className="page-breadcrumb-link">deepstre.am</Link>
        <span className="page-breadcrumb-sep">/</span>
        <span className="page-breadcrumb-current">biointranet</span>
      </nav>
      <p className="page-title">Biointranet</p>
      <p className="page-body">coming soon</p>
    </div>
  )
}
