import { Link } from 'react-router-dom'
import './pages.css'

export default function NotFoundPage() {
  return (
    <div className="page-root" style={{ position: 'relative' }}>
      <p className="page-title">not found</p>
      <p className="page-body">this path doesn't exist in the ecosystem</p>
      <Link to="/" className="page-link">return to the pond</Link>
    </div>
  )
}
