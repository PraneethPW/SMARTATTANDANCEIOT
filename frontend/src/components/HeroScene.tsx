import { Float, Sparkles } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Group, Mesh } from 'three';
import * as THREE from 'three';

function BusModel() {
  const group = useRef<Group>(null);
  const wheelMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#07101d', roughness: 0.32 }), []);
  useFrame((state) => {
    if (!group.current) return;
    group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.35) * 0.12 - 0.25;
    group.current.position.y = Math.sin(state.clock.elapsedTime * 0.8) * 0.08;
  });
  return (
    <group ref={group} rotation={[0.05, -0.25, 0]}>
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[3.6, 1.35, 1.35]} />
        <meshPhysicalMaterial color="#6dfbd3" metalness={0.22} roughness={0.18} clearcoat={1} />
      </mesh>
      <mesh position={[1.62, 0.47, 0]} castShadow>
        <boxGeometry args={[0.42, 0.72, 1.31]} />
        <meshPhysicalMaterial color="#50c7ff" metalness={0.35} roughness={0.12} clearcoat={1} />
      </mesh>
      {[-1.15, -0.38, 0.38, 1.15].map((x) => (
        <mesh key={x} position={[x, 0.5, 0.686]}>
          <boxGeometry args={[0.56, 0.42, 0.03]} />
          <meshPhysicalMaterial color="#152849" transmission={0.45} transparent opacity={0.86} roughness={0.05} />
        </mesh>
      ))}
      {[-1.15, 1.15].flatMap((x) => [-0.72, 0.72].map((z) => (
        <mesh key={`${x}-${z}`} position={[x, -0.45, z]} rotation={[Math.PI / 2, 0, 0]} material={wheelMaterial}>
          <cylinderGeometry args={[0.38, 0.38, 0.18, 32]} />
        </mesh>
      )))}
      <pointLight position={[1.9, 0.1, 0.55]} color="#bfffee" intensity={5} distance={3} />
      <pointLight position={[1.9, 0.1, -0.55]} color="#bfffee" intensity={5} distance={3} />
    </group>
  );
}

function OrbitRings() {
  const first = useRef<Mesh>(null);
  const second = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (first.current) first.current.rotation.z += delta * 0.1;
    if (second.current) second.current.rotation.x -= delta * 0.07;
  });
  return (
    <>
      <mesh ref={first} rotation={[Math.PI / 2.3, 0.2, 0]}>
        <torusGeometry args={[2.75, 0.016, 12, 180]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.55} />
      </mesh>
      <mesh ref={second} rotation={[1.4, 0.3, 0.4]}>
        <torusGeometry args={[3.2, 0.01, 12, 180]} />
        <meshBasicMaterial color="#9a87ff" transparent opacity={0.35} />
      </mesh>
    </>
  );
}

export default function HeroScene() {
  return (
    <Canvas dpr={[1, 1.7]} camera={{ position: [5.2, 2.6, 6.2], fov: 42 }} gl={{ antialias: true, alpha: true }}>
      <ambientLight intensity={1.2} />
      <directionalLight position={[4, 6, 4]} intensity={2.8} color="#d8fff5" />
      <directionalLight position={[-3, 1, -4]} intensity={2} color="#7667ff" />
      <Float speed={1.8} rotationIntensity={0.25} floatIntensity={0.45}>
        <BusModel />
      </Float>
      <OrbitRings />
      <Sparkles count={72} scale={[7, 4, 6]} size={1.8} speed={0.32} color="#a9fce4" />
      <fog attach="fog" args={['#08111f', 9, 16]} />
    </Canvas>
  );
}

