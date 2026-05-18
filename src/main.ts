import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { parseA3P } from "./a3p-parser";
import { buildScene } from "./scene-builder";

// ── UI elements ─────────────────────────────────────────────────────
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const objectList = document.getElementById("object-list") as HTMLUListElement;
const status = document.getElementById("status") as HTMLElement;
const canvas = document.getElementById("viewport") as HTMLCanvasElement;

// ── Three.js bootstrap ──────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
resizeRenderer();

let currentScene: THREE.Scene | null = null;
let currentCamera: THREE.PerspectiveCamera | null = null;
let controls: OrbitControls | null = null;

function resizeRenderer() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  if (currentCamera) {
    currentCamera.aspect = w / h;
    currentCamera.updateProjectionMatrix();
  }
}
window.addEventListener("resize", resizeRenderer);

// ── Render loop ─────────────────────────────────────────────────────
function animate() {
  requestAnimationFrame(animate);
  controls?.update();
  if (currentScene && currentCamera) {
    renderer.render(currentScene, currentCamera);
  }
}
animate();

// ── File handling ───────────────────────────────────────────────────
fileInput.addEventListener("change", async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  status.textContent = `Loading ${file.name}…`;
  objectList.innerHTML = "";

  try {
    const buffer = await file.arrayBuffer();
    const project = await parseA3P(buffer);

    status.textContent = `Loaded "${project.projectName}" (v${project.version}) – ${project.sceneObjects.length} objects`;

    // Populate object list
    for (const obj of project.sceneObjects) {
      const li = document.createElement("li");
      const shortType = obj.typeName.split(".").pop() ?? obj.typeName;
      li.textContent = `${obj.name} (${shortType})`;
      if (obj.resourceType) {
        const small = document.createElement("small");
        small.textContent = ` [${obj.resourceType.split(".").pop()}]`;
        li.appendChild(small);
      }
      objectList.appendChild(li);
    }

    // Build and display scene
    const { scene, camera, cameraConfig } = buildScene(project);
    currentScene = scene;
    currentCamera = camera;
    resizeRenderer();

    // Orbit controls — configured from scene-builder's cameraConfig
    controls?.dispose();
    controls = new OrbitControls(camera, canvas);
    controls.target.set(cameraConfig.target.x, cameraConfig.target.y, cameraConfig.target.z);
    controls.minDistance = cameraConfig.minDistance;
    controls.maxDistance = cameraConfig.maxDistance;
    controls.maxPolarAngle = cameraConfig.maxPolarAngle;
    controls.enableDamping = cameraConfig.enableDamping;
  } catch (err) {
    status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
});
