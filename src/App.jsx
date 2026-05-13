import { Routes, Route } from 'react-router-dom'
import Pond from '@/pond/Pond.jsx'
import Murmur from '@/murmur/Murmur.jsx'
import MurmurInfoPage from '@/pages/MurmurInfoPage.jsx'
import ThesisPage from '@/pages/ThesisPage.jsx'
import DeepstreamInfoPage from '@/pages/DeepstreamInfoPage.jsx'
import NotFoundPage from '@/pages/NotFoundPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/"                element={<Pond />} />
      <Route path="/murmur"          element={<Murmur />} />
      <Route path="/murmur/about"    element={<MurmurInfoPage />} />
      <Route path="/thesis"          element={<ThesisPage />} />
      <Route path="/deepstream-info" element={<DeepstreamInfoPage />} />
      <Route path="*"                element={<NotFoundPage />} />
    </Routes>
  )
}
