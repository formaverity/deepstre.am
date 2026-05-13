import { Link } from 'react-router-dom'
import './pages.css'

export default function BiointranetPage() {
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100dvh', background: '#0d1410' }}>
      <nav className="page-breadcrumb" aria-label="breadcrumb" style={{ zIndex: 10 }}>
        <Link to="/" className="page-breadcrumb-link">deepstre.am</Link>
        <span className="page-breadcrumb-sep">/</span>
        <span className="page-breadcrumb-current">biointranet</span>
      </nav>
      <iframe
        src="https://liampmartin.com/biointranet"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
        title="Biointranet"
        loading="lazy"
      />
    </div>
  )
}
