import { Routes, Route } from 'react-router-dom'
import Pond from '@/pond/Pond.jsx'
import Murmur from '@/murmur/Murmur.jsx'
import MurmurInfoPage from '@/pages/MurmurInfoPage.jsx'
import BiointranetPage from '@/pages/BiointranetPage.jsx'
import DeepstreamInfoPage from '@/pages/DeepstreamInfoPage.jsx'
import NotFoundPage from '@/pages/NotFoundPage.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/"                element={<Pond />} />
      <Route path="/murmur"          element={<Murmur />} />
      <Route path="/murmur/about"    element={<MurmurInfoPage />} />
      <Route path="/biointranet"      element={<BiointranetPage />} />
      <Route path="/deepstream-info" element={<DeepstreamInfoPage />} />
      <Route path="*"                element={<NotFoundPage />} />
    </Routes>
  )
}
