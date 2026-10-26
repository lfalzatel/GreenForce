// ══════════════════════════════════════════════════════════════════════════
//  Green Force — Módulo Huerta Escolar
//  farm-overworld.js — Motor de Mapa Isométrico 2.5D (Edificaciones 3D & Huerta)
// ══════════════════════════════════════════════════════════════════════════

import {
  playAmbientChirp,
  playActionBlocked,
  playBuildingEnterSound,
  playClickSound,
  playWatering,
  playFertilizing,
  playHarvest,
  playUnlockPlot
} from "./farm-sounds.js?v=58";

import {
  logRiego,
  logFertilizacion,
  logCosecha,
  awardUserGamification,
  createPracticePlot,
  createCrop,
  DEFAULT_CROP_TYPES
} from "./huerta-service.js?v=63";

let onSelectZoneCallback = null;
let onRefreshDataCallback = null;

let currentSchoolCrops = [];
let currentPersonalCrops = [];
let currentSchoolPlots = [];
let currentPersonalPlots = [];
let currentCropTypes = [];
let isPlantingInProgress = false;

// Coordenadas Predeterminadas de los 4 Edificios Principales en el mapa 1200x1000
const DEFAULT_BUILDING_LAYOUT = {
  colegio: { x: 180, y: 120 },
  individual: { x: 680, y: 120 },
  locked_compost: { x: 180, y: 560 },
  locked_market: { x: 680, y: 560 }
};

const STORAGE_KEY_LAYOUT = "green_force_building_layout_v1";

function loadBuildingLayout() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_LAYOUT);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_BUILDING_LAYOUT, ...parsed };
    }
  } catch (e) {
    console.warn("Error cargando distribución de edificios:", e);
  }
  return { ...DEFAULT_BUILDING_LAYOUT };
}

function saveBuildingLayout(layout) {
  try {
    localStorage.setItem(STORAGE_KEY_LAYOUT, JSON.stringify(layout));
  } catch (e) {
    console.error("Error guardando distribución:", e);
  }
}

let cameraState = {
  x: 0,
  y: 0,
  scale: 0.85,
  isDragging: false,
  startX: 0,
  startY: 0,
  initialDistance: 0,
  isEditMode: false,
  activeDraggingBuilding: null,
  dragOffset: { x: 0, y: 0 }
};

let currentLayout = loadBuildingLayout();
let selectedPoiZone = 'colegio';
let farmerWorkerTimer = null;
let animalTimer = null;

export function renderOverworldMap(container, {
  schoolCrops = [],
  personalCrops = [],
  schoolPlots = [],
  personalPlots = [],
  cropTypes = [],
  user,
  role,
  onSelectZone,
  onRefreshData
}) {
  onSelectZoneCallback = onSelectZone;
  onRefreshDataCallback = onRefreshData;
  currentSchoolCrops = schoolCrops || [];
  currentPersonalCrops = personalCrops || [];
  currentSchoolPlots = schoolPlots || [];
  currentPersonalPlots = personalPlots || [];
  currentCropTypes = cropTypes || [];

  if (!container) return;

  const schoolPendingCount = countPendingCrops(currentSchoolCrops);

  currentLayout = loadBuildingLayout();

  container.innerHTML = `
    <div class="top-heroes-game-viewport" id="overworldViewport">
      
      <!-- 1. HUD SUPERIOR DE VIDEOJUEGO -->
      <div class="top-heroes-hud-bar">
        <div class="hud-player-profile">
          <div class="hud-avatar-circle">👩‍🌾</div>
          <div class="hud-player-meta">
            <span class="hud-player-name">${user ? (user.displayName || 'Estudiante') : 'Invitado'}</span>
            <span class="hud-level-badge"><i class="fas fa-star" style="color:#ffd54f;"></i> NIVEL 1</span>
          </div>
        </div>

        <div class="hud-resource-pills">
          <div class="resource-pill xp-pill" title="Experiencia Ganada">
            <span class="res-icon">🌟</span>
            <span class="res-value" id="hudXpValue">${user ? (user.farmXp || 0) : 0}</span>
          </div>
          <div class="resource-pill coins-pill" title="Monedas Verdes">
            <span class="res-icon">🪙</span>
            <span class="res-value" id="hudCoinsValue">${user ? (user.farmCoins || 0) : 0}</span>
          </div>
        </div>

        <div class="hud-view-toggle">
          <button class="hud-toggle-btn active" onclick="window.switchHuertaViewMode('juego')" title="Vista de Juego 2.5D">🌻</button>
          <button class="hud-toggle-btn" onclick="window.switchHuertaViewMode('clasica')" title="Vista Lista Clásica">📋</button>
        </div>
      </div>

      <!-- CONTROLES FLOTANTES DE CÁMARA (ZOOM Y MODO MOVER) -->
      <div class="map-hud-controls">
        <button class="map-ctrl-btn btn-zoom-ctrl" onclick="window.mapZoomIn()" title="Acercar Cámara">➕</button>
        <button class="map-ctrl-btn btn-zoom-ctrl" onclick="window.mapZoomOut()" title="Alejar Cámara">➖</button>
        <button class="map-ctrl-btn btn-zoom-ctrl" onclick="window.resetCameraView()" title="Centrar Vista">🎯</button>
        <button class="map-ctrl-btn" id="btnToggleEditMode" onclick="window.toggleMapEditMode()" title="Mover / Reubicar Edificios">🏗️</button>
        <button class="map-ctrl-btn" onclick="document.getElementById('huertaSettingsModal')?.classList.add('active')" title="Sonido y animaciones">⚙️</button>
      </div>

      <!-- BANNER SUPERIOR DEL MODO EDICIÓN -->
      <div class="edit-mode-banner" id="editModeBanner" style="display: none;">
        <span>🏗️ Modo Mover: Arrastra los edificios para cambiarlos de lugar</span>
        <div style="display: flex; gap: 4px;">
          <button class="btn-save-layout" onclick="window.saveMapLayout()">💾 Guardar</button>
          <button class="btn-cancel-layout" onclick="window.cancelMapLayout()">✖️</button>
        </div>
      </div>

      <!-- 2. TRACKER DE MISIÓN FLOTANTE -->
      <div class="hud-quest-tracker">
        <div class="quest-icon">📜</div>
        <div class="quest-text">
          <span class="quest-label">MISIÓN ACTUAL</span>
          <span class="quest-title" id="hudQuestTitle">${questTitleText(schoolPendingCount)}</span>
        </div>
      </div>

      <!-- 3. LIENZO NAVEGABLE 2.5D (WORLD STAGE DE 1200x1000 px) -->
      <div class="world-camera-stage" id="worldCameraStage">
        
        <!-- CIELO Y CLIMA ANIMADO -->
        <div class="iso-sky-layer">
          <div class="iso-cloud cloud-a">☁️</div>
          <div class="iso-cloud cloud-b">☁️</div>
          <div class="iso-sun-glow">☀️</div>

          <!-- Aves Volando por el Mapa -->
          <div class="flying-bird bird-1">🕊️<span class="bird-shadow"></span></div>
          <div class="flying-bird bird-2">🦅<span class="bird-shadow"></span></div>
        </div>

        <!-- PLANO DE TERRENO Y SENDEROS -->
        <div class="iso-terrain-grid" id="isoTerrainGrid">
          
          <!-- Cuadrícula de Colocación (Activa en Modo Edición) -->
          <div class="building-placement-grid"></div>

          <!-- Mariposas Revoloteando sobre las Flores -->
          <div class="flying-butterfly butterfly-1">🦋</div>
          <div class="flying-butterfly butterfly-2">🦋</div>

          <!-- SVG DE CAMINOS Y RÍO NATURAL (SIN CARRETES NI RAYAS EXTRAÑAS) -->
          <svg class="iso-paths-svg" viewBox="0 0 1200 1000" preserveAspectRatio="none">
            <!-- Orilla y Río Caudaloso con Aguas Turquesa Naturales -->
            <path d="M 0 740 Q 300 650 600 720 T 1200 760" stroke="#bcaaa4" stroke-width="110" fill="none" opacity="0.6" stroke-linecap="round" />
            <path d="M 0 740 Q 300 650 600 720 T 1200 760" stroke="#0288d1" stroke-width="84" fill="none" opacity="0.9" stroke-linecap="round" />
            <path d="M 0 740 Q 300 650 600 720 T 1200 760" stroke="#4fc3f7" stroke-width="40" stroke-dasharray="16, 12" fill="none" class="river-flow" opacity="0.75" />
            <path d="M 0 740 Q 300 650 600 720 T 1200 760" stroke="#ffffff" stroke-width="6" stroke-dasharray="6, 24" fill="none" class="river-flow" opacity="0.8" />

            <!-- Puente de Vigas de Roble sobre el Río -->
            <rect x="520" y="660" width="160" height="100" fill="#6d4c41" rx="8" stroke="#3e2723" stroke-width="5" />
            <line x1="535" y1="660" x2="535" y2="760" stroke="#4e342e" stroke-width="3" />
            <line x1="560" y1="660" x2="560" y2="760" stroke="#4e342e" stroke-width="3" />
            <line x1="585" y1="660" x2="585" y2="760" stroke="#4e342e" stroke-width="3" />
            <line x1="610" y1="660" x2="610" y2="760" stroke="#4e342e" stroke-width="3" />
            <line x1="635" y1="660" x2="635" y2="760" stroke="#4e342e" stroke-width="3" />
            <line x1="660" y1="660" x2="660" y2="760" stroke="#4e342e" stroke-width="3" />
            <rect x="520" y="656" width="160" height="8" fill="#8d6e63" stroke="#3e2723" stroke-width="2" rx="2" />
            <rect x="520" y="756" width="160" height="8" fill="#8d6e63" stroke="#3e2723" stroke-width="2" rx="2" />

            <!-- Senderos Naturales de Tierra Suave entre Edificios -->
            <path d="M 290 280 Q 420 360 600 470 Q 720 360 790 280" stroke="#d7ccc8" stroke-width="40" fill="none" opacity="0.4" stroke-linecap="round" />
            <path d="M 290 280 Q 420 360 600 470 Q 720 360 790 280" stroke="#bcaaa4" stroke-width="24" fill="none" opacity="0.65" stroke-linecap="round" />
            <path d="M 600 470 L 600 660" stroke="#bcaaa4" stroke-width="26" fill="none" opacity="0.65" stroke-linecap="round" />
            <path d="M 290 680 Q 450 560 600 470 Q 750 560 790 680" stroke="#bcaaa4" stroke-width="24" fill="none" opacity="0.65" stroke-linecap="round" />
          </svg>

          <!-- DECORACIONES NATURALES (Árboles Grandes y Flores) -->
          <div class="iso-decor tree-tl">🌲</div>
          <div class="iso-decor tree-tr">🌳</div>
          <div class="iso-decor tree-bl">🌲</div>
          <div class="iso-decor tree-br">🌳</div>
          <div class="iso-decor tree-mid">🌲</div>
          <div class="iso-decor flowers-l">🌸</div>
          <div class="iso-decor flowers-r">🌼</div>

          <!-- ANIMALES CAMINANDO Y PASTANDO EN EL TERRENO -->
          <div class="iso-animal-walker cow-walker" id="cowWalker">
            <span class="animal-sprite">🐮</span>
            <span class="farmer-shadow" style="width: 32px; height: 10px;"></span>
          </div>
          <div class="iso-animal-walker chicken-walker" id="chickenWalker">
            <span class="animal-sprite">🐔</span>
            <span class="farmer-shadow" style="width: 18px; height: 6px;"></span>
          </div>

          <!-- AGRICULTOR CAMINANTE EN EL SENDEROS (AVATAR TRABAJADOR) -->
          <div class="iso-farmer-avatar" id="farmerAvatar" style="top: 470px; left: 580px;">
            <div class="farmer-action-bubble" id="farmerBubble" style="display: none;">
              <span id="farmerTaskText">🛠️ Cuidando las plantas...</span>
            </div>
            <div class="farmer-sprite-wrapper" id="farmerSpriteWrapper">
              <span class="farmer-emoji" id="farmerEmoji">👩‍🌾</span>
              <span class="farmer-tool-icon" id="farmerToolIcon" style="display: none;">🔨</span>
            </div>
            <span class="farmer-shadow"></span>
          </div>

          <!-- EDIFICIO 1: ESCUELA IE BARRO BLANCO (ESTILO TOP HEROES) -->
          <div class="iso-building-structure school-building" id="building_colegio"
               style="left: ${currentLayout.colegio.x}px; top: ${currentLayout.colegio.y}px;"
               data-zone="colegio">
            <div class="building-map-pin school-pin">
              <i class="fas fa-map-marker-alt"></i> IE BARRO BLANCO
            </div>
            ${pendingBadgeHtml('colegio')}
            <div class="iso-building-sprite school-sprite">
              <img src="assets/images/farm/building_school.webp?v=63" class="iso-building-sprite-img" alt="IE Barro Blanco" draggable="false" />
            </div>
            <div class="building-title-plaque">🌾 Huerta Escolar • Entrar</div>

            <!-- HUERTA CON CERCA DE MADERA Y BANCALES DE CULTIVO -->
            ${getFencedHuertaGarden3D(currentSchoolCrops, currentSchoolPlots, 'colegio')}
          </div>

          <!-- EDIFICIO 2: MI GRANJA / RANCHO DEL ESTUDIANTE (ESTILO TOP HEROES) -->
          <div class="iso-building-structure farm-building" id="building_individual"
               style="left: ${currentLayout.individual.x}px; top: ${currentLayout.individual.y}px;"
               data-zone="individual">
            <div class="building-map-pin farm-pin">
              <i class="fas fa-star"></i> MI GRANJA
            </div>
            ${pendingBadgeHtml('individual')}
            <div class="iso-building-sprite ranch-sprite">
              <img src="assets/images/farm/building_house.webp?v=63" class="iso-building-sprite-img" alt="Mi Granja" draggable="false" />
            </div>
            <div class="building-title-plaque">👩‍🌾 Mi Parcela • Entrar</div>

            <!-- HUERTA CON CERCA DE MADERA Y BANCALES DE CULTIVO -->
            ${getFencedHuertaGarden3D(currentPersonalCrops, currentPersonalPlots, 'individual')}
          </div>

          <!-- EDIFICIO 3: COMPOSTERA ESCOLAR (Nivel 5) -->
          <div class="iso-building-structure locked-building" id="building_locked_compost"
               style="left: ${currentLayout.locked_compost.x}px; top: ${currentLayout.locked_compost.y}px;"
               data-zone="locked_compost">
            <div class="building-map-pin lock-pin">
              <i class="fas fa-lock"></i> COMPOSTERA
            </div>
            <div class="iso-building-sprite compost-sprite">
              <img src="assets/images/farm/building_compost.webp?v=63" class="iso-building-sprite-img" alt="Compostera" draggable="false" />
            </div>
            <div class="building-title-plaque" style="background: #4a5568; border-color: #a0aec0;">🔒 Nivel 5: Abonos</div>
          </div>

          <!-- EDIFICIO 4: MERCADO VERDE (Nivel 10) -->
          <div class="iso-building-structure locked-building" id="building_locked_market"
               style="left: ${currentLayout.locked_market.x}px; top: ${currentLayout.locked_market.y}px;"
               data-zone="locked_market">
            <div class="building-map-pin lock-pin">
              <i class="fas fa-lock"></i> MERCADO VERDE
            </div>
            <div class="iso-building-sprite market-sprite">
              <img src="assets/images/farm/building_market.webp?v=63" class="iso-building-sprite-img" alt="Mercado Verde" draggable="false" />
            </div>
            <div class="building-title-plaque" style="background: #4a5568; border-color: #a0aec0;">🔒 Nivel 10: Tienda</div>
          </div>

        </div>

      </div>

      <!-- MODAL FLOTANTE DE INTERIOR DE EDIFICIO Y BANCALES 2.5D (POR ENCIMA DEL MAPA) -->
      <div class="farm-building-modal-overlay" id="farmBuildingModal" style="display: none;" onclick="if(event.target===this) window.closeBuildingDialog()">
        <div class="farm-building-dialog-box">
          <div class="game-dialog-header">
            <div class="dialog-title-wrapper">
              <span class="dialog-building-icon" id="dialogBuildingIcon">🏫</span>
              <div class="dialog-titles">
                <h3 class="dialog-main-title" id="dialogBuildingTitle">IE Barro Blanco</h3>
                <span class="dialog-sub-title" id="dialogBuildingSubtitle">🌾 Camas de Siembra Colectiva</span>
              </div>
            </div>
            <button class="dialog-close-btn" onclick="window.closeBuildingDialog()">&times;</button>
          </div>

          <div class="dialog-stats-bar">
            <span class="stat-badge xp-badge"><i class="fas fa-star"></i> <strong id="dialogXp">0</strong> XP</span>
            <span class="stat-badge coins-badge"><i class="fas fa-coins"></i> <strong id="dialogCoins">0</strong> Monedas</span>
            <span class="dialog-hint">💧 Riego • 🍃 Abono • 🧺 Cosecha</span>
          </div>

          <!-- Cuerpo desplazable: acordeón de semillas + camas comparten un único scroll -->
          <div class="dialog-scroll-body" id="dialogScrollBody">
            <!-- ACORDEÓN DESPLEGABLE DE SIEMBRA ("uno escoger que va sembrar de un acordeón") -->
            <div class="planting-accordion-drawer" id="plantingAccordionDrawer" style="display: none;">
              <div class="accordion-drawer-header">
                <div class="accordion-drawer-title">
                  <span>🌱 Sembrar en:</span>
                  <strong id="accordionTargetPlotTitle" style="color: #ffd54f;">Bancal</strong>
                </div>
                <button class="accordion-close-btn" onclick="window.closePlantingAccordion()">✖️ Cerrar</button>
              </div>
              <div class="seeds-catalog-grid" id="seedsCatalogGrid">
                <!-- Semillas inyectadas dinámicamente -->
              </div>
            </div>

            <!-- PARRILLA VISUAL DE CAMAS DE MADERA 2.5D -->
            <div class="dialog-beds-visual-grid" id="dialogBedsGrid">
              <!-- Camas generadas dinámicamente -->
            </div>
          </div>

          <div class="game-dialog-footer">
            <button class="btn-back-to-map-dialog" onclick="window.closeBuildingDialog()">
              <i class="fas fa-map-marked-alt"></i> 🗺️ Volver a Explorar el Mapa
            </button>
          </div>
        </div>
      </div>

    </div>
  `;

  setupCameraControls();
  setupBuildingDragHandlers();
  playAmbientChirp();
  initFarmerWorkerAI();
  initAnimalWanderingAI();
}

// Actualiza datos y huertas del mapa ya dibujado, sin reconstruirlo (no corta animaciones ni parpadea)
export function updateOverworldData({
  schoolCrops = [],
  personalCrops = [],
  schoolPlots = [],
  personalPlots = [],
  cropTypes = []
}) {
  currentSchoolCrops = schoolCrops || [];
  currentPersonalCrops = personalCrops || [];
  currentSchoolPlots = schoolPlots || [];
  currentPersonalPlots = personalPlots || [];
  currentCropTypes = cropTypes || [];
  refreshGardensInPlace();
}

export function isOverworldRendered() {
  return !!document.getElementById("overworldViewport");
}

function countPendingCrops(crops) {
  const dueSoonMs = Date.now() + 43200000;
  return crops.filter(c => {
    const isWaterDue = c.nextWateringDue && c.nextWateringDue.toMillis() <= dueSoonMs;
    const isFertDue = c.nextFertilizingDue && c.nextFertilizingDue.toMillis() <= dueSoonMs;
    return isWaterDue || isFertDue || c.status === 'listo_para_cosecha';
  }).length;
}

function questTitleText(schoolPendingCount) {
  return schoolPendingCount > 0 ? `Atender ${schoolPendingCount} labor(es) en Huerta Escolar` : '¡Huerta saludable y al día!';
}

function pendingBadgeHtml(scope) {
  const isSchool = scope === 'colegio';
  const count = countPendingCrops(isSchool ? currentSchoolCrops : currentPersonalCrops);
  if (count === 0) return `<div id="pendingBadge_${scope}" style="display: none;"></div>`;
  return `<div id="pendingBadge_${scope}" class="iso-crate-badge ${isSchool ? '' : 'farm-crate'} pulse-bounce">${isSchool ? '🧺' : '🪴'} ${count} pendientes</div>`;
}

function refreshGardensInPlace() {
  ['colegio', 'individual'].forEach(scope => {
    const isSchool = scope === 'colegio';
    const garden = document.getElementById(`garden_${scope}`);
    if (garden) {
      garden.outerHTML = getFencedHuertaGarden3D(
        isSchool ? currentSchoolCrops : currentPersonalCrops,
        isSchool ? currentSchoolPlots : currentPersonalPlots,
        scope
      );
    }
    const badge = document.getElementById(`pendingBadge_${scope}`);
    if (badge) badge.outerHTML = pendingBadgeHtml(scope);
  });
  const quest = document.getElementById("hudQuestTitle");
  if (quest) quest.textContent = questTitleText(countPendingCrops(currentSchoolCrops));
}

// ══════════════════════════════════════════════════════════════════════════
//  NOTIFICACIONES TOAST DE VIDEOJUEGO (HUD TOAST CON ESTILO RPG)
// ══════════════════════════════════════════════════════════════════════════

window.showGameToast = function(msg, icon = '🌱', title = null) {
  let container = document.getElementById("gameToastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "gameToastContainer";
    container.className = "game-toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "game-toast-bubble";
  toast.innerHTML = `
    <div class="toast-icon-badge">${icon}</div>
    <div class="toast-content-body">
      ${title ? `<strong class="toast-title-text">${title}</strong>` : ''}
      <span class="toast-msg-text">${msg}</span>
    </div>
    <button class="toast-close-btn" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toast-fade-out");
    setTimeout(() => {
      if (toast && toast.parentNode) toast.parentNode.removeChild(toast);
    }, 350);
  }, 3200);
};

// Sobrescribir alert nativo para que nunca salgan ventanas feas del navegador
window.alert = function(msg) {
  window.showGameToast(msg, "🌱", "Green Force");
};

// ══════════════════════════════════════════════════════════════════════════
//  MODAL DE INTERIOR DE EDIFICIO Y CAMAS DE MADERA 2.5D (SOBRE EL MAPA)
// ══════════════════════════════════════════════════════════════════════════

window.openFarmBuildingModal = function(zone) {
  const modal = document.getElementById("farmBuildingModal");
  const iconEl = document.getElementById("dialogBuildingIcon");
  const titleEl = document.getElementById("dialogBuildingTitle");
  const subEl = document.getElementById("dialogBuildingSubtitle");
  const xpEl = document.getElementById("dialogXp");
  const coinsEl = document.getElementById("dialogCoins");
  const gridEl = document.getElementById("dialogBedsGrid");

  if (!modal || !gridEl) return;

  playBuildingEnterSound();

  const isSchool = zone === 'colegio';
  if (iconEl) iconEl.textContent = isSchool ? '🏫' : '🏡';
  if (titleEl) titleEl.textContent = isSchool ? 'IE Barro Blanco' : 'Mi Granja / Rancho';
  if (subEl) subEl.textContent = isSchool ? '🌾 Huerta Escolar Colectiva' : '👩‍🌾 Parcela de Práctica y Entrenamiento';

  const user = window.currentUserGlobal || null;
  if (xpEl) xpEl.textContent = user ? (user.farmXp || 0) : 0;
  if (coinsEl) coinsEl.textContent = user ? (user.farmCoins || 0) : 0;

  const currentCrops = isSchool ? currentSchoolCrops : currentPersonalCrops;
  const currentPlots = isSchool ? currentSchoolPlots : currentPersonalPlots;

  let html = '';
  const nowMs = Date.now();

  const drawer = document.getElementById("plantingAccordionDrawer");
  if (drawer) drawer.style.display = "none";

  if (isSchool) {
    // Solo bancales reales de Firestore: sembrar en IDs inventados crea cultivos huérfanos
    if (!currentPlots || currentPlots.length === 0) {
      html = `
        <div class="visual-planter-bed" style="grid-column: 1 / -1; text-align: center; padding: 20px;">
          <span style="font-size: 2.4rem;">🏫</span>
          <p style="color: #cbd5e0; margin: 8px 0 0;">Aún no hay bancales registrados en la huerta escolar. Un docente o líder debe crearlos.</p>
        </div>
      `;
    }

    currentPlots.forEach((plot, index) => {
      const crop = currentCrops.find(c => c.plotId === plot.id && c.status !== 'cosechado' && c.status !== 'perdido');
      html += renderVisualBedCard(plot, crop, index, nowMs);
    });
  } else {
    // Si es parcela individual (Mi Huerta)
    if (!currentPlots || currentPlots.length === 0) {
      for (let i = 1; i <= 3; i++) {
        html += `
          <div class="visual-planter-bed">
            <div class="visual-bed-header">
              <span class="visual-bed-title">🪴 Cama de Práctica #${i}</span>
              <span class="visual-bed-status-pill" style="color: #ffd54f;">Desbloqueada</span>
            </div>
            <div class="planter-box-container">
              <img src="assets/images/farm/garden_bed.webp?v=63" class="planter-box-texture-bg" alt="Cajón de madera" draggable="false" />
              <div class="empty-bed-action-zone">
                <span style="font-size: 2.2rem;">🪴</span>
                <button class="btn-open-planting-accordion" onclick="window.quickActivatePracticePlot(${i})">
                  ✨ + Activar y Sembrar 🪴
                </button>
              </div>
            </div>
          </div>
        `;
      }
    } else {
      currentPlots.forEach((plot, index) => {
        const crop = currentCrops.find(c => c.plotId === plot.id && c.status !== 'cosechado' && c.status !== 'perdido');
        html += renderVisualBedCard(plot, crop, index, nowMs);
      });
    }
  }

  gridEl.innerHTML = html;
  modal.classList.add("active");
  modal.style.display = "flex";
};

function renderVisualBedCard(plot, crop, index, nowMs) {
  if (!crop && plot.gameStatus === 'bloqueada') {
    return `
      <div class="visual-planter-bed bed-locked">
        <div class="visual-bed-header">
          <span class="visual-bed-title">${plot.name || `Bancal #${index + 1}`}</span>
          <span class="visual-bed-status-pill" style="color: #a0aec0;">🔒 Bloqueado</span>
        </div>
        <div class="planter-box-container">
          <img src="assets/images/farm/garden_bed.webp?v=63" class="planter-box-texture-bg" alt="Cajón de madera" draggable="false" style="filter: grayscale(0.8) brightness(0.6);" />
          <div class="empty-bed-action-zone">
            <span style="font-size: 2rem;">🔒</span>
            <small style="color: #e2e8f0; text-align: center; padding: 0 10px;">Cosecha el bancal anterior para desbloquearlo</small>
          </div>
        </div>
      </div>
    `;
  }

  if (crop) {
    const plantedMs = crop.plantedDate ? crop.plantedDate.toMillis() : nowMs;
    const harvestMs = crop.expectedHarvestDate ? crop.expectedHarvestDate.toMillis() : (plantedMs + 30 * 86400000);
    const totalCycle = Math.max(harvestMs - plantedMs, 1);
    const elapsed = Math.max(nowMs - plantedMs, 0);
    const growthRatio = Math.min(elapsed / totalCycle, 1.0);

    const isWaterDue = crop.nextWateringDue && crop.nextWateringDue.toMillis() <= nowMs + 43200000;
    const isFertDue = crop.nextFertilizingDue && crop.nextFertilizingDue.toMillis() <= nowMs + 43200000;
    const isReady = crop.status === 'listo_para_cosecha' || growthRatio >= 1.0;

    let stageIcon = crop.cropTypeIcon || '🥬';
    if (!isReady && growthRatio < 0.3) stageIcon = '🌱';
    else if (!isReady && growthRatio < 0.6) stageIcon = '🌿';

    const statusText = isReady ? '🧺 Cosecha Lista' : (isWaterDue ? '💧 Regar' : (isFertDue ? '🍃 Abonar' : '🌿 Creciendo'));

    return `
      <div class="visual-planter-bed">
        <div class="visual-bed-header">
          <span class="visual-bed-title">${plot.name || `Bancal #${index + 1}`}</span>
          <span class="visual-bed-status-pill">${statusText} • ${Math.round(growthRatio * 100)}%</span>
        </div>
        <div class="planter-box-container">
          <img src="assets/images/farm/garden_bed.webp?v=63" class="planter-box-texture-bg" alt="Cajón de madera" draggable="false" />
          <div class="crop-growth-avatar">
            <span class="crop-big-emoji">${stageIcon}</span>
            <span class="crop-variety-label">${crop.cropTypeName}</span>
          </div>
        </div>
        <div class="dialog-progress-track">
          <div class="dialog-progress-fill" style="width: ${Math.round(growthRatio * 100)}%;"></div>
        </div>
        <div class="dialog-bed-actions">
          <button class="bed-action-btn btn-action-water ${isWaterDue ? '' : 'disabled-btn'}" onclick="window.onMapDirectAction(event, 'riego', '${crop.id}')">
            💧 Regar
          </button>
          <button class="bed-action-btn btn-action-fert ${isFertDue ? '' : 'disabled-btn'}" onclick="window.onMapDirectAction(event, 'fertilizacion', '${crop.id}')">
            🍃 Abonar
          </button>
          ${isReady ? `
            <button class="bed-action-btn btn-action-harvest" onclick="window.onMapDirectAction(event, 'cosecha', '${crop.id}')">
              🧺 Cosechar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  } else {
    return `
      <div class="visual-planter-bed">
        <div class="visual-bed-header">
          <span class="visual-bed-title">${plot.name || `Bancal #${index + 1}`}</span>
          <span class="visual-bed-status-pill" style="color: #a5d6a7;">Tierra Fértil</span>
        </div>
        <div class="planter-box-container">
          <img src="assets/images/farm/garden_bed.webp?v=63" class="planter-box-texture-bg" alt="Cajón de madera" draggable="false" />
          <div class="empty-bed-action-zone">
            <span style="font-size: 2.2rem; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.6));">🪴</span>
            <button class="btn-open-planting-accordion" onclick="window.openPlantingAccordion('${plot.id}', '${plot.name || `Bancal #${index + 1}`}')">
              🌱 + Sembrar Cultivo
            </button>
          </div>
        </div>
      </div>
    `;
  }
}

let activePlantingPlotId = null;

window.openPlantingAccordion = function(plotId, plotName) {
  playClickSound();
  activePlantingPlotId = plotId;
  const drawer = document.getElementById("plantingAccordionDrawer");
  const titleEl = document.getElementById("accordionTargetPlotTitle");
  const grid = document.getElementById("seedsCatalogGrid");

  if (!drawer || !grid) return;
  if (titleEl) titleEl.textContent = plotName || "Bancal Seleccionado";

  // Las semillas salen del catálogo real de Firestore: createCrop rechaza IDs que no existen en cropTypes
  const availableSeeds = currentCropTypes.length > 0 ? currentCropTypes : DEFAULT_CROP_TYPES;

  let seedsHtml = '';
  availableSeeds.forEach(seed => {
    const safeName = String(seed.name || '').replace(/'/g, "\\'");
    seedsHtml += `
      <div class="seed-option-card" onclick="window.quickDirectPlant('${seed.id}', '${plotId}', '${safeName}')">
        <span class="seed-card-icon">${seed.icon || '🌱'}</span>
        <span class="seed-card-name">${seed.name}</span>
        <span class="seed-card-meta">⏱️ ${seed.daysToHarvest || '?'}d • 💧 c/${seed.wateringIntervalDays || 2}d</span>
        <button class="btn-plant-this-seed">🌱 Sembrar</button>
      </div>
    `;
  });

  grid.innerHTML = seedsHtml;
  drawer.style.display = "flex";
};

window.closePlantingAccordion = function() {
  playClickSound();
  const drawer = document.getElementById("plantingAccordionDrawer");
  if (drawer) drawer.style.display = "none";
};

// Toque sobre un bancal del mapa: vacío → selector de semillas directo; bloqueado → aviso
window.openPlotFromMap = function(scope, index) {
  selectedPoiZone = scope;
  const plots = scope === 'colegio' ? currentSchoolPlots : currentPersonalPlots;
  const plot = plots[index];

  if (!plot) {
    if (scope === 'individual') {
      window.openFarmBuildingModal('individual');
    } else {
      playActionBlocked();
      window.showGameToast("Este bancal aún no existe en la huerta escolar.", "🔒", "Bancal no disponible");
    }
    return;
  }
  if (plot.gameStatus === 'bloqueada') {
    playActionBlocked();
    window.showGameToast("Cosecha el bancal anterior para desbloquear este.", "🔒", "Bancal bloqueado");
    return;
  }

  window.openFarmBuildingModal(scope);
  window.openPlantingAccordion(plot.id, plot.name || `Bancal #${index + 1}`);
};

window.quickDirectPlant = async function(cropTypeId, plotId, seedName) {
  playClickSound();
  const user = window.currentUserGlobal || null;
  if (!user) {
    if (typeof window.showGameToast === 'function') {
      window.showGameToast("Debes iniciar sesión con tu cuenta de Green Force para sembrar.", "🔒", "Acceso Requerido");
    }
    return;
  }
  if (isPlantingInProgress) return;
  isPlantingInProgress = true;

  try {
    const drawer = document.getElementById("plantingAccordionDrawer");
    if (drawer) drawer.style.display = "none";

    // La siembra se ve en el mapa: cerrar el diálogo y dejar caer la semilla en el bancal
    window.closeBuildingDialog();
    const bedEl = document.querySelector(`.iso-crop-bed-cell[data-plot-id="${plotId}"]`);
    const seedIcon = (currentCropTypes.find(t => t.id === cropTypeId) || {}).icon;
    walkFarmerTo(bedEl);
    playFertilizing();
    animatePlanting(bedEl, '🌱');

    await createCrop({
      cropTypeId,
      plotId,
      quantity: 4,
      notes: "Sembrado desde el jardín 2.5D",
      user
    });

    awardRewards(bedEl, 20, 10, '#a5d6a7');
    spawnWorldText(bedEl, `${seedIcon || '🌱'} ${seedName}`, '#ffd54f');
    await awardUserGamification(user.uid, 20, 10);

    if (onRefreshDataCallback) {
      setTimeout(() => onRefreshDataCallback(), 900);
    }
  } catch (err) {
    console.error("Error al sembrar desde acordeón:", err);
    window.showGameToast("No se pudo sembrar: " + err.message, "⚠️", "Error");
  } finally {
    isPlantingInProgress = false;
  }
};

window.closeBuildingDialog = function() {
  playClickSound();
  const modal = document.getElementById("farmBuildingModal");
  if (modal) {
    modal.classList.remove("active");
    modal.style.display = "none";
  }
};

window.quickActivatePracticePlot = async function(slotNumber) {
  playClickSound();
  const user = window.currentUserGlobal || null;
  if (!user) {
    window.showGameToast("Debes iniciar sesión con tu cuenta de Green Force.", "🌱", "Acceso Requerido");
    return;
  }
  try {
    const name = `Cama de Práctica #${slotNumber}`;
    const description = "Parcela individual virtual de entrenamiento";
    await createPracticePlot({ name, description, user });
    window.showGameToast(`¡Cama de Práctica #${slotNumber} activada!`, "🪴", "Nueva Parcela");
    if (onRefreshDataCallback) {
      await onRefreshDataCallback();
      setTimeout(() => {
        window.openFarmBuildingModal('individual');
      }, 350);
    }
  } catch (err) {
    window.showGameToast(err.message, "⚠️", "Atención");
  }
};

window.triggerOpenSiembraModal = function(plotId) {
  playClickSound();
  window.closeBuildingDialog();
  const modal = document.getElementById("siembraModal");
  const selectPlot = document.getElementById("plotSelect");
  if (selectPlot && plotId) selectPlot.value = plotId;
  if (modal) modal.classList.add("active");
};

window.focusBuildingOnMap = function(zone) {
  const buildingEl = document.getElementById(`building_${zone}`);
  const viewport = document.getElementById("overworldViewport");
  if (!buildingEl || !viewport) return;

  const bLeft = parseFloat(buildingEl.style.left) || 200;
  const bTop = parseFloat(buildingEl.style.top) || 200;
  const vpWidth = viewport.clientWidth || 380;
  const vpHeight = viewport.clientHeight || 520;

  cameraState.x = (vpWidth / 2) - ((bLeft + 100) * cameraState.scale);
  cameraState.y = (vpHeight / 2) - ((bTop + 100) * cameraState.scale);
  clampCameraBounds(vpWidth, vpHeight);
  applyCameraTransform();
};

// ══════════════════════════════════════════════════════════════════════════
//  MODELOS SVG 2.5D ISOMÉTRICOS DE ALTA FIDELIDAD (ESTILO TOP HEROES)
// ══════════════════════════════════════════════════════════════════════════

function getSchool3DSVG() {
  return `
    <svg viewBox="0 0 240 210" width="220" height="195" class="iso-svg-building" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="schRoofL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#34495e"/>
          <stop offset="100%" stop-color="#1c2833"/>
        </linearGradient>
        <linearGradient id="schRoofR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#4a6572"/>
          <stop offset="100%" stop-color="#2c3e50"/>
        </linearGradient>
        <linearGradient id="schWallL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b0bec5"/>
          <stop offset="100%" stop-color="#78909c"/>
        </linearGradient>
        <linearGradient id="schWallR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cfd8dc"/>
          <stop offset="100%" stop-color="#90a4ae"/>
        </linearGradient>
        <linearGradient id="schDoor" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#8d5b36"/>
          <stop offset="100%" stop-color="#4a2e1b"/>
        </linearGradient>
        <linearGradient id="goldGlow" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff59d"/>
          <stop offset="100%" stop-color="#fbc02d"/>
        </linearGradient>
      </defs>

      <ellipse cx="120" cy="180" rx="95" ry="24" fill="rgba(0,0,0,0.35)" />

      <polygon points="35,160 120,135 205,160 120,185" fill="#546e7a" />
      <polygon points="35,160 120,185 120,192 35,167" fill="#37474f" />
      <polygon points="120,185 205,160 205,167 120,192" fill="#263238" />

      <polygon points="50,150 120,130 120,80 50,100" fill="url(#schWallL)" />
      <polygon points="120,130 190,150 190,100 120,80" fill="url(#schWallR)" />

      <polygon points="62,118 78,113 78,135 62,140" fill="url(#goldGlow)" stroke="#37474f" stroke-width="1.5" />
      <polygon points="88,110 104,105 104,127 88,132" fill="url(#goldGlow)" stroke="#37474f" stroke-width="1.5" />
      <polygon points="136,105 152,110 152,132 136,127" fill="url(#goldGlow)" stroke="#37474f" stroke-width="1.5" />
      <polygon points="162,113 178,118 178,140 162,135" fill="url(#goldGlow)" stroke="#37474f" stroke-width="1.5" />

      <polygon points="110,133 130,127 130,165 110,171" fill="url(#schDoor)" stroke="#271810" stroke-width="2" />
      <circle cx="116" cy="151" r="1.8" fill="#ffd54f" />
      <circle cx="124" cy="148" r="1.8" fill="#ffd54f" />

      <polygon points="40,100 120,65 120,78 40,113" fill="url(#schRoofL)" />
      <polygon points="120,65 200,100 200,113 120,78" fill="url(#schRoofR)" />

      <polygon points="100,75 140,65 140,25 100,35" fill="url(#schWallL)" />
      <polygon points="140,65 155,70 155,30 140,25" fill="url(#schWallR)" />
      <polygon points="95,36 120,5 145,26" fill="#c0392b" />
      <polygon points="120,5 160,31 145,26" fill="#e74c3c" />

      <circle cx="120" cy="48" r="11" fill="#fffde7" stroke="#b78103" stroke-width="2" />
      <line x1="120" y1="48" x2="120" y2="40" stroke="#333" stroke-width="2" stroke-linecap="round" />
      <line x1="120" y1="48" x2="126" y2="48" stroke="#333" stroke-width="1.8" stroke-linecap="round" />

      <line x1="120" y1="5" x2="120" y2="-15" stroke="#eceff1" stroke-width="2" />
      <path d="M 120 -15 Q 135 -20 145 -13 Q 135 -8 120 -10 Z" fill="#2e7d32" stroke="#1b5e20" stroke-width="0.8" />

      <circle cx="45" cy="162" r="8" fill="#43a047" />
      <circle cx="53" cy="166" r="6" fill="#66bb6a" />
      <circle cx="195" cy="162" r="8" fill="#43a047" />
      <circle cx="187" cy="166" r="6" fill="#66bb6a" />
      <circle cx="47" cy="160" r="2.5" fill="#e91e63" />
      <circle cx="193" cy="160" r="2.5" fill="#ffeb3b" />
    </svg>
  `;
}

function getRanch3DSVG() {
  return `
    <svg viewBox="0 0 240 210" width="220" height="195" class="iso-svg-building" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="rnchRoofL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b71c1c"/>
          <stop offset="100%" stop-color="#7f0000"/>
        </linearGradient>
        <linearGradient id="rnchRoofR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#e53935"/>
          <stop offset="100%" stop-color="#c62828"/>
        </linearGradient>
        <linearGradient id="rnchWoodL" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#8d5b36"/>
          <stop offset="100%" stop-color="#5a371c"/>
        </linearGradient>
        <linearGradient id="rnchWoodR" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#b27946"/>
          <stop offset="100%" stop-color="#824c24"/>
        </linearGradient>
      </defs>

      <ellipse cx="120" cy="180" rx="90" ry="24" fill="rgba(0,0,0,0.35)" />

      <polygon points="150,70 165,65 165,30 150,35" fill="#546e7a" />
      <polygon points="165,65 175,68 175,33 165,30" fill="#78909c" />
      <circle cx="168" cy="18" r="6" fill="rgba(236,239,241,0.5)" />
      <circle cx="173" cy="8" r="8" fill="rgba(236,239,241,0.4)" />
      <circle cx="180" cy="-4" r="10" fill="rgba(236,239,241,0.3)" />

      <polygon points="40,165 120,140 195,165 120,190" fill="#4e342e" />

      <polygon points="50,155 120,135 120,85 50,105" fill="url(#rnchWoodL)" />
      <line x1="50" y1="105" x2="120" y2="135" stroke="#3e2723" stroke-width="2.5" />
      <line x1="50" y1="155" x2="120" y2="85" stroke="#3e2723" stroke-width="2.5" />

      <polygon points="120,135 190,155 190,105 120,85" fill="url(#rnchWoodR)" />
      <line x1="120" y1="85" x2="190" y2="155" stroke="#4a2e1b" stroke-width="2.5" />
      <line x1="120" y1="135" x2="190" y2="105" stroke="#4a2e1b" stroke-width="2.5" />

      <polygon points="112,98 128,94 128,110 112,114" fill="#3e2723" />
      <path d="M 112 112 Q 120 122 130 112 Z" fill="#ffd54f" stroke="#f57f17" stroke-width="1" />

      <polygon points="110,140 130,134 130,172 110,178" fill="#3e2723" stroke="#211510" stroke-width="2" />
      <polygon points="112,143 128,138 128,170 112,175" fill="#6d4c41" />

      <polygon points="40,105 120,65 120,78 40,118" fill="url(#rnchRoofL)" />
      <polygon points="120,65 200,105 200,118 120,78" fill="url(#rnchRoofR)" />

      <line x1="102" y1="135" x2="102" y2="145" stroke="#333" stroke-width="1.5" />
      <circle cx="102" cy="148" r="4.5" fill="#ffe082" stroke="#ffb300" stroke-width="1.2" />

      <ellipse cx="65" cy="165" rx="7" ry="4" fill="#8d5b36" stroke="#4e342e" stroke-width="1.5" />
      <rect x="58" y="165" width="14" height="14" fill="#6d4c41" stroke="#4e342e" stroke-width="1.2" rx="2" />
      <line x1="58" y1="170" x2="72" y2="170" stroke="#333" stroke-width="1" />
      <line x1="58" y1="175" x2="72" y2="175" stroke="#333" stroke-width="1" />

      <circle cx="180" cy="168" r="9" fill="none" stroke="#5d4037" stroke-width="2" />
      <circle cx="180" cy="168" r="2.5" fill="#3e2723" />
      <line x1="171" y1="168" x2="189" y2="168" stroke="#5d4037" stroke-width="1.5" />
      <line x1="180" y1="159" x2="180" y2="177" stroke="#5d4037" stroke-width="1.5" />
    </svg>
  `;
}

function getCompost3DSVG() {
  return `
    <svg viewBox="0 0 200 170" width="170" height="145" class="iso-svg-building" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="145" rx="75" ry="18" fill="rgba(0,0,0,0.35)" />

      <polygon points="25,125 100,105 175,125 100,145" fill="#3e2723" />
      <polygon points="30,120 100,102 100,65 30,83" fill="#5d4037" />
      <polygon points="100,102 170,120 170,83 100,65" fill="#795548" />

      <line x1="30" y1="95" x2="100" y2="77" stroke="#271810" stroke-width="2" />
      <line x1="30" y1="107" x2="100" y2="89" stroke="#271810" stroke-width="2" />
      <line x1="100" y1="77" x2="170" y2="95" stroke="#271810" stroke-width="2" />
      <line x1="100" y1="89" x2="170" y2="107" stroke="#271810" stroke-width="2" />

      <ellipse cx="100" cy="62" rx="42" ry="16" fill="#1b120c" />
      <circle cx="90" cy="58" r="8" fill="#2d1d13" />
      <circle cx="105" cy="56" r="10" fill="#3e2723" />
      <circle cx="118" cy="60" r="7" fill="#4e342e" />

      <circle cx="85" cy="58" r="4" fill="#4caf50" />
      <circle cx="112" cy="54" r="3.5" fill="#81c784" />
      <circle cx="98" cy="64" r="4.5" fill="#388e3c" />

      <line x1="130" y1="62" x2="148" y2="15" stroke="#d7ccc8" stroke-width="3" stroke-linecap="round" />
      <rect x="144" y="10" width="10" height="7" rx="1.5" fill="#ffb300" stroke="#333" stroke-width="1" />

      <circle cx="100" cy="100" r="14" fill="#2e7d32" stroke="#ffd54f" stroke-width="2" />
      <text x="100" y="105" font-size="14" text-anchor="middle" fill="#fff">♻️</text>
    </svg>
  `;
}

function getMarket3DSVG() {
  return `
    <svg viewBox="0 0 200 170" width="170" height="145" class="iso-svg-building" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="145" rx="75" ry="18" fill="rgba(0,0,0,0.35)" />

      <polygon points="30,125 100,105 170,125 100,145" fill="#5d4037" />
      <polygon points="30,125 100,145 100,120 30,100" fill="#4e342e" />
      <polygon points="100,145 170,125 170,100 100,120" fill="#3e2723" />

      <line x1="42" y1="108" x2="42" y2="45" stroke="#8d5b36" stroke-width="4" stroke-linecap="round" />
      <line x1="158" y1="108" x2="158" y2="45" stroke="#8d5b36" stroke-width="4" stroke-linecap="round" />
      <line x1="100" y1="120" x2="100" y2="52" stroke="#5a371c" stroke-width="4" stroke-linecap="round" />

      <rect x="50" y="98" width="22" height="14" rx="2" fill="#8d6e63" stroke="#4e342e" stroke-width="1.5" />
      <circle cx="56" cy="103" r="3" fill="#e53935" />
      <circle cx="64" cy="103" r="3" fill="#e53935" />

      <rect x="76" y="104" width="22" height="14" rx="2" fill="#8d6e63" stroke="#4e342e" stroke-width="1.5" />
      <polygon points="80,106 87,112 85,104" fill="#fb8c00" />
      <polygon points="88,106 95,112 93,104" fill="#ff9800" />

      <rect x="105" y="104" width="22" height="14" rx="2" fill="#8d6e63" stroke="#4e342e" stroke-width="1.5" />
      <circle cx="112" cy="108" r="4" fill="#43a047" />
      <circle cx="120" cy="108" r="4" fill="#66bb6a" />

      <polygon points="25,50 100,20 175,50 100,75" fill="#ffffff" />
      <polygon points="40,44 55,38 70,62 55,68" fill="#2e7d32" />
      <polygon points="70,32 85,26 100,50 85,56" fill="#2e7d32" />
      <polygon points="100,20 115,26 130,50 115,44" fill="#2e7d32" />
      <polygon points="130,32 145,38 160,62 145,56" fill="#2e7d32" />

      <path d="M 25 50 Q 37 60 50 54 Q 62 65 75 58 Q 87 70 100 65 Q 112 70 125 58 Q 137 65 150 54 Q 162 60 175 50" fill="none" stroke="#1b5e20" stroke-width="3" />

      <line x1="140" y1="62" x2="140" y2="78" stroke="#ffb300" stroke-width="1.5" />
      <line x1="133" y1="78" x2="147" y2="78" stroke="#ffb300" stroke-width="2" />
      <ellipse cx="133" cy="85" rx="4" ry="2" fill="#ffe082" />
      <ellipse cx="147" cy="85" rx="4" ry="2" fill="#ffe082" />
    </svg>
  `;
}

// ══════════════════════════════════════════════════════════════════════════
//  HUERTA CON CERCA DE MADERA Y BANCALES ARADOS 2.5D (ESTILO TOP HEROES)
// ══════════════════════════════════════════════════════════════════════════

function getFencedHuertaGarden3D(cropsList, plotsList, scope) {
  const isSchool = scope === 'colegio';
  const label = isSchool ? '🌾 Huerta Escolar' : '🪴 Mi Parcela de Práctica';
  const nowMs = Date.now();

  let bedsHtml = '';
  const totalBeds = 6;

  for (let i = 0; i < totalBeds; i++) {
    const plot = (plotsList && plotsList[i]) ? plotsList[i] : null;
    const crop = (plot && cropsList) ? cropsList.find(c => c.plotId === plot.id && c.status !== 'cosechado' && c.status !== 'perdido') : null;

    // Bancal vacío o bloqueado: tierra sin plantas falsas, y un toque abre directamente el selector de semillas
    if (!crop) {
      const isLocked = !plot || plot.gameStatus === 'bloqueada';
      bedsHtml += `
        <div class="iso-crop-bed-cell ${isLocked ? 'bed-cell-locked' : 'bed-cell-empty'}"
             id="bed_${scope}_${i}" data-plot-id="${plot ? plot.id : ''}"
             title="${isLocked ? 'Bancal bloqueado' : 'Toca para sembrar'}"
             onclick="event.stopPropagation(); window.openPlotFromMap('${scope}', ${i});">
          <span class="bed-sprite-crop">${isLocked ? '🔒' : '➕'}</span>
        </div>
      `;
      continue;
    }

    let stageIcon = '🌱';
    let bubbleAction = null;
    let bubbleText = '';
    let bubbleClass = '';

    const plantedMs = crop.plantedDate ? crop.plantedDate.toMillis() : nowMs;
    const harvestMs = crop.expectedHarvestDate ? crop.expectedHarvestDate.toMillis() : (plantedMs + 30 * 86400000);
    const totalCycle = Math.max(harvestMs - plantedMs, 1);
    const elapsed = Math.max(nowMs - plantedMs, 0);
    const growthRatio = Math.min(elapsed / totalCycle, 1.0);

    const isWaterDue = crop.nextWateringDue && crop.nextWateringDue.toMillis() <= nowMs + 43200000;
    const isFertDue = crop.nextFertilizingDue && crop.nextFertilizingDue.toMillis() <= nowMs + 43200000;
    const isReady = crop.status === 'listo_para_cosecha' || growthRatio >= 1.0;

    if (isReady) stageIcon = crop.cropTypeIcon || '🥬';
    else if (growthRatio >= 0.6) stageIcon = crop.cropTypeIcon || '🪴';
    else if (growthRatio >= 0.2) stageIcon = '🌿';

    if (isReady) {
      bubbleAction = 'cosecha';
      bubbleText = '🧺';
      bubbleClass = 'ready-glow';
    } else if (isWaterDue) {
      bubbleAction = 'riego';
      bubbleText = '💧';
      bubbleClass = 'water-glow';
    } else if (isFertDue) {
      bubbleAction = 'fertilizacion';
      bubbleText = '🍃';
      bubbleClass = 'fert-glow';
    }

    bedsHtml += `
      <div class="iso-crop-bed-cell bed-cell-planted ${isReady ? 'bed-cell-ready' : ''}"
           id="bed_${scope}_${i}" data-plot-id="${plot.id}" data-crop-id="${crop.id}"
           title="${crop.cropTypeName}" onclick="event.stopPropagation(); window.openBedActionMenu('${crop.id}', this);">
        ${bubbleAction ? `<div class="mini-harvest-bubble ${bubbleClass}" data-action="${bubbleAction}">${bubbleText}</div>` : ''}
        <span class="bed-sprite-crop">${stageIcon}</span>
        <span class="bed-growth-bar"><span style="width: ${Math.round(growthRatio * 100)}%;"></span></span>
      </div>
    `;
  }

  return `
    <div class="iso-fenced-garden" id="garden_${scope}" onclick="event.stopPropagation(); window.openFarmBuildingModal('${scope}');">
      <div class="fenced-garden-banner">
        <span>${label}</span>
        <small class="tap-hint"><i class="fas fa-door-open"></i> Entrar</small>
      </div>
      <div class="fenced-garden-fence-top">
        <span class="fence-post">🪵</span>
        <span class="fence-rail">════</span>
        <span class="fence-post">🪵</span>
        <span class="fence-rail">════</span>
        <span class="fence-post">🪵</span>
      </div>
      <div class="fenced-garden-soil-field">
        ${bedsHtml}
      </div>
      <div class="fenced-garden-fence-bottom">
        <span class="fence-post">🪵</span>
        <span class="fence-rail">════</span>
        <span class="fence-post">🪵</span>
        <span class="fence-rail">════</span>
        <span class="fence-post">🪵</span>
      </div>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════════════════
//  MOTOR DE CÁMARA 2.5D (PAN, ZOOM Y PINCH TÁCTIL)
// ══════════════════════════════════════════════════════════════════════════

// Elementos de interfaz sobre el mapa: tocarlos nunca debe arrastrar la cámara
const CAMERA_IGNORE_SELECTOR = '.farm-building-modal-overlay, .top-heroes-hud-bar, .map-hud-controls, .edit-mode-banner, .hud-quest-tracker, .bed-action-menu';
let hasCameraInitialized = false;
let hasWindowCameraListeners = false;

function setupCameraControls() {
  const viewport = document.getElementById("overworldViewport");
  const stage = document.getElementById("worldCameraStage");
  if (!viewport || !stage) return;

  // Conservar la posición de cámara entre re-renderizados (p. ej. tras sembrar o regar)
  if (!hasCameraInitialized && viewport.clientWidth > 0) {
    centerCameraOnWorld(viewport);
    hasCameraInitialized = true;
  }
  applyCameraTransform();

  viewport.addEventListener("pointerdown", (e) => {
    if (!e.target.closest('.bed-action-menu, .bed-cell-planted')) closeBedActionMenu();
    if (e.target.closest(CAMERA_IGNORE_SELECTOR)) return;
    if (cameraState.isEditMode && e.target.closest('.iso-building-structure')) {
      return;
    }
    cameraState.isDragging = true;
    cameraState.startX = e.clientX - cameraState.x;
    cameraState.startY = e.clientY - cameraState.y;
    viewport.classList.add("is-panning");
  });

  setupPinchZoom(viewport);

  if (hasWindowCameraListeners) return;
  hasWindowCameraListeners = true;

  window.addEventListener("pointermove", (e) => {
    if (!cameraState.isDragging) return;
    const vp = document.getElementById("overworldViewport");
    if (!vp) return;
    cameraState.x = e.clientX - cameraState.startX;
    cameraState.y = e.clientY - cameraState.startY;
    clampCameraBounds(vp.clientWidth, vp.clientHeight);
    applyCameraTransform();
  });

  window.addEventListener("pointerup", () => {
    if (cameraState.isDragging) {
      cameraState.isDragging = false;
      const vp = document.getElementById("overworldViewport");
      if (vp) vp.classList.remove("is-panning");
    }
  });

  window.addEventListener("resize", () => {
    const vp = document.getElementById("overworldViewport");
    if (!vp || vp.clientWidth === 0) return;
    clampCameraBounds(vp.clientWidth, vp.clientHeight);
    applyCameraTransform();
  });
}

function centerCameraOnWorld(viewport) {
  const vpWidth = viewport.clientWidth || 380;
  const vpHeight = viewport.clientHeight || 520;
  cameraState.scale = Math.max(0.55, Math.min(vpWidth / 580, 0.95));
  cameraState.x = (vpWidth - (1200 * cameraState.scale)) / 2;
  cameraState.y = (vpHeight - (1000 * cameraState.scale)) / 2;
  clampCameraBounds(vpWidth, vpHeight);
}

function setupPinchZoom(viewport) {

  viewport.addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      cameraState.isDragging = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      cameraState.initialDistance = Math.hypot(dx, dy);
    }
  }, { passive: true });

  viewport.addEventListener("touchmove", (e) => {
    if (e.touches.length === 2 && cameraState.initialDistance > 0) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const currentDistance = Math.hypot(dx, dy);
      const factor = currentDistance / cameraState.initialDistance;

      let newScale = cameraState.scale * factor;
      newScale = Math.max(0.55, Math.min(1.5, newScale));
      cameraState.scale = newScale;
      cameraState.initialDistance = currentDistance;
      applyCameraTransform();
    }
  }, { passive: true });
}

function clampCameraBounds(vpWidth, vpHeight) {
  const scaledWidth = 1200 * cameraState.scale;
  const scaledHeight = 1000 * cameraState.scale;

  const minX = Math.min(0, vpWidth - scaledWidth - 100);
  const maxX = 100;
  const minY = Math.min(0, vpHeight - scaledHeight - 100);
  const maxY = 100;

  cameraState.x = Math.max(minX, Math.min(maxX, cameraState.x));
  cameraState.y = Math.max(minY, Math.min(maxY, cameraState.y));
}

function applyCameraTransform() {
  const stage = document.getElementById("worldCameraStage");
  if (!stage) return;
  stage.style.transform = `translate3d(${cameraState.x}px, ${cameraState.y}px, 0px) scale(${cameraState.scale})`;
}

window.mapZoomIn = function() {
  cameraState.scale = Math.min(1.5, cameraState.scale + 0.15);
  const viewport = document.getElementById("overworldViewport");
  if (viewport) clampCameraBounds(viewport.clientWidth, viewport.clientHeight);
  applyCameraTransform();
  playClickSound();
};

window.mapZoomOut = function() {
  cameraState.scale = Math.max(0.55, cameraState.scale - 0.15);
  const viewport = document.getElementById("overworldViewport");
  if (viewport) clampCameraBounds(viewport.clientWidth, viewport.clientHeight);
  applyCameraTransform();
  playClickSound();
};

window.resetCameraView = function({ silent = false } = {}) {
  const viewport = document.getElementById("overworldViewport");
  if (!viewport || viewport.clientWidth === 0) return;
  centerCameraOnWorld(viewport);
  hasCameraInitialized = true;
  applyCameraTransform();
  if (!silent) playClickSound();
};

// ══════════════════════════════════════════════════════════════════════════
//  SISTEMA DE EDICIÓN Y REUBICACIÓN DE EDIFICIOS (DRAG & DROP)
// ══════════════════════════════════════════════════════════════════════════

window.toggleMapEditMode = function() {
  cameraState.isEditMode = !cameraState.isEditMode;
  playClickSound();

  const viewport = document.getElementById("overworldViewport");
  const banner = document.getElementById("editModeBanner");
  const btn = document.getElementById("btnToggleEditMode");

  if (viewport) viewport.classList.toggle("is-edit-mode", cameraState.isEditMode);
  if (banner) banner.style.display = cameraState.isEditMode ? "flex" : "none";
  if (btn) btn.classList.toggle("active-mode", cameraState.isEditMode);
};

function setupBuildingDragHandlers() {
  const buildings = document.querySelectorAll(".iso-building-structure");

  buildings.forEach((el) => {
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;
    let isDraggingThis = false;
    let isTapCandidate = false;

    const onPointerDown = (e) => {
      startX = e.clientX;
      startY = e.clientY;
      isTapCandidate = true;

      if (!cameraState.isEditMode) {
        // En modo juego normal: NO abrir inmediatamente.
        // Permitir que el gesto sea panning del mapa si el usuario se mueve.
        return;
      }

      e.stopPropagation();
      isDraggingThis = true;
      el.classList.add("is-dragging");

      origLeft = parseFloat(el.style.left) || 0;
      origTop = parseFloat(el.style.top) || 0;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e) => {
      const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (dist > 8) {
        isTapCandidate = false; // Se movió más de 8px: es arrastre de cámara, NO un tap
      }

      if (!isDraggingThis || !cameraState.isEditMode) return;
      e.stopPropagation();

      const dx = (e.clientX - startX) / cameraState.scale;
      const dy = (e.clientY - startY) / cameraState.scale;

      let newLeft = Math.round(origLeft + dx);
      let newTop = Math.round(origTop + dy);

      newLeft = Math.max(40, Math.min(1000, newLeft));
      newTop = Math.max(60, Math.min(840, newTop));

      el.style.left = `${newLeft}px`;
      el.style.top = `${newTop}px`;

      const zone = el.getAttribute("data-zone");
      if (zone && currentLayout[zone]) {
        currentLayout[zone].x = newLeft;
        currentLayout[zone].y = newTop;
      }
    };

    const onPointerUp = (e) => {
      if (isDraggingThis) {
        isDraggingThis = false;
        el.classList.remove("is-dragging");
        try { el.releasePointerCapture(e.pointerId); } catch (err) {}
        playClickSound();
        return;
      }

      // La huerta cercada maneja sus propios toques (bancales y botón Entrar)
      if (e.target.closest('.iso-fenced-garden')) {
        isTapCandidate = false;
        return;
      }

      // Si no estábamos en modo edición y el movimiento fue mínimo (un tap genuino):
      if (!cameraState.isEditMode && isTapCandidate) {
        const dist = Math.hypot(e.clientX - startX, e.clientY - startY);
        if (dist < 8) {
          const zone = el.getAttribute("data-zone");
          if (zone) {
            window.onBuildingClick(zone);
          }
        }
      }
      isTapCandidate = false;
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", () => {
      isDraggingThis = false;
      isTapCandidate = false;
    });
  });
}

window.saveMapLayout = function() {
  saveBuildingLayout(currentLayout);
  playBuildingEnterSound();
  window.showGameToast("Distribución de edificios guardada con éxito.", "✨", "Mapa Guardado");
  window.toggleMapEditMode();
};

window.cancelMapLayout = function() {
  playClickSound();
  currentLayout = loadBuildingLayout();
  for (const [zone, pos] of Object.entries(currentLayout)) {
    const el = document.getElementById(`building_${zone}`);
    if (el) {
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
    }
  }
  window.toggleMapEditMode();
};

// ══════════════════════════════════════════════════════════════════════════
//  SELECCIÓN Y ENTRADA INMEDIATA A LA HUERTA
// ══════════════════════════════════════════════════════════════════════════

let lastBuildingClickTime = 0;
window.onBuildingClick = function(zone) {
  if (cameraState.isEditMode) return;
  const now = Date.now();
  if (now - lastBuildingClickTime < 450) return;
  lastBuildingClickTime = now;

  playClickSound();
  selectedPoiZone = zone;

  const buildingEl = document.getElementById(`building_${zone}`);
  if (buildingEl) {
    const bLeft = parseFloat(buildingEl.style.left) || 200;
    const bTop = parseFloat(buildingEl.style.top) || 200;

    const farmer = document.getElementById("farmerAvatar");
    const spriteWrapper = document.getElementById("farmerSpriteWrapper");
    if (farmer) {
      const currentLeft = parseFloat(farmer.style.left) || 480;
      if (spriteWrapper) {
        if (bLeft < currentLeft) spriteWrapper.classList.add("facing-left");
        else spriteWrapper.classList.remove("facing-left");
      }
      farmer.style.transition = "top 0.8s cubic-bezier(0.25, 1, 0.5, 1), left 0.8s cubic-bezier(0.25, 1, 0.5, 1)";
      farmer.style.top = `${bTop + 80}px`;
      farmer.style.left = `${bLeft + 30}px`;
    }
  }

  // Si es un edificio activo (Colegio o Mi Huerta), ABRIR EL DIÁLOGO DEL EDIFICIO SOBRE EL MAPA
  if (zone === 'colegio' || zone === 'individual') {
    window.openFarmBuildingModal(zone);
    return;
  }

  // Si está bloqueado (Compostera o Mercado), notificar con Game Toast con diseño
  if (zone.startsWith('locked')) {
    playActionBlocked();
    if (zone === 'locked_compost') {
      window.showGameToast("Requiere Nivel 5 de experiencia realizando labores de huerta.", "🔒", "Compostera Bloqueada");
    } else {
      window.showGameToast("Requiere Nivel 10 para comerciar semillas y cosechas.", "🔒", "Mercado Verde Bloqueado");
    }
  }
};

// ══════════════════════════════════════════════════════════════════════════
//  ACCIONES EN EL MUNDO: MENÚ SOBRE EL BANCAL + ANIMACIONES (SIN VENTANAS)
// ══════════════════════════════════════════════════════════════════════════

const DUE_SOON_MS = 43200000;
let isBedActionRunning = false;

function findCropById(cropId) {
  return [...currentSchoolCrops, ...currentPersonalCrops].find(c => c.id === cropId) || null;
}

function getCropActionState(crop) {
  const nowMs = Date.now();
  const plantedMs = crop.plantedDate ? crop.plantedDate.toMillis() : nowMs;
  const harvestMs = crop.expectedHarvestDate ? crop.expectedHarvestDate.toMillis() : (plantedMs + 30 * 86400000);
  const growthRatio = Math.min(Math.max(nowMs - plantedMs, 0) / Math.max(harvestMs - plantedMs, 1), 1.0);
  return {
    growthRatio,
    isWaterDue: !!(crop.nextWateringDue && crop.nextWateringDue.toMillis() <= nowMs + DUE_SOON_MS),
    isFertDue: !!(crop.nextFertilizingDue && crop.nextFertilizingDue.toMillis() <= nowMs + DUE_SOON_MS),
    isReady: crop.status === 'listo_para_cosecha' || growthRatio >= 1.0
  };
}

// "en 2d", "en 5h"… para las labores que aún no tocan
function timeUntilLabel(ts) {
  if (!ts) return '—';
  const diffMs = ts.toMillis() - Date.now();
  if (diffMs <= DUE_SOON_MS) return '¡Ya!';
  const days = Math.round(diffMs / 86400000);
  return days >= 1 ? `en ${days}d` : `en ${Math.max(1, Math.round(diffMs / 3600000))}h`;
}

// Posición de un elemento relativa al viewport del juego (x = centro, y = borde superior)
function getPointInViewport(el) {
  const viewport = document.getElementById("overworldViewport");
  if (!viewport || !el) return null;
  const vpRect = viewport.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2 - vpRect.left, y: r.top - vpRect.top, w: r.width, h: r.height, viewport };
}

function getBedElementForCrop(cropId) {
  return document.querySelector(`.iso-crop-bed-cell[data-crop-id="${cropId}"]`);
}

function closeBedActionMenu() {
  const menu = document.getElementById("bedActionMenu");
  if (menu) menu.remove();
  document.querySelectorAll('.bed-cell-selected').forEach(el => el.classList.remove('bed-cell-selected'));
}

window.openBedActionMenu = function(cropId, bedEl) {
  if (cameraState.isEditMode || isBedActionRunning) return;
  const crop = findCropById(cropId);
  if (!crop || !bedEl) return;

  closeBedActionMenu();
  playClickSound();
  bedEl.classList.add('bed-cell-selected');

  const st = getCropActionState(crop);
  const pos = getPointInViewport(bedEl);
  if (!pos) return;

  const menu = document.createElement('div');
  menu.id = 'bedActionMenu';
  menu.className = 'bed-action-menu';
  menu.innerHTML = `
    <div class="bed-menu-title">${crop.cropTypeIcon || '🌱'} ${crop.cropTypeName} <small>${Math.round(st.growthRatio * 100)}%</small></div>
    <div class="bed-menu-actions">
      <button class="bed-menu-btn ${st.isWaterDue ? 'is-due' : 'is-waiting'}" data-action="riego">
        <span class="bed-menu-icon">💧</span><span class="bed-menu-caption">${timeUntilLabel(crop.nextWateringDue)}</span>
      </button>
      <button class="bed-menu-btn ${st.isFertDue ? 'is-due' : 'is-waiting'}" data-action="fertilizacion">
        <span class="bed-menu-icon">🍃</span><span class="bed-menu-caption">${timeUntilLabel(crop.nextFertilizingDue)}</span>
      </button>
      <button class="bed-menu-btn ${st.isReady ? 'is-due' : 'is-waiting'}" data-action="cosecha">
        <span class="bed-menu-icon">🧺</span><span class="bed-menu-caption">${st.isReady ? '¡Ya!' : `${Math.round(st.growthRatio * 100)}%`}</span>
      </button>
    </div>
  `;
  pos.viewport.appendChild(menu);
  positionFloatingMenu(menu, pos);

  menu.querySelectorAll('.bed-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      if (action === 'cosecha' && st.isReady) {
        showHarvestQuantityStepper(menu, crop);
      } else {
        closeBedActionMenu();
        runBedAction(action, crop.id);
      }
    });
  });
};

function positionFloatingMenu(menu, pos) {
  const vpWidth = pos.viewport.clientWidth;
  const menuWidth = menu.offsetWidth || 200;
  const menuHeight = menu.offsetHeight || 90;
  const left = Math.max(8, Math.min(vpWidth - menuWidth - 8, pos.x - menuWidth / 2));
  // Encima del bancal; si no cabe (cerca del HUD), debajo
  let top = pos.y - menuHeight - 10;
  if (top < 140) top = pos.y + pos.h + 10;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

// Cantidad cosechada dentro del mismo menú: el dato es real y alimenta la investigación
function showHarvestQuantityStepper(menu, crop) {
  playClickSound();
  let qty = 1;
  menu.querySelector('.bed-menu-actions').outerHTML = `
    <div class="bed-menu-stepper">
      <span class="bed-menu-stepper-label">¿Cuántas unidades cosechaste?</span>
      <div class="bed-menu-stepper-row">
        <button class="stepper-btn" data-step="-1">−</button>
        <strong class="stepper-value" id="harvestQtyValue">1</strong>
        <button class="stepper-btn" data-step="1">+</button>
        <button class="stepper-confirm">🧺 Cosechar</button>
      </div>
    </div>
  `;
  menu.querySelectorAll('.stepper-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      qty = Math.max(1, qty + Number(btn.getAttribute('data-step')));
      document.getElementById('harvestQtyValue').textContent = qty;
      playClickSound();
    });
  });
  menu.querySelector('.stepper-confirm').addEventListener('click', (e) => {
    e.stopPropagation();
    closeBedActionMenu();
    runBedAction('cosecha', crop.id, qty);
  });
}

async function runBedAction(action, cropId, quantity = 1) {
  const crop = findCropById(cropId);
  const bedEl = getBedElementForCrop(cropId);
  if (!crop) return;

  const st = getCropActionState(crop);
  const allowed = action === 'riego' ? st.isWaterDue : action === 'fertilizacion' ? st.isFertDue : st.isReady;
  if (!allowed) {
    // El juego respeta los intervalos reales: el bancal "dice que no" en vez de abrir una ventana
    playActionBlocked();
    if (bedEl) {
      bedEl.classList.remove('bed-shake');
      void bedEl.offsetWidth;
      bedEl.classList.add('bed-shake');
    }
    const label = action === 'riego' ? `💧 ${timeUntilLabel(crop.nextWateringDue)}`
      : action === 'fertilizacion' ? `🍃 ${timeUntilLabel(crop.nextFertilizingDue)}`
      : `🌿 ${Math.round(st.growthRatio * 100)}%`;
    spawnWorldText(bedEl, `⏳ ${label}`, '#e2e8f0');
    return;
  }

  const user = window.currentUserGlobal || null;
  if (!user) {
    playActionBlocked();
    window.showGameToast("Inicia sesión con tu cuenta de Green Force para cuidar la huerta.", "🔒", "Acceso Requerido");
    return;
  }

  if (isBedActionRunning) return;
  isBedActionRunning = true;
  walkFarmerTo(bedEl);

  try {
    if (action === 'riego') {
      playWatering();
      animateWatering(bedEl);
      await logRiego(cropId, { notes: "Riego desde el mapa 2.5D", user });
      const interval = getCropTypeInterval(crop.cropTypeId, 'wateringIntervalDays', 2);
      crop.nextWateringDue = makeLocalTimestamp(Date.now() + interval * 86400000);
      awardRewards(bedEl, 10, 5, '#4fc3f7');
      await awardUserGamification(user.uid, 10, 5);
      refreshGardensAfter(900);
    } else if (action === 'fertilizacion') {
      playFertilizing();
      animateFertilizing(bedEl);
      await logFertilizacion(cropId, { product: "Compost escolar", notes: "Abono desde el mapa 2.5D", user });
      const interval = getCropTypeInterval(crop.cropTypeId, 'fertilizingIntervalDays', 21);
      crop.nextFertilizingDue = makeLocalTimestamp(Date.now() + interval * 86400000);
      awardRewards(bedEl, 15, 8, '#81c784');
      await awardUserGamification(user.uid, 15, 8);
      refreshGardensAfter(900);
    } else if (action === 'cosecha') {
      const result = await logCosecha(cropId, { quantity, unit: "unidades", isFinalHarvest: true, notes: "Cosecha desde el mapa 2.5D", user });
      animateHarvest(bedEl, crop.cropTypeIcon || '🥬');
      awardRewards(bedEl, 50, 25, '#ffd54f');
      await awardUserGamification(user.uid, 50, 25);
      if (result && result.plotUnlocked) {
        playUnlockPlot();
        // Desbloquear un bancal sí es un gran momento: merece la celebración completa
        window.dispatchEvent(new CustomEvent('huerta:celebrate', {
          detail: { kind: 'desbloqueo', title: `¡${result.unlockedPlotName || 'Nuevo bancal'} desbloqueado!`, subtitle: '+50 XP • +25 Monedas' }
        }));
      } else {
        playHarvest();
      }
      // La cosecha libera el bancal y puede desbloquear otro: recargar datos reales
      setTimeout(() => { if (onRefreshDataCallback) onRefreshDataCallback(); }, 1100);
    }
  } catch (err) {
    console.error("Error en labor del mapa:", err);
    playActionBlocked();
    window.showGameToast("No se pudo registrar la labor: " + err.message, "⚠️", "Error");
    if (onRefreshDataCallback) onRefreshDataCallback();
  } finally {
    isBedActionRunning = false;
  }
}

// Botones del diálogo del edificio: cierran el diálogo y la labor ocurre en el mapa
window.onMapDirectAction = function(evt, action, cropId) {
  if (evt) evt.stopPropagation();
  window.closeBuildingDialog();
  setTimeout(() => {
    const bedEl = getBedElementForCrop(cropId);
    if (action === 'cosecha' && bedEl) {
      window.openBedActionMenu(cropId, bedEl);
      const menu = document.getElementById('bedActionMenu');
      const crop = findCropById(cropId);
      if (menu && crop) showHarvestQuantityStepper(menu, crop);
    } else {
      runBedAction(action, cropId);
    }
  }, 250);
};

function getCropTypeInterval(cropTypeId, field, fallback) {
  const type = currentCropTypes.find(t => t.id === cropTypeId);
  return (type && type[field]) || fallback;
}

function makeLocalTimestamp(ms) {
  return { toMillis: () => ms };
}

function refreshGardensAfter(delayMs) {
  setTimeout(refreshGardensInPlace, delayMs);
}

// ── Animaciones ──────────────────────────────────────────────

function isAnimEnabled() {
  return localStorage.getItem('hh_anim_enabled') !== 'false';
}

function spawnFx(className, text, x, y, styleExtra = '') {
  const viewport = document.getElementById("overworldViewport");
  if (!viewport) return null;
  const el = document.createElement('div');
  el.className = `world-fx ${className}`;
  el.textContent = text;
  el.style.cssText = `left: ${x}px; top: ${y}px; ${styleExtra}`;
  viewport.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
  setTimeout(() => el.remove(), 2500);
  return el;
}

function spawnWorldText(bedEl, text, color) {
  const pos = getPointInViewport(bedEl);
  if (!pos) return;
  spawnFx('fx-float-text', text, pos.x, pos.y - 6, `color: ${color};`);
}

function pulseBed(bedEl, className, durationMs) {
  if (!bedEl) return;
  bedEl.classList.add(className);
  setTimeout(() => bedEl.classList.remove(className), durationMs);
}

function animateWatering(bedEl) {
  const pos = getPointInViewport(bedEl);
  if (!pos) return;
  pulseBed(bedEl, 'bed-wet', 1600);
  if (!isAnimEnabled()) return;
  spawnFx('fx-watering-can', '🚿', pos.x + pos.w * 0.35, pos.y - 34);
  for (let i = 0; i < 7; i++) {
    const dx = (Math.random() - 0.5) * pos.w * 0.8;
    spawnFx('fx-drop', '💧', pos.x + dx, pos.y - 20, `animation-delay: ${150 + i * 90}ms;`);
  }
}

function animateFertilizing(bedEl) {
  const pos = getPointInViewport(bedEl);
  if (!pos) return;
  pulseBed(bedEl, 'bed-fertilized', 1400);
  if (!isAnimEnabled()) return;
  ['🍃', '🟤', '🍂', '🍃', '🟤', '🍃'].forEach((bit, i) => {
    const dx = (Math.random() - 0.5) * pos.w;
    spawnFx('fx-sprinkle', bit, pos.x + dx, pos.y - 24, `animation-delay: ${i * 80}ms; --spin: ${Math.round((Math.random() - 0.5) * 540)}deg;`);
  });
}

function animateHarvest(bedEl, icon) {
  const pos = getPointInViewport(bedEl);
  if (!pos) return;
  pulseBed(bedEl, 'bed-harvested', 1200);
  if (!isAnimEnabled()) return;
  const target = getPointInViewport(document.getElementById('hudCoinsValue'));
  const dx = target ? target.x - pos.x : 0;
  const dy = target ? target.y - pos.y : -200;
  for (let i = 0; i < 3; i++) {
    spawnFx('fx-harvest-fly', icon, pos.x, pos.y + pos.h / 2, `--dx: ${dx}px; --dy: ${dy}px; animation-delay: ${i * 120}ms;`);
  }
}

function animatePlanting(bedEl, icon) {
  const pos = getPointInViewport(bedEl);
  if (!pos) return;
  pulseBed(bedEl, 'bed-planted-pop', 1200);
  if (!isAnimEnabled()) return;
  spawnFx('fx-seed-drop', '🌰', pos.x, pos.y - 40);
  setTimeout(() => spawnFx('fx-sprout-pop', icon || '🌱', pos.x, pos.y + pos.h / 2 - 10), 550);
}

// "+XP" que vuela del bancal a la barra superior y suma en vivo
function awardRewards(bedEl, xp, coins, color) {
  spawnWorldText(bedEl, `+${xp} XP`, color);
  const pos = getPointInViewport(bedEl);
  const xpTarget = getPointInViewport(document.getElementById('hudXpValue'));
  if (pos && xpTarget && isAnimEnabled()) {
    spawnFx('fx-xp-orb', '🌟', pos.x, pos.y, `--dx: ${xpTarget.x - pos.x}px; --dy: ${xpTarget.y - pos.y}px;`);
  }
  setTimeout(() => {
    bumpHudValue('hudXpValue', xp);
    bumpHudValue('hudCoinsValue', coins);
  }, 750);
}

function bumpHudValue(id, amount) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = (Number(el.textContent) || 0) + amount;
  const pill = el.closest('.resource-pill');
  if (pill) {
    pill.classList.remove('pill-bump');
    void pill.offsetWidth;
    pill.classList.add('pill-bump');
  }
}

function walkFarmerTo(bedEl) {
  const farmer = document.getElementById("farmerAvatar");
  const stage = document.getElementById("worldCameraStage");
  if (!farmer || !stage || !bedEl) return;
  const stageRect = stage.getBoundingClientRect();
  const r = bedEl.getBoundingClientRect();
  const worldX = (r.left - stageRect.left) / cameraState.scale;
  const worldY = (r.bottom - stageRect.top) / cameraState.scale;
  const spriteWrapper = document.getElementById("farmerSpriteWrapper");
  if (spriteWrapper) spriteWrapper.classList.toggle("facing-left", worldX < (parseFloat(farmer.style.left) || 0));
  farmer.style.transition = "top 0.6s ease-out, left 0.6s ease-out";
  farmer.style.left = `${worldX - 10}px`;
  farmer.style.top = `${worldY - 20}px`;
}

// ══════════════════════════════════════════════════════════════════════════
//  IA DE RUTINAS DE TRABAJO DEL GRANJERO Y ANIMALES
// ══════════════════════════════════════════════════════════════════════════

function initFarmerWorkerAI() {
  if (farmerWorkerTimer) clearInterval(farmerWorkerTimer);

  const farmer = document.getElementById("farmerAvatar");
  const bubble = document.getElementById("farmerBubble");
  const taskText = document.getElementById("farmerTaskText");
  const spriteWrapper = document.getElementById("farmerSpriteWrapper");
  if (!farmer || !bubble || !taskText) return;

  const waypoints = [
    { x: 310, y: 260, text: "🌱 Cuidando los bancales de la Escuela...", tool: "💧" },
    { x: 600, y: 470, text: "🪵 Cruzando el sendero central...", tool: "🚶" },
    { x: 790, y: 260, text: "🌻 Sembrando flores en Mi Parcela...", tool: "🪴" },
    { x: 600, y: 660, text: "🌉 Limpiando las maderas del puente...", tool: "🧹" },
    { x: 310, y: 680, text: "🍂 Aireando el abono en la compostera...", tool: "🛠️" }
  ];

  let currentWpIndex = 0;

  farmerWorkerTimer = setInterval(() => {
    if (cameraState.isEditMode) return;

    currentWpIndex = (currentWpIndex + 1) % waypoints.length;
    const wp = waypoints[currentWpIndex];

    const currentLeft = parseFloat(farmer.style.left) || 480;
    if (spriteWrapper) {
      if (wp.x < currentLeft) spriteWrapper.classList.add("facing-left");
      else spriteWrapper.classList.remove("facing-left");
    }

    farmer.style.transition = "top 4s cubic-bezier(0.4, 0, 0.2, 1), left 4s cubic-bezier(0.4, 0, 0.2, 1)";
    farmer.style.top = `${wp.y}px`;
    farmer.style.left = `${wp.x}px`;

    setTimeout(() => {
      taskText.innerHTML = wp.text;
      bubble.style.display = "block";
      setTimeout(() => { bubble.style.display = "none"; }, 3500);
    }, 4000);
  }, 10000);
}

function initAnimalWanderingAI() {
  if (animalTimer) clearInterval(animalTimer);

  const cow = document.getElementById("cowWalker");
  const chicken = document.getElementById("chickenWalker");

  const cowSpots = [
    { top: "78%", left: "24%" },
    { top: "82%", left: "30%" },
    { top: "75%", left: "20%" },
    { top: "80%", left: "26%" }
  ];

  const chickenSpots = [
    { top: "44%", left: "74%" },
    { top: "40%", left: "78%" },
    { top: "48%", left: "72%" },
    { top: "42%", left: "76%" }
  ];

  let cIndex = 0;
  let chIndex = 0;

  animalTimer = setInterval(() => {
    if (cameraState.isEditMode) return;

    cIndex = (cIndex + 1) % cowSpots.length;
    chIndex = (chIndex + 1) % chickenSpots.length;

    if (cow) {
      cow.style.top = cowSpots[cIndex].top;
      cow.style.left = cowSpots[cIndex].left;
    }
    if (chicken) {
      chicken.style.top = chickenSpots[chIndex].top;
      chicken.style.left = chickenSpots[chIndex].left;
    }
  }, 7000);
}

// Generador de Efectos Flotantes de Partículas (+XP)
export function spawnFloatingText(text, x, y, color = "#ffd54f") {
  const el = document.createElement("div");
  el.className = "floating-action-text";
  el.textContent = text;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  el.style.color = color;
  document.body.appendChild(el);

  setTimeout(() => {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }, 1400);
}
