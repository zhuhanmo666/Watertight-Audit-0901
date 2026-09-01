import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);

const ui = {
  viewport: $('viewport'),
  canvas: $('scene-canvas'),
  loading: $('loading-overlay'),
  loadingText: $('loading-detail'),
  loadingProgress: $('loading-progress'),
  emptyState: $('empty-state'),
  modelList: $('model-list'),
  modelCount: $('filtered-count'),
  search: $('search-input'),
  reason: $('reason-select'),
  reasonWrap: $('reason-field'),
  tabs: [...document.querySelectorAll('[data-category]')],
  allTotal: $('summary-all'),
  passTotal: $('summary-pass'),
  failTotal: $('summary-fail'),
  verifier: $('summary-verifier'),
  passTabCount: $('tab-pass-count'),
  failTabCount: $('tab-fail-count'),
  currentCategory: $('detail-category'),
  currentId: $('model-id'),
  copyId: $('copy-id-button'),
  classBadge: $('class-badge'),
  partCountBadge: $('part-count-badge'),
  failReasons: $('fail-reasons'),
  auditPartCount: $('metric-part-count'),
  meshCount: $('metric-mesh-count'),
  unitCount: $('metric-unit-count'),
  overlapPairs: $('metric-overlap-pairs'),
  volume: $('metric-overlap-volume'),
  tinyCount: $('metric-tiny-count'),
  explode: $('explode-slider'),
  explodeValue: $('explode-value'),
  playBang: $('play-button'),
  resetBang: $('reset-button'),
  fitView: $('fit-button'),
  partColors: $('color-toggle'),
  wireframe: $('wireframe-toggle'),
  autoRotate: $('rotate-toggle'),
  partList: $('part-list'),
  selectedPart: $('selected-part-card'),
  selectedPartName: $('selected-part-name'),
  soloPart: $('solo-part-button'),
  hidePart: $('hide-part-button'),
  clearSelection: $('clear-selection-button'),
  showAll: $('show-all-button'),
  prev: $('previous-button'),
  next: $('next-button'),
  position: $('catalog-position'),
  toast: $('toast'),
};

const state = {
  summary: null,
  category: 'pass',
  models: [],
  currentIndex: -1,
  currentItem: null,
  currentRoot: null,
  currentBox: null,
  parts: [],
  selectedPart: null,
  selectionHelper: null,
  explodeAmount: 0,
  playing: false,
  playDirection: 1,
  loadToken: 0,
  listToken: 0,
  dataMode: 'api',
  staticCatalog: null,
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x070a10);
scene.fog = new THREE.FogExp2(0x070a10, 0.035);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000);
camera.position.set(4.2, 3.1, 5.3);

const renderer = new THREE.WebGLRenderer({
  canvas: ui.canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.autoRotateSpeed = 1.25;
controls.minDistance = 0.08;
controls.maxDistance = 80;

scene.add(new THREE.HemisphereLight(0xc7ddff, 0x23201c, 2.2));
const keyLight = new THREE.DirectionalLight(0xffffff, 3.4);
keyLight.position.set(5, 8, 7);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x70a7ff, 1.8);
fillLight.position.set(-6, 2, -4);
scene.add(fillLight);
const rimLight = new THREE.DirectionalLight(0xffa968, 1.1);
rimLight.position.set(2, -2, -6);
scene.add(rimLight);

const grid = new THREE.GridHelper(10, 40, 0x344153, 0x1a2230);
grid.position.y = -1.55;
grid.material.opacity = 0.48;
grid.material.transparent = true;
scene.add(grid);

const modelGroup = new THREE.Group();
scene.add(modelGroup);

const loader = new GLTFLoader();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clock = new THREE.Clock();
let pointerDown = null;
let toastTimer = 0;
let searchTimer = 0;

function resizeRenderer() {
  const width = Math.max(1, ui.viewport.clientWidth);
  const height = Math.max(1, ui.viewport.clientHeight);
  const pixelRatio = Math.min(window.devicePixelRatio, 2);
  const targetWidth = Math.floor(width * pixelRatio);
  const targetHeight = Math.floor(height * pixelRatio);
  if (ui.canvas.width !== targetWidth || ui.canvas.height !== targetHeight) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

new ResizeObserver(resizeRenderer).observe(ui.viewport);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state.playing) {
    let next = state.explodeAmount + state.playDirection * dt / 1.7;
    if (next >= 1) {
      next = 1;
      state.playDirection = -1;
    } else if (next <= 0) {
      next = 0;
      state.playDirection = 1;
    }
    setExplodeAmount(next, false);
  }
  controls.update();
  state.selectionHelper?.update();
  resizeRenderer();
  renderer.render(scene, camera);
}
animate();

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  ui.toast.textContent = message;
  ui.toast.classList.toggle('error', isError);
  ui.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => ui.toast.classList.remove('visible'), 2600);
}

function showLoading(text, progress = 0) {
  ui.loading.hidden = false;
  ui.loadingText.textContent = text;
  ui.loadingProgress.style.width = `${Math.max(0, Math.min(progress, 100))}%`;
}

function hideLoading() {
  ui.loading.hidden = true;
}

function setCategory(category) {
  if (!['pass', 'fail'].includes(category)) return;
  state.category = category;
  ui.tabs.forEach((tab) => {
    const active = tab.dataset.category === category;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  ui.reasonWrap.hidden = category !== 'fail';
  refreshModels();
}

async function loadSummary() {
  try {
    state.summary = await fetchJSON('./api/summary');
    state.dataMode = 'api';
  } catch (apiError) {
    state.staticCatalog = await fetchJSON('./catalog.json');
    state.summary = state.staticCatalog.summary;
    state.dataMode = 'static';
    console.info('Using read-only static catalog.', apiError.message);
  }
  ui.allTotal.textContent = state.summary.counts.all;
  ui.passTotal.textContent = state.summary.counts.pass;
  ui.failTotal.textContent = state.summary.counts.fail;
  ui.verifier.textContent = state.summary.verification.status || '—';
  ui.passTabCount.textContent = state.summary.counts.pass;
  ui.failTabCount.textContent = state.summary.counts.fail;

  ui.reason.replaceChildren(new Option('全部未通过原因', ''));
  for (const [reason, count] of Object.entries(state.summary.failReasonCounts || {})
    .sort((left, right) => right[1] - left[1])) {
    const option = new Option(`${reason} (${count})`, reason);
    ui.reason.add(option);
  }
}

async function refreshModels(preferredId = '') {
  const token = ++state.listToken;
  const params = new URLSearchParams({ category: state.category });
  const search = ui.search.value.trim();
  if (search) params.set('search', search);
  if (state.category === 'fail' && ui.reason.value) params.set('reason', ui.reason.value);

  ui.modelList.classList.add('busy');
  try {
    let payload;
    if (state.dataMode === 'static') {
      const normalizedSearch = search.toLowerCase();
      const reason = state.category === 'fail' ? ui.reason.value : '';
      const items = state.staticCatalog.items.filter((item) => (
        item.category === state.category
        && (!normalizedSearch || item.id.toLowerCase().includes(normalizedSearch))
        && (!reason || item.failReasons.includes(reason))
      ));
      payload = { items, total: items.length };
    } else {
      payload = await fetchJSON(`./api/models?${params}`);
    }
    if (token !== state.listToken) return;
    state.models = payload.items;
    ui.modelCount.textContent = `${payload.total} 个模型`;
    renderModelList();

    const idFromUrl = preferredId || new URLSearchParams(location.search).get('id') || '';
    const nextIndex = Math.max(0, state.models.findIndex((item) => item.id === idFromUrl));
    if (state.models.length) {
      selectModel(nextIndex);
    } else {
      state.currentIndex = -1;
      state.currentItem = null;
      clearModel();
      renderDetails(null);
      ui.emptyState.hidden = false;
      ui.emptyState.textContent = '没有符合当前筛选条件的模型';
    }
  } catch (error) {
    console.error(error);
    showToast(`读取清单失败：${error.message}`, true);
  } finally {
    if (token === state.listToken) ui.modelList.classList.remove('busy');
  }
}

function renderModelList() {
  ui.modelList.replaceChildren();
  const fragment = document.createDocumentFragment();
  state.models.forEach((item, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `model-item ${item.category}`;
    button.dataset.index = String(index);
    if (index === state.currentIndex) button.classList.add('active');

    const status = document.createElement('span');
    status.className = `status-dot ${item.category}`;
    const id = document.createElement('strong');
    id.className = 'item-id';
    id.textContent = item.id;
    const meta = document.createElement('small');
    meta.className = 'item-parts';
    const partText = item.partCount;
    const modelMeta = item.bytes
      ? `${partText ?? '?'} parts · ${formatBytes(item.bytes)}`
      : '无最终 GLB';
    meta.textContent = item.category === 'fail'
      ? `${(item.failReasons || []).join(', ') || '未通过'} · ${modelMeta}`
      : `${modelMeta} · ${formatSeconds(item.processingSeconds)}`;
    button.append(status, id, meta);
    button.addEventListener('click', () => selectModel(index));
    fragment.append(button);
  });
  ui.modelList.append(fragment);
}

async function selectModel(index) {
  if (index < 0 || index >= state.models.length) return;
  const item = state.models[index];
  state.currentIndex = index;
  state.currentItem = item;
  renderModelList();
  renderDetails(item);
  updateNavigation();
  updateUrl();
  await loadModel(item);
}

function updateUrl() {
  if (!state.currentItem) return;
  const params = new URLSearchParams();
  params.set('category', state.category);
  params.set('id', state.currentItem.id);
  history.replaceState(null, '', `${location.pathname}?${params}`);
}

function updateNavigation() {
  const total = state.models.length;
  ui.position.textContent = total ? `${state.currentIndex + 1} / ${total}` : '0 / 0';
  ui.prev.disabled = total < 2;
  ui.next.disabled = total < 2;
}

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const number = Number(value);
  if (number !== 0 && (Math.abs(number) < 0.001 || Math.abs(number) >= 1e6)) {
    return number.toExponential(2);
  }
  return number.toLocaleString('en-US', { maximumFractionDigits: digits });
}

function formatSeconds(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  const seconds = Number(value);
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${(seconds % 60).toFixed(0)}s`;
}

function categoryLabel(category) {
  return category === 'pass' ? 'PASS' : 'FAIL';
}

function renderDetails(item) {
  if (!item) {
    ui.currentCategory.textContent = '—';
    ui.currentId.textContent = '未选择模型';
    ui.failReasons.replaceChildren();
    for (const target of [ui.auditPartCount, ui.meshCount, ui.unitCount, ui.overlapPairs, ui.volume, ui.tinyCount]) {
      target.textContent = '—';
    }
    ui.classBadge.textContent = '—';
    ui.partCountBadge.textContent = '— parts';
    updateNavigation();
    return;
  }

  ui.currentCategory.textContent = categoryLabel(item.category);
  ui.currentCategory.className = `badge ${item.category}`;
  ui.classBadge.textContent = categoryLabel(item.category);
  ui.classBadge.className = `badge ${item.category}`;
  ui.currentId.textContent = item.id;
  ui.auditPartCount.textContent = formatNumber(item.partCount, 0);
  ui.meshCount.textContent = item.bytes ? '载入中' : '—';
  ui.unitCount.textContent = `Group ${String(item.group).padStart(2, '0')}`;
  ui.overlapPairs.textContent = formatSeconds(item.stage0824Seconds);
  ui.volume.textContent = formatSeconds(item.stage0827Seconds);
  ui.tinyCount.textContent = formatSeconds(item.processingSeconds);
  ui.partCountBadge.textContent = `${formatNumber(item.partCount, 0)} parts`;

  ui.failReasons.replaceChildren();
  if (item.category === 'pass') {
    const tag = document.createElement('span');
    tag.className = 'reason-tag pass-tag';
    tag.textContent = '拓扑水密：通过';
    ui.failReasons.append(tag);
  } else {
    (item.failReasons || ['拓扑水密：未通过']).forEach((reason) => {
      const tag = document.createElement('span');
      tag.className = 'reason-tag';
      tag.textContent = reason;
      ui.failReasons.append(tag);
    });
  }
}

async function loadModel(item) {
  const token = ++state.loadToken;
  stopBang();
  setExplodeAmount(0, true);
  clearModel();
  ui.emptyState.hidden = true;

  if (!item.modelUrl && !(item.modelParts || []).length) {
    hideLoading();
    ui.emptyState.hidden = false;
    ui.emptyState.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = '没有可预览的最终 GLB';
    const detail = document.createElement('span');
    detail.textContent = (item.failReasons || ['处理未完成']).join(' · ');
    ui.emptyState.append(title, detail);
    return;
  }
  showLoading('正在读取 GLB…', 4);

  try {
    const gltf = await loadGltf(item, token);
    if (token !== state.loadToken) {
      disposeLooseScene(gltf.scene);
      return;
    }
    showLoading('正在分析 parts 与计算 Bang 布局…', 93);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    prepareModel(gltf.scene);
    hideLoading();
  } catch (error) {
    if (token !== state.loadToken) return;
    console.error(error);
    hideLoading();
    ui.emptyState.hidden = false;
    ui.emptyState.textContent = `模型载入失败：${error.message}`;
    ui.meshCount.textContent = '失败';
    showToast('GLB 载入失败，详情见页面中央', true);
  }
}

async function loadGltf(item, token) {
  if (!(item.modelParts || []).length) {
    return loader.loadAsync(item.modelUrl, (event) => {
      if (token !== state.loadToken) return;
      const progress = event.total ? (event.loaded / event.total) * 100 : 35;
      showLoading(`正在读取 GLB · ${formatBytes(event.loaded)}${event.total ? ` / ${formatBytes(event.total)}` : ''}`, progress);
    });
  }

  const buffers = [];
  let loaded = 0;
  for (let index = 0; index < item.modelParts.length; index += 1) {
    if (token !== state.loadToken) throw new Error('模型载入已取消');
    const url = item.modelParts[index];
    showLoading(`正在读取 GLB 分片 ${index + 1} / ${item.modelParts.length}…`, 5 + (loaded / item.bytes) * 82);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    const buffer = await response.arrayBuffer();
    buffers.push(buffer);
    loaded += buffer.byteLength;
    showLoading(`已读取 ${formatBytes(loaded)} / ${formatBytes(item.bytes)}`, 5 + (loaded / item.bytes) * 82);
  }

  const combined = new Uint8Array(loaded);
  let offset = 0;
  for (const buffer of buffers) {
    combined.set(new Uint8Array(buffer), offset);
    offset += buffer.byteLength;
  }
  const firstUrl = new URL(item.modelParts[0], location.href);
  const resourcePath = new URL('.', firstUrl).href;
  return loader.parseAsync(combined.buffer, resourcePath);
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** exponent).toFixed(exponent ? 1 : 0)} ${units[exponent]}`;
}

function prepareModel(root) {
  state.currentRoot = root;
  modelGroup.add(root);
  root.updateWorldMatrix(true, true);

  let box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) throw new Error('GLB 中没有可显示的几何体');
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxExtent = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxExtent) || maxExtent <= 1e-10) throw new Error('模型包围盒无效或尺寸为零');

  root.position.sub(center);
  const normalizedScale = 2.8 / maxExtent;
  root.scale.multiplyScalar(normalizedScale);
  root.updateWorldMatrix(true, true);
  box = new THREE.Box3().setFromObject(root);
  state.currentBox = box;

  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && object.geometry) meshes.push(object);
  });
  if (!meshes.length) throw new Error('GLB 中没有 Mesh');

  state.parts = meshes.map((mesh, index) => makePart(mesh, index));
  computeBangLayout(state.parts, box);
  applyMaterialMode();
  renderPartList();
  ui.meshCount.textContent = formatNumber(state.parts.length, 0);
  fitView();
}

function makePart(mesh, index) {
  const partColor = new THREE.Color().setHSL((index * 0.61803398875 + 0.04) % 1, 0.66, 0.58);
  const originalMaterial = mesh.material;
  const originals = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial];
  const colored = originals.map((material) => {
    const clone = material?.clone?.() || new THREE.MeshStandardMaterial();
    if (clone.color) clone.color.copy(partColor);
    if ('emissive' in clone && clone.emissive) clone.emissive.setRGB(0.015, 0.015, 0.015);
    clone.needsUpdate = true;
    return clone;
  });
  const coloredMaterial = Array.isArray(originalMaterial) ? colored : colored[0];
  const name = mesh.name || mesh.parent?.name || `part_${String(index + 1).padStart(3, '0')}`;
  const part = {
    index,
    mesh,
    name,
    color: `#${partColor.getHexString()}`,
    originalMaterial,
    coloredMaterial,
    basePosition: mesh.position.clone(),
    localDelta: new THREE.Vector3(),
    visible: mesh.visible,
  };
  mesh.userData.auditViewerPart = part;
  return part;
}

function computeBangLayout(parts, modelBox) {
  const modelSize = modelBox.getSize(new THREE.Vector3());
  const modelExtent = Math.max(modelSize.x, modelSize.y, modelSize.z, 0.001);
  const centers = [];
  const halfSizes = [];
  const centerMean = new THREE.Vector3();

  for (const part of parts) {
    const partBox = new THREE.Box3().setFromObject(part.mesh);
    const center = partBox.getCenter(new THREE.Vector3());
    const half = partBox.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    centers.push(center);
    halfSizes.push(half);
    centerMean.add(center);
  }
  centerMean.multiplyScalar(1 / parts.length);

  const std = new THREE.Vector3();
  for (const center of centers) {
    std.x += (center.x - centerMean.x) ** 2;
    std.y += (center.y - centerMean.y) ** 2;
    std.z += (center.z - centerMean.z) ** 2;
  }
  std.set(
    Math.sqrt(std.x / parts.length),
    Math.sqrt(std.y / parts.length),
    Math.sqrt(std.z / parts.length),
  );
  const maxStd = Math.max(std.x, std.y, std.z, modelExtent * 0.02);
  const stdFloor = maxStd * 0.14;
  const gains = new THREE.Vector3(
    1 + 0.9 * (Math.min(4.5, maxStd / Math.max(std.x, stdFloor)) - 1),
    1 + 0.9 * (Math.min(4.5, maxStd / Math.max(std.y, stdFloor)) - 1),
    1 + 0.9 * (Math.min(4.5, maxStd / Math.max(std.z, stdFloor)) - 1),
  );

  const radial = centers.map((center, index) => {
    const vector = center.clone().sub(centerMean).multiply(gains);
    const coincident = centers.some((other, otherIndex) => (
      otherIndex < index && other.distanceToSquared(center) < (modelExtent * 1e-5) ** 2
    ));
    if (vector.lengthSq() < (modelExtent * 1e-5) ** 2 || coincident) {
      vector.add(goldenSphereDirection(index, parts.length).multiplyScalar(modelExtent * 0.045));
    }
    return vector;
  });

  const gap = modelExtent * 0.018;
  let expansion = 1;
  for (; expansion <= 7; expansion += 0.12) {
    if (!hasAabbCollisions(radial, halfSizes, expansion, gap)) break;
  }
  expansion = Math.min(expansion, 7.12);

  parts.forEach((part, index) => {
    const targetCenter = centerMean.clone().addScaledVector(radial[index], expansion);
    part.worldDelta = targetCenter.sub(centers[index]);
  });

  const partByMesh = new Map(parts.map((part) => [part.mesh, part]));
  parts.forEach((part) => {
    const inheritedWorldDelta = new THREE.Vector3();
    let ancestor = part.mesh.parent;
    while (ancestor) {
      const ancestorPart = partByMesh.get(ancestor);
      if (ancestorPart?.worldDelta) inheritedWorldDelta.add(ancestorPart.worldDelta);
      ancestor = ancestor.parent;
    }
    const residualWorldDelta = part.worldDelta.clone().sub(inheritedWorldDelta);
    const parent = part.mesh.parent;
    parent.updateWorldMatrix(true, false);
    const parentOriginWorld = new THREE.Vector3().setFromMatrixPosition(parent.matrixWorld);
    const localOrigin = parent.worldToLocal(parentOriginWorld.clone());
    const localTarget = parent.worldToLocal(parentOriginWorld.clone().add(residualWorldDelta));
    part.localDelta.copy(localTarget.sub(localOrigin));
  });
}

function goldenSphereDirection(index, count) {
  const y = 1 - 2 * (index + 0.5) / Math.max(count, 1);
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius);
}

function hasAabbCollisions(radial, halfSizes, scale, gap) {
  for (let i = 0; i < radial.length; i += 1) {
    for (let j = i + 1; j < radial.length; j += 1) {
      const dx = Math.abs(radial[i].x * scale - radial[j].x * scale);
      const dy = Math.abs(radial[i].y * scale - radial[j].y * scale);
      const dz = Math.abs(radial[i].z * scale - radial[j].z * scale);
      if (
        dx < halfSizes[i].x + halfSizes[j].x + gap
        && dy < halfSizes[i].y + halfSizes[j].y + gap
        && dz < halfSizes[i].z + halfSizes[j].z + gap
      ) return true;
    }
  }
  return false;
}

function setExplodeAmount(value, syncSlider = true) {
  state.explodeAmount = THREE.MathUtils.clamp(Number(value), 0, 1);
  const eased = state.explodeAmount ** 2 * (3 - 2 * state.explodeAmount);
  for (const part of state.parts) {
    part.mesh.position.copy(part.basePosition).addScaledVector(part.localDelta, eased);
  }
  state.currentRoot?.updateWorldMatrix(true, true);
  if (syncSlider) ui.explode.value = String(Math.round(state.explodeAmount * 100));
  ui.explodeValue.textContent = `${Math.round(state.explodeAmount * 100)}%`;
}

function stopBang() {
  state.playing = false;
  ui.playBang.textContent = '▶ 播放爆炸';
}

function toggleBang() {
  state.playing = !state.playing;
  if (state.playing && state.explodeAmount >= 0.999) state.playDirection = -1;
  if (state.playing && state.explodeAmount <= 0.001) state.playDirection = 1;
  ui.playBang.textContent = state.playing ? 'Ⅱ 暂停' : '▶ 播放爆炸';
}

function applyMaterialMode() {
  for (const part of state.parts) {
    part.mesh.material = ui.partColors.checked ? part.coloredMaterial : part.originalMaterial;
    forEachMaterial(part.mesh.material, (material) => {
      if ('wireframe' in material) material.wireframe = ui.wireframe.checked;
      material.needsUpdate = true;
    });
  }
}

function forEachMaterial(material, callback) {
  (Array.isArray(material) ? material : [material]).filter(Boolean).forEach(callback);
}

function renderPartList() {
  ui.partList.replaceChildren();
  const fragment = document.createDocumentFragment();
  state.parts.forEach((part) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'part-item';
    if (state.selectedPart === part) row.classList.add('active');
    if (!part.mesh.visible) row.classList.add('hidden-part');
    row.title = '点击在模型中定位此 part';

    const swatch = document.createElement('span');
    swatch.className = 'part-color';
    swatch.style.background = part.color;
    const index = document.createElement('span');
    index.className = 'part-index';
    index.textContent = String(part.index + 1).padStart(2, '0');
    const name = document.createElement('span');
    name.className = 'part-name';
    name.textContent = part.name;
    row.append(swatch, name, index);
    row.addEventListener('click', () => selectPart(part));
    fragment.append(row);
  });
  ui.partList.append(fragment);
}

function selectPart(part) {
  clearSelection();
  if (!part) return;
  state.selectedPart = part;
  part.mesh.visible = true;
  state.selectionHelper = new THREE.BoxHelper(part.mesh, 0xffd166);
  state.selectionHelper.material.depthTest = false;
  state.selectionHelper.renderOrder = 50;
  scene.add(state.selectionHelper);
  renderPartList();
  renderSelectedPart();
}

function clearSelection() {
  if (state.selectionHelper) {
    scene.remove(state.selectionHelper);
    state.selectionHelper.geometry.dispose();
    state.selectionHelper.material.dispose();
    state.selectionHelper = null;
  }
  state.selectedPart = null;
  renderSelectedPart();
}

function renderSelectedPart() {
  const part = state.selectedPart;
  ui.selectedPart.hidden = !part;
  ui.selectedPartName.textContent = part
    ? `#${part.index + 1} ${part.name} · 位移 ${formatNumber(part.localDelta.length(), 3)}`
    : '—';
}

function fitView() {
  if (!state.currentRoot) return;
  const box = new THREE.Box3().setFromObject(state.currentRoot);
  if (box.isEmpty()) return;
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 0.05);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const distance = radius / Math.sin(fov / 2) * 1.15;
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (direction.lengthSq() < 0.01) direction.set(0.7, 0.5, 1).normalize();
  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(direction, distance);
  camera.near = Math.max(distance / 1000, 0.001);
  camera.far = Math.max(distance * 50, 100);
  camera.updateProjectionMatrix();
  controls.update();
}

function clearModel() {
  clearSelection();
  ui.partList.replaceChildren();
  state.parts = [];
  if (state.currentRoot) {
    modelGroup.remove(state.currentRoot);
    disposeLooseScene(state.currentRoot);
    state.currentRoot = null;
  }
  state.currentBox = null;
}

function disposeLooseScene(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    forEachMaterial(object.material, (material) => materials.add(material));
    const viewerPart = object.userData.auditViewerPart;
    if (viewerPart) {
      forEachMaterial(viewerPart.originalMaterial, (material) => materials.add(material));
      forEachMaterial(viewerPart.coloredMaterial, (material) => materials.add(material));
      delete object.userData.auditViewerPart;
    }
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    material.dispose?.();
  }
  textures.forEach((texture) => texture.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function raycastPart(event) {
  if (!state.currentRoot) return;
  const rect = ui.canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObjects(state.parts.map((part) => part.mesh), false)
    .find((entry) => entry.object.visible);
  if (hit?.object?.userData?.auditViewerPart) selectPart(hit.object.userData.auditViewerPart);
}

function navigate(step) {
  if (state.models.length < 2) return;
  const next = (state.currentIndex + step + state.models.length) % state.models.length;
  selectModel(next);
}

ui.tabs.forEach((tab) => tab.addEventListener('click', () => setCategory(tab.dataset.category)));
ui.search.addEventListener('input', () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => refreshModels(), 220);
});
ui.reason.addEventListener('change', () => refreshModels());
ui.explode.addEventListener('input', () => {
  stopBang();
  setExplodeAmount(Number(ui.explode.value) / 100, false);
});
ui.playBang.addEventListener('click', toggleBang);
ui.resetBang.addEventListener('click', () => {
  stopBang();
  state.playDirection = 1;
  setExplodeAmount(0, true);
});
ui.fitView.addEventListener('click', fitView);
ui.partColors.addEventListener('change', applyMaterialMode);
ui.wireframe.addEventListener('change', applyMaterialMode);
ui.autoRotate.addEventListener('change', () => { controls.autoRotate = ui.autoRotate.checked; });
ui.showAll.addEventListener('click', () => {
  state.parts.forEach((part) => { part.mesh.visible = true; });
  renderPartList();
});
ui.clearSelection.addEventListener('click', () => {
  clearSelection();
  renderPartList();
});
ui.hidePart.addEventListener('click', () => {
  const part = state.selectedPart;
  if (!part) return;
  part.mesh.visible = false;
  clearSelection();
  renderPartList();
});
ui.soloPart.addEventListener('click', () => {
  const part = state.selectedPart;
  if (!part) return;
  state.parts.forEach((entry) => { entry.mesh.visible = entry === part; });
  renderPartList();
});
ui.prev.addEventListener('click', () => navigate(-1));
ui.next.addEventListener('click', () => navigate(1));
ui.copyId.addEventListener('click', async () => {
  if (!state.currentItem) return;
  try {
    await navigator.clipboard.writeText(state.currentItem.id);
    showToast('对象 ID 已复制');
  } catch {
    showToast('浏览器未允许访问剪贴板', true);
  }
});
ui.canvas.addEventListener('pointerdown', (event) => {
  pointerDown = { x: event.clientX, y: event.clientY };
});
ui.canvas.addEventListener('pointerup', (event) => {
  if (!pointerDown) return;
  const distance = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
  pointerDown = null;
  if (distance < 5) raycastPart(event);
});
window.addEventListener('keydown', (event) => {
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
  if (event.key === 'ArrowLeft') navigate(-1);
  if (event.key === 'ArrowRight') navigate(1);
  if (event.code === 'Space') {
    event.preventDefault();
    toggleBang();
  }
});

async function initialize() {
  try {
    showLoading('正在读取审计清单…', 20);
    await loadSummary();
    const requestedCategory = new URLSearchParams(location.search).get('category');
    state.category = ['pass', 'fail'].includes(requestedCategory) ? requestedCategory : 'pass';
    ui.tabs.forEach((tab) => {
      const active = tab.dataset.category === state.category;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    ui.reasonWrap.hidden = state.category !== 'fail';
    await refreshModels();
  } catch (error) {
    console.error(error);
    hideLoading();
    ui.emptyState.hidden = false;
    ui.emptyState.textContent = `初始化失败：${error.message}`;
    showToast('无法初始化审阅器', true);
  }
}

initialize();
