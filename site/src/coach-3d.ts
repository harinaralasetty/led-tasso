import * as THREE from "three";
import type { Coach } from "./coach";
export function mountCoach(
  container: HTMLElement,
  coach: Coach,
  onLost: () => void,
  onReady: () => void,
): () => void {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 2.7, 10);
  camera.lookAt(0, 2.05, 0);
  scene.add(new THREE.HemisphereLight(0xfff2db, 0x5e7299, 2.8));
  const key = new THREE.DirectionalLight(0xffead1, 4);
  key.position.set(-3, 6, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -4;
  key.shadow.camera.right = 4;
  key.shadow.camera.top = 6;
  key.shadow.camera.bottom = -3;
  key.shadow.normalBias = 0.03;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7eb6ef, 2);
  rim.position.set(3, 3, -3);
  scene.add(rim);
  const mat = (color: THREE.ColorRepresentation, roughness = 0.75) =>
    new THREE.MeshStandardMaterial({ color, roughness });
  const skin = mat("#e9b287");
  const noseMat = mat("#dd9c73");
  const navy = mat("#253e5e");
  const dark = mat("#172940");
  const red = mat("#e11d48");
  const redDark = mat("#be123c");
  const cream = mat("#fff1d9");
  const eyesMat = mat("#1a2939");
  const silver = mat("#d8dfe8", 0.3);
  const brown = mat("#5c3a2b");
  const root = new THREE.Group();
  root.rotation.y = -0.12;
  scene.add(root);
  function ball(
    parent: THREE.Object3D,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy = sx,
    sz = sx,
  ) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), material);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function capsule(
    parent: THREE.Object3D,
    material: THREE.Material,
    r: number,
    length: number,
    x: number,
    y: number,
    z: number,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, length, 8, 20),
      material,
    );
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  // Short legs and oversized sneakers keep the silhouette friendly and toy-like.
  capsule(root, dark, 0.21, 0.55, -0.29, 0.63, 0);
  capsule(root, dark, 0.21, 0.55, 0.29, 0.63, 0);
  ball(root, cream, -0.3, 0.18, 0.15, 0.29, 0.16, 0.43);
  ball(root, cream, 0.3, 0.18, 0.15, 0.29, 0.16, 0.43);
  ball(root, red, -0.3, 0.1, 0.16, 0.29, 0.055, 0.43);
  ball(root, red, 0.3, 0.1, 0.16, 0.29, 0.055, 0.43);
  const body = capsule(root, navy, 0.57, 0.48, 0, 1.6, 0);
  body.scale.set(1.05, 1, 0.7);
  ball(root, red, 0, 1.92, 0.12, 0.58, 0.22, 0.29);
  capsule(root, cream, 0.018, 0.78, 0, 1.51, 0.438);
  const collarL = capsule(root, cream, 0.045, 0.25, -0.1, 2.02, 0.4);
  collarL.rotation.z = 0.65;
  const collarR = capsule(root, cream, 0.045, 0.25, 0.1, 2.02, 0.4);
  collarR.rotation.z = -0.65;
  ball(root, skin, 0, 2.18, 0, 0.22, 0.27, 0.22);
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.55, 1.96, 0);
    root.add(arm);
    arms.push(arm);
    capsule(arm, navy, 0.17, 0.6, side * 0.13, -0.38, 0);
    capsule(arm, red, 0.177, 0.05, side * 0.13, -0.7, 0.005);
    ball(arm, skin, side * 0.13, -0.86, 0.02, 0.2, 0.22, 0.19);
  }
  const head = new THREE.Group();
  head.position.set(0, 2.87, 0.015);
  root.add(head);
  ball(head, skin, 0, 0, 0, 0.7, 0.75, 0.6);
  ball(head, noseMat, -0.7, -0.015, 0, 0.14, 0.2, 0.14);
  ball(head, noseMat, 0.7, -0.015, 0, 0.14, 0.2, 0.14);
  ball(head, brown, -0.62, 0.12, 0.01, 0.065, 0.29, 0.35);
  ball(head, brown, 0.62, 0.12, 0.01, 0.065, 0.29, 0.35);
  const eyeGroups: THREE.Group[] = [];
  const pupils: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.245, 0.07, 0.535);
    head.add(eye);
    eyeGroups.push(eye);
    ball(eye, cream, 0, 0, 0, 0.14, 0.18, 0.075);
    pupils.push(ball(eye, eyesMat, 0.012, -0.012, 0.066, 0.065, 0.1, 0.035));
    ball(eye, cream, 0.03, 0.035, 0.096, 0.024);
    const brow = capsule(head, brown, 0.034, 0.18, side * 0.245, 0.31, 0.52);
    brow.rotation.z = side * -0.12;
    ball(head, mat("#e99a7d"), side * 0.45, -0.22, 0.45, 0.11, 0.05, 0.018);
  }
  ball(head, noseMat, 0, -0.11, 0.6, 0.105, 0.12, 0.13);
  const mouth = ball(head, mat("#70382f"), 0, -0.35, 0.535, 0.16, 0.055, 0.032);
  const teeth = ball(head, cream, 0, -0.323, 0.56, 0.125, 0.024, 0.012);
  // Cap hemisphere, curved bill, seam and five-point star.
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.735, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2),
    red,
  );
  cap.position.y = 0.3;
  cap.scale.y = 0.73;
  cap.castShadow = true;
  head.add(cap);
  ball(head, redDark, 0, 0.3, 0.4, 0.8, 0.07, 0.6);
  ball(head, redDark, 0, 0.85, 0, 0.06, 0.045, 0.06);
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(0.733, 0.012, 8, 48, Math.PI / 2),
    redDark,
  );
  seam.rotation.y = Math.PI / 2;
  seam.position.y = 0.3;
  seam.scale.y = 0.73;
  head.add(seam);
  const starShape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? 0.061 : 0.13;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const star = new THREE.Mesh(
    new THREE.ExtrudeGeometry(starShape, { depth: 0.018, bevelEnabled: false }),
    cream,
  );
  star.position.set(0, 0.57, 0.664);
  head.add(star);
  // Whistle on a fine gold lanyard.
  const ropeMat = mat("#e8bb79");
  for (const side of [-1, 1]) {
    const rope = capsule(root, ropeMat, 0.012, 0.48, side * 0.085, 1.77, 0.45);
    rope.rotation.z = side * -0.3;
  }
  const whistle = ball(root, silver, 0.035, 1.48, 0.51, 0.12, 0.073, 0.07);
  ball(root, dark, -0.015, 1.48, 0.573, 0.033, 0.033, 0.012);
  whistle.rotation.z = 0.2;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.ShadowMaterial({ opacity: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const confetti: THREE.Mesh[] = [];
  for (let i = 0; i < 30; i++) {
    const piece = new THREE.Mesh(
      new THREE.PlaneGeometry(0.055, 0.11),
      mat(["#e11d48", "#e8bf74", "#9cb9da", "#f6ead5"][i % 4]),
    );
    piece.visible = false;
    scene.add(piece);
    confetti.push(piece);
  }
  const resize = () => {
    const width = container.clientWidth,
      height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let frame = 0;
  let previous = performance.now();
  let time = 0;
  let lastSpeech = 0;
  let mouthPulse = 0;
  let cheerTime = 0;
  let lastState = coach.state;
  let lastRender = 0;
  const blend = (value: number, target: number, dt: number) =>
    THREE.MathUtils.lerp(value, target, 1 - Math.exp(-dt * 8));
  const animate = (now: number) => {
    frame = requestAnimationFrame(animate);
    const dt = Math.min((now - previous) / 1000, 0.05);
    previous = now;
    if (document.hidden) return;
    time += dt;
    const state = coach.state;
    if (state === "cheer" && lastState !== "cheer") cheerTime = 0;
    cheerTime += dt;
    lastState = state;
    const talking = state === "talking",
      thinking = state === "thinking",
      cheering = state === "cheer",
      listening = state === "listening";
    root.position.y = blend(
      root.position.y,
      cheering
        ? Math.max(0, Math.sin(cheerTime * 9)) * 0.22
        : Math.sin(time * 2) * 0.018,
      dt,
    );
    root.rotation.x = blend(root.rotation.x, listening ? 0.1 : 0, dt);
    root.rotation.z = blend(
      root.rotation.z,
      cheering ? Math.sin(time * 10) * 0.035 : 0,
      dt,
    );
    head.rotation.x = blend(
      head.rotation.x,
      thinking
        ? -0.18
        : talking
          ? Math.sin(time * 7) * 0.055
          : coach.pointer.y * 0.09,
      dt,
    );
    head.rotation.y = blend(
      head.rotation.y,
      thinking ? -0.22 : coach.pointer.x * 0.2 + Math.sin(time * 0.7) * 0.025,
      dt,
    );
    head.rotation.z = blend(head.rotation.z, listening ? -0.08 : 0, dt);
    arms[0].rotation.z = blend(
      arms[0].rotation.z,
      cheering ? -2.2 : talking ? -0.25 - Math.sin(time * 4) * 0.15 : 0.08,
      dt,
    );
    arms[1].rotation.z = blend(
      arms[1].rotation.z,
      cheering
        ? 2.4
        : thinking
          ? -2.5
          : talking
            ? 0.3 + Math.sin(time * 3) * 0.18
            : -0.08,
      dt,
    );
    arms[1].rotation.x = blend(
      arms[1].rotation.x,
      thinking ? 0.65 : talking ? -0.3 : 0,
      dt,
    );
    arms[1].rotation.y = blend(arms[1].rotation.y, thinking ? 0.45 : 0, dt);
    const blink = Math.sin(time * 0.8) > 0.995 ? 0.1 : 1;
    eyeGroups.forEach((eye) => {
      eye.scale.y = blend(eye.scale.y, blink, dt * 4);
    });
    pupils.forEach((pupil) => {
      pupil.position.x = blend(pupil.position.x, coach.pointer.x * 0.035, dt);
      pupil.position.y = blend(pupil.position.y, -coach.pointer.y * 0.035, dt);
    });
    if (coach.speech !== lastSpeech) {
      mouthPulse = 0.5 + ((coach.speech * 7) % 10) / 10;
      lastSpeech = coach.speech;
    }
    mouthPulse = Math.max(0, mouthPulse - dt * 3);
    mouth.scale.y = blend(
      mouth.scale.y,
      talking ? 0.05 + mouthPulse * 0.14 : 0.055,
      dt * 2,
    );
    teeth.visible = mouth.scale.y < 0.1;
    confetti.forEach((piece, i) => {
      piece.visible = cheering;
      const progress = (cheerTime + i * 0.023) % 2;
      piece.position.set(
        Math.sin(i * 7.3) * 1.5,
        4.8 - progress * 2,
        Math.cos(i * 2.3) * 0.8,
      );
      piece.rotation.set(time + i, time * 0.8 + i, time * 2 + i);
    });
    // Limit GPU work on phones, and hold the stage while a modal covers it.
    if (
      now - lastRender >= 1000 / 30 &&
      (!document.querySelector("dialog[open]") || lastRender === 0)
    ) {
      renderer.render(scene, camera);
      if (lastRender === 0) onReady();
      lastRender = now;
    }
  };
  const lost = (event: Event) => {
    event.preventDefault();
    cancelAnimationFrame(frame);
    onLost();
    renderer.domElement.hidden = true;
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  frame = requestAnimationFrame(animate);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.domElement.removeEventListener("webglcontextlost", lost);
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}
