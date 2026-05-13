import { Canvas } from '@react-three/fiber'
import PointCloud from './PointCloud.jsx'
import CameraRig from './CameraRig.jsx'
import ReactiveDriver from '@/murmur/audio/ReactiveAnalyzer.jsx'
import SculptDriver from '@/murmur/audio/GranularSculptor.jsx'

const isMobile = typeof window !== 'undefined' && window.matchMedia('(max-width:639px)').matches

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
        <PointCloud />
        <CameraRig />
        <ReactiveDriver />
        <SculptDriver />
      </Canvas>
    </div>
  )
}
