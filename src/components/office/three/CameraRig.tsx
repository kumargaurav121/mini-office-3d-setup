"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { ROOM_D, ROOM_W, roomOrigin, SLAB, WALL_H, WALL_T } from "@/lib/office/layout";
import type { RoomRecord } from "@/lib/office/rooms";
import { STUB } from "./Bridges";
import { K } from "./primitives";

const deg = THREE.MathUtils.degToRad;
// Default view: 45° around, 30° down, like the original pixel diorama.
const AZIMUTH = deg(45);
const ELEVATION = deg(30);
export const VIEW_DIR = new THREE.Vector3(
  Math.sin(AZIMUTH) * Math.cos(ELEVATION),
  Math.sin(ELEVATION),
  Math.cos(AZIMUTH) * Math.cos(ELEVATION),
);

/** What the camera should frame: a room, or the whole office when `roomId` is null. */
export interface Focus {
  roomId: string | null;
  /** Bumped on every request, so asking for the same room twice still glides. */
  request: number;
}

export interface Box {
  min: THREE.Vector3;
  max: THREE.Vector3;
}

/** World-space bounds of a room (walls included), optionally padded for the stubs around it. */
export function roomBox(record: RoomRecord, margin = 0): Box {
  const o = roomOrigin(record.cell);
  return {
    min: new THREE.Vector3(o.x - WALL_T - margin, -SLAB * K, o.y - WALL_T - margin),
    max: new THREE.Vector3(o.x + ROOM_W + WALL_T + margin, WALL_H * K, o.y + ROOM_D + WALL_T + margin),
  };
}

export function officeBox(rooms: RoomRecord[]): Box {
  const box = roomBox(rooms[0], STUB);
  for (const r of rooms) {
    const b = roomBox(r, STUB);
    box.min.min(b.min);
    box.max.max(b.max);
  }
  return box;
}

interface Framing {
  target: THREE.Vector3;
  position: THREE.Vector3;
  zoom: number;
}

/** Camera placement that fits `box` on screen when looking along `dir`. */
function frame(box: Box, dir: THREE.Vector3, width: number, height: number, padding = 0.92): Framing {
  const center = box.min.clone().add(box.max).multiplyScalar(0.5);
  const cam = new THREE.OrthographicCamera();
  cam.position.copy(center).addScaledVector(dir, 100);
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const v = new THREE.Vector3();
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        v.set(x, y, z).applyMatrix4(cam.matrixWorldInverse);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
    }
  }
  // Re-centre on the projected bounds.
  const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
  const target = center.add(right.multiplyScalar((minX + maxX) / 2)).add(up.multiplyScalar((minY + maxY) / 2));
  return {
    target,
    position: target.clone().addScaledVector(dir, 100),
    zoom: Math.min(width / (maxX - minX), height / (maxY - minY)) * padding,
  };
}

/**
 * Frames the whole office on first paint, then glides to whatever `focus`
 * asks for. Grabbing the camera cancels a glide.
 */
export function CameraRig({ rooms, focus }: { rooms: RoomRecord[]; focus: Focus }) {
  const camera = useThree((s) => s.camera);
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const goal = useRef<Framing | null>(null);
  const placed = useRef(false);

  // Zoom limits: from a bit wider than the whole office down to a close-up of one room.
  useLayoutEffect(() => {
    if (!controls || width === 0 || height === 0) return;
    const all = frame(officeBox(rooms), VIEW_DIR, width, height);
    const one = frame(roomBox(rooms[0]), VIEW_DIR, width, height);
    setZoomLimits(controls, Math.min(all.zoom, one.zoom) * 0.6, one.zoom * 3);
    if (!placed.current && camera instanceof THREE.OrthographicCamera) {
      placed.current = true;
      applyFraming(camera, controls, all);
    }
  }, [camera, controls, rooms, width, height]);

  // Glide when a new focus is requested (keeping whatever angle the user has rotated to).
  const latest = useRef({ rooms, width, height });
  useLayoutEffect(() => {
    latest.current = { rooms, width, height };
  });
  useLayoutEffect(() => {
    const { rooms: list, width: w, height: h } = latest.current;
    if (!controls || w === 0 || focus.request === 0) return;
    const room = list.find((r) => r.id === focus.roomId);
    const dir = camera.position.clone().sub(controls.target).normalize();
    goal.current = frame(room ? roomBox(room) : officeBox(list), dir, w, h, room ? 0.85 : 0.92);
  }, [camera, controls, focus]);

  useLayoutEffect(() => {
    if (!controls) return;
    const cancel = () => {
      goal.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame((_, dt) => {
    const g = goal.current;
    if (!g || !controls || !(camera instanceof THREE.OrthographicCamera)) return;
    if (glideToward(camera, controls, g, 1 - Math.exp(-dt * 6))) goal.current = null;
  });
  return null;
}

// Camera and controls are three.js objects we drive imperatively; these helpers
// keep those writes out of React's render/hook analysis.

function setZoomLimits(controls: OrbitControlsImpl, min: number, max: number) {
  controls.minZoom = min;
  controls.maxZoom = max;
}

/** Ease one step toward `f`; returns true (and snaps) once there. */
function glideToward(camera: THREE.OrthographicCamera, controls: OrbitControlsImpl, f: Framing, t: number) {
  camera.zoom += (f.zoom - camera.zoom) * t;
  controls.target.lerp(f.target, t);
  camera.position.lerp(f.position, t);
  camera.updateProjectionMatrix();
  controls.update();
  const arrived = Math.abs(f.zoom - camera.zoom) < f.zoom * 0.002 && controls.target.distanceTo(f.target) < 0.01;
  if (arrived) applyFraming(camera, controls, f);
  return arrived;
}

function applyFraming(camera: THREE.OrthographicCamera, controls: OrbitControlsImpl, f: Framing) {
  camera.position.copy(f.position);
  camera.zoom = f.zoom;
  camera.updateProjectionMatrix();
  controls.target.copy(f.target);
  controls.update();
}
