import { Canvas } from '@react-three/fiber'
import PointCloud from './PointCloud.jsx'
import CameraRig from './CameraRig.jsx'
import ReactiveDriver from '@/murmur/audio/ReactiveAnalyzer.jsx'
import SculptDriver from '@/murmur/audio/GranularSculptor.jsx'
import SculptParticles from './SculptParticles.jsx'
import SculptOverlay from './SculptOverlay.jsx'
import AudioAtmos from './AudioAtmos.jsx'
import OrbitLights from './OrbitLights.jsx'
import ChordController, { ChordRing } from './ChordController.jsx'
import DitherBleed from './DitherBleed.jsx'
import OrbitIndicator from './OrbitIndicator.jsx'
import CheeseStrings from './CheeseStrings.jsx'

const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width:639px)').matches

const USE_GPGPU = true  // set false to fall back to legacy shader path

export default function PointCloudScene() {
  return (
    <div className="murmur-scene">
      <Canvas
        gl={{ antialias: !isMobile, alpha: false, powerPreference: 'high-performance' }}
        camera={{ position: [2, 1.5, 2.5], fov: 50, near: 0.01, far: 100 }}
        dpr={isMobile ? [1, 1.5] : [1, 2]}
      >
        <color attach="background" args={['#070b08']} />
        <fog attach="fog" args={['#070b08', 4, 14]} />
        <ambientLight intensity={0.4} />
        <AudioAtmos />
        <OrbitLights />
        <PointCloud useGpgpu={USE_GPGPU} />
        <SculptParticles />
        <SculptOverlay />
        <CameraRig />
        <ReactiveDriver />
        <SculptDriver />
        <ChordController />
        <ChordRing />
        <OrbitIndicator />
        <CheeseStrings />
        <DitherBleed />
      </Canvas>
    </div>
  )
}
