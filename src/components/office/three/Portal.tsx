"use client";

import { useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { PORTAL } from "@/lib/office/layout";

const ACTIVE = { ring: "#5ee7ff", core: "#8b5cf6" };
const IDLE = { ring: "#6b7280", core: "#374151" };

/** The pad agents arrive on and leave through. Click it to spawn an agent (unless the desks are full). */
export function Portal({ full, onOpen, onHover }: { full: boolean; onOpen: () => void; onHover: (on: boolean) => void }) {
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>>(null);
  const sparks = useRef<THREE.Group>(null);
  const colors = full ? IDLE : ACTIVE;

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (ring.current) ring.current.rotation.z = t * 0.8;
    if (core.current) core.current.material.opacity = full ? 0.25 : 0.35 + Math.sin(t * 3) * 0.15;
    sparks.current?.children.forEach((s, i) => {
      const phase = (t * 0.45 + i / 6) % 1;
      const a = i * 1.05 + t * 0.6;
      s.position.set(Math.cos(a) * 0.38, phase * 1.4, Math.sin(a) * 0.38);
      s.scale.setScalar(full ? 0 : 0.05 * (1 - phase));
    });
  });

  const click = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (!full && e.delta < 5) onOpen();
  };

  return (
    <group position={[PORTAL.x, 0, PORTAL.y]} onClick={click} onPointerEnter={() => onHover(!full)} onPointerLeave={() => onHover(false)}>
      <mesh position-y={0.03} receiveShadow>
        <cylinderGeometry args={[0.66, 0.7, 0.06, 32]} />
        <meshStandardMaterial color="#4b5563" roughness={0.9} />
      </mesh>
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.065}>
        <ringGeometry args={[0.44, 0.58, 6]} />
        <meshBasicMaterial color={colors.ring} toneMapped={false} />
      </mesh>
      <mesh ref={core} rotation-x={-Math.PI / 2} position-y={0.07}>
        <circleGeometry args={[0.44, 32]} />
        <meshBasicMaterial color={colors.core} transparent opacity={0.4} toneMapped={false} depthWrite={false} />
      </mesh>
      <group ref={sparks}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <mesh key={i}>
            <boxGeometry args={[1, 1, 1]} />
            <meshBasicMaterial color={colors.ring} toneMapped={false} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
