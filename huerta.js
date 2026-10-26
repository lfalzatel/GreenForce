// ══════════════════════════════════════════════════════════════════════════
//  Green Force — Módulo Bitácora de Cultivos (Huerta Escolar)
//  huerta.js — Lógica de Interfaz de Usuario y Controladores
// ══════════════════════════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js?v=63";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  seedHuertaIfNeeded,
  getCropTypes,
  getPlots,
  getActiveCrops,
  getCropById,
  createCrop,
  logRiego,
  logFertilizacion,
  logCosecha,
  logIncidencia,
  getCropEvents,
  addCropType,
  addPlot,
  saveUserViewPreference,
  awardUserGamification,
  createPracticePlot,
  assignIndividualRealPlot
} from "./huerta-service.js?v=63";
import { uploadOrCompressPhoto } from "./image-utils.js?v=63";
import { renderFarmGame } from "./farm-game.js?v=63";
import { renderOverworldMap, updateOverworldData, isOverworldRendered } from "./farm-overworld.js?v=63";
import { initCelebrationOverlay } from "./celebration-overlay.js?v=63";

function showGameAlert(message, icon = "🌱", title = "Green Force") {
  if (typeof window.showGameToast === "function") {
    window.showGameToast(message, icon, title);
  } else {
    alert(message);
  }
}

let currentUser = null;
let userRole = "integrante"; // 'admin', 'lider', 'integrante'
let cropTypesList = [];
let plotsList = [];
let activeCropsList = [];
let selectedCropId = null;
let activeView = "juego"; // 'juego' | 'clasica'
let activeScope = "colegio"; // 'colegio' | 'individual'
let currentGameState = "overworld"; // 'overworld' | 'board'

// Elementos DOM
const authStatusElement = document.getElementById("authStatus");
const pendingTasksContainer = document.getElementById("pendingTasksContainer");
const activeCropsContainer = document.getElementById("activeCropsContainer");
const cropTypesContainer = document.getElementById("cropTypesContainer");
const newSiembraBtn = document.getElementById("newSiembraBtn");
const siembraModal = document.getElementById("siembraModal");
const closeSiembraModalBtn = document.getElementById("closeSiembraModalBtn");
const siembraForm = document.getElementById("siembraForm");

// Inicialización de la aplicación
document.addEventListener("DOMContentLoaded", () => {
  initCelebrationOverlay();
  applyGameModeLayout(activeView === "juego");

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await fetchUserRole(user.uid);
      updateAuthUI(user);

      // Precargar datos de la huerta
      await seedHuertaIfNeeded();
      await loadHuertaData();
    } else {
      currentUser = null;
      userRole = "invitado";
      updateAuthUI(null);
      renderUnauthenticatedState();
      await loadHuertaData();
    }
  });

  setupEventListeners();
  setupSettingsModal();
  setupScopeListeners();
  setupPracticePlotForm();
});

async function fetchUserRole(uid) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      const data = userDoc.data();
      userRole = data.role || "integrante";
      if (data.preferredView) {
        activeView = data.preferredView;
        switchViewTab(activeView);
      }
    }
  } catch (err) {
    console.warn("Error al cargar rol del usuario:", err);
    userRole = "integrante";
  }
}

function updateAuthUI(user) {
  if (authStatusElement) {
    if (user) {
      authStatusElement.innerHTML = `
        <span class="user-badge"><i class="fas fa-user-circle"></i> ${user.displayName || user.email} (${userRole})</span>
      `;
    } else {
      authStatusElement.innerHTML = `
        <a href="login.html" class="btn btn-sm btn-outline"><i class="fas fa-sign-in-alt"></i> Iniciar Sesión</a>
      `;
    }
  }

  // Visibilidad de acciones reservadas para Admin / Líder
  const isAdminOrLider = userRole === "admin" || userRole === "lider";
  if (newSiembraBtn) {
    newSiembraBtn.style.display = (isAdminOrLider || activeScope === 'individual') ? "inline-flex" : "none";
  }
  const practiceBtn = document.getElementById("newPracticePlotBtn");
  if (practiceBtn) {
    practiceBtn.style.display = (user && activeScope === 'individual') ? "inline-flex" : "none";
  }
}

function renderUnauthenticatedState() {
  if (pendingTasksContainer) {
    pendingTasksContainer.innerHTML = `
      <div class="glass-card warning-card">
        <i class="fas fa-lock"></i> Debes iniciar sesión con tu cuenta de Green Force para ver los cultivos y registrar tareas.
      </div>
    `;
  }
  if (activeCropsContainer) activeCropsContainer.innerHTML = "";
  if (cropTypesContainer) cropTypesContainer.innerHTML = "";
}

async function loadHuertaData() {
  try {
    const userUid = currentUser ? currentUser.uid : null;
    window.currentUserGlobal = currentUser;
    window.switchHuertaViewModeGlobal = switchViewTab;
    window.switchHuertaViewMode = switchViewTab;

    const [types, plots, crops, schoolCrops, personalCrops, schoolPlots, personalPlots] = await Promise.all([
      getCropTypes(),
      getPlots(activeScope, userUid),
      getActiveCrops(activeScope, userUid),
      getActiveCrops('colegio', null),
      getActiveCrops('individual', userUid),
      getPlots('colegio', null),
      getPlots('individual', userUid)
    ]);

    cropTypesList = types;
    plotsList = plots;
    activeCropsList = crops;

    populateCropTypeOptions();
    populatePlotOptions();
    renderPendingTasks();
    renderActiveCrops();
    renderCropTypesCatalog();

    // Renderizado según estado del juego (Overworld vs Board)
    const farmContainer = document.getElementById("farmGameContainer");
    if (farmContainer) {
      if (currentGameState === 'overworld' && isOverworldRendered()) {
        // Mapa ya dibujado: refrescar solo las huertas para no cortar animaciones ni mover la cámara
        updateOverworldData({ schoolCrops, personalCrops, schoolPlots, personalPlots, cropTypes: cropTypesList });
      } else if (currentGameState === 'overworld') {
        renderOverworldMap(farmContainer, {
          schoolCrops,
          personalCrops,
          schoolPlots,
          personalPlots,
          cropTypes: cropTypesList,
          user: currentUser,
          role: userRole,
          onSelectZone: (zone) => {
            activeScope = zone;
            if (typeof window.focusBuildingOnMap === 'function') {
              window.focusBuildingOnMap(zone);
            }
          },
          onRefreshData: loadHuertaData
        });
      } else {
        renderFarmGame(farmContainer, {
          crops: activeCropsList,
          plots: plotsList,
          user: currentUser,
          role: userRole,
          scope: activeScope,
          onRefreshData: loadHuertaData,
          onBackToMap: () => {
            currentGameState = 'overworld';
            loadHuertaData();
          }
        });
      }
    }
  } catch (err) {
    console.error("Error al cargar datos de la huerta:", err);
  }
}

function setupScopeListeners() {
  const btnColegio = document.getElementById("scopeTabColegio");
  const btnIndividual = document.getElementById("scopeTabIndividual");
  const practiceBtn = document.getElementById("newPracticePlotBtn");

  window.switchScopeGlobal = async (scope) => {
    if (scope === "individual" && !currentUser) {
      showGameAlert("Debes iniciar sesión con tu cuenta de Green Force para acceder a 'Mi huerta'.", "🔒", "Acceso Requerido");
      return;
    }
    activeScope = scope;
    if (btnColegio) {
      btnColegio.classList.toggle("active", scope === "colegio");
    }
    if (btnIndividual) {
      btnIndividual.classList.toggle("active", scope === "individual");
    }
    if (practiceBtn) {
      practiceBtn.style.display = (currentUser && scope === "individual") ? "inline-flex" : "none";
    }
    updateAuthUI(currentUser);

    if (activeView === 'juego') {
      currentGameState = "overworld";
      if (typeof window.focusBuildingOnMap === 'function') {
        window.focusBuildingOnMap(scope);
      }
    } else {
      currentGameState = "board";
      await loadHuertaData();
    }
  };

  if (btnColegio) {
    btnColegio.addEventListener("click", () => window.switchScopeGlobal("colegio"));
  }

  if (btnIndividual) {
    btnIndividual.addEventListener("click", () => window.switchScopeGlobal("individual"));
  }
}

function setupPracticePlotForm() {
  const btnNewPractice = document.getElementById("newPracticePlotBtn");
  const modalPractice = document.getElementById("practicePlotModal");
  const closeBtn = document.getElementById("closePracticePlotModalBtn");
  const formPractice = document.getElementById("practicePlotForm");

  if (btnNewPractice && modalPractice) {
    btnNewPractice.addEventListener("click", () => modalPractice.classList.add("active"));
  }
  if (closeBtn && modalPractice) {
    closeBtn.addEventListener("click", () => modalPractice.classList.remove("active"));
  }

  if (formPractice) {
    formPractice.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) return;
      const name = document.getElementById("practicePlotNameInput").value;
      const description = document.getElementById("practicePlotDescInput").value;

      try {
        await createPracticePlot({ name, description, user: currentUser });
        modalPractice.classList.remove("active");
        formPractice.reset();
        await loadHuertaData();
        showGameAlert("¡Cama de práctica virtual creada con éxito!", "🪴", "Bancal Creado");
      } catch (err) {
        showGameAlert(err.message, "⚠️", "Error");
      }
    });
  }
}

// ──────────────────────────────────────────────────────────────
//  RENDERIZADO: PENDIENTES HOY
// ──────────────────────────────────────────────────────────────
function renderPendingTasks() {
  if (!pendingTasksContainer) return;

  const nowMs = Date.now();
  const pendingTasks = [];

  activeCropsList.forEach(crop => {
    if (crop.status === 'cosechado' || crop.status === 'perdido') return;

    // Riego vencido o debido hoy
    if (crop.nextWateringDue) {
      const dueMs = crop.nextWateringDue.toMillis();
      if (dueMs <= nowMs + (12 * 60 * 60 * 1000)) { // Hoy o vencido
        pendingTasks.push({
          type: 'riego',
          title: `Riego pendiente: ${crop.cropTypeName}`,
          subtitle: crop.plotName || "Sin bancal asignado",
          cropId: crop.id,
          icon: "💧",
          badgeClass: "badge-water"
        });
      }
    }

    // Abonado vencido
    if (crop.nextFertilizingDue) {
      const dueMs = crop.nextFertilizingDue.toMillis();
      if (dueMs <= nowMs + (12 * 60 * 60 * 1000)) {
        pendingTasks.push({
          type: 'fertilizacion',
          title: `Abono pendiente: ${crop.cropTypeName}`,
          subtitle: crop.plotName || "Sin bancal asignado",
          cropId: crop.id,
          icon: "🍃",
          badgeClass: "badge-fert"
        });
      }
    }

    // Listo para cosecha
    if (crop.status === 'listo_para_cosecha') {
      pendingTasks.push({
        type: 'cosecha',
        title: `¡Listo para cosecha!: ${crop.cropTypeName}`,
        subtitle: crop.plotName || "Sin bancal asignado",
        cropId: crop.id,
        icon: "🧺",
        badgeClass: "badge-harvest"
      });
    }
  });

  if (pendingTasks.length === 0) {
    pendingTasksContainer.innerHTML = `
      <div class="glass-card success-card">
        <i class="fas fa-check-circle"></i> ¡Excelente! No hay riegos ni abonos pendientes por hoy en la huerta.
      </div>
    `;
    return;
  }

  // Notificación local del navegador (Fase 4: Resiliencia en plan Spark)
  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("🌱 Green Force — Huerta Escolar", {
        body: `Tienes ${pendingTasks.length} tarea(s) pendiente(s) en la huerta para el día de hoy.`,
        icon: "assets/icons/icon-192.png"
      });
    } catch (e) {
      console.warn("No se pudo mostrar la notificación del navegador:", e);
    }
  } else if ("Notification" in window && Notification.permission !== "denied") {
    Notification.requestPermission();
  }

  let html = `<div class="tasks-grid">`;
  pendingTasks.forEach(task => {
    html += `
      <div class="task-card ${task.badgeClass}">
        <div class="task-icon">${task.icon}</div>
        <div class="task-info">
          <h4>${task.title}</h4>
          <p>${task.subtitle}</p>
        </div>
        <button class="btn btn-sm btn-action" onclick="window.quickAction('${task.type}', '${task.cropId}')">
          Registrar ${task.type}
        </button>
      </div>
    `;
  });
  html += `</div>`;
  pendingTasksContainer.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────
//  RENDERIZADO: CULTIVOS ACTIVOS
// ──────────────────────────────────────────────────────────────
function renderActiveCrops() {
  if (!activeCropsContainer) return;

  const currentCrops = activeCropsList.filter(c => c.status === 'creciendo' || c.status === 'listo_para_cosecha');

  if (currentCrops.length === 0) {
    activeCropsContainer.innerHTML = `
      <div class="glass-card empty-card">
        <p>No hay cultivos activos sembrados en este momento.</p>
        ${(userRole === 'admin' || userRole === 'lider') ? '<p><small>Haz clic en "Nueva Siembra" para comenzar.</small></p>' : ''}
      </div>
    `;
    return;
  }

  let html = `<div class="crops-grid">`;
  currentCrops.forEach(crop => {
    const plantedStr = crop.plantedDate ? new Date(crop.plantedDate.toMillis()).toLocaleDateString() : 'N/A';
    const harvestStr = crop.expectedHarvestDate ? new Date(crop.expectedHarvestDate.toMillis()).toLocaleDateString() : 'N/A';

    const isReady = crop.status === 'listo_para_cosecha';
    const statusLabel = isReady ? ' Ready for Harvest' : ' En Crecimiento';
    const statusBadgeClass = isReady ? 'badge-ready' : 'badge-growing';

    html += `
      <div class="crop-card glass-card">
        <div class="crop-card-header">
          <span class="crop-icon">${crop.cropTypeIcon || '🌱'}</span>
          <div>
            <h3>${crop.cropTypeName}</h3>
            <span class="crop-plot">${crop.plotName || 'Sin Bancal'}</span>
          </div>
          <span class="status-badge ${statusBadgeClass}">${statusLabel}</span>
        </div>
        
        <div class="crop-card-body">
          <div class="crop-meta">
            <span><strong>Siembra:</strong> ${plantedStr}</span>
            <span><strong>Est. Cosecha:</strong> ${harvestStr}</span>
            <span><strong>Cantidad:</strong> ${crop.quantity || 1} unidades/m²</span>
          </div>
        </div>

        <div class="crop-card-actions">
          <button class="btn btn-sm btn-water" title="Registrar Riego" onclick="window.quickAction('riego', '${crop.id}')">
            💧 Regar
          </button>
          <button class="btn btn-sm btn-fert" title="Registrar Abono" onclick="window.quickAction('fertilizacion', '${crop.id}')">
            🍃 Abonar
          </button>
          <button class="btn btn-sm btn-harvest" title="Registrar Cosecha" onclick="window.quickAction('cosecha', '${crop.id}')">
            🧺 Cosechar
          </button>
          <button class="btn btn-sm btn-incident" title="Reportar Incidencia" onclick="window.quickAction('incidencia', '${crop.id}')">
            ⚠️ Alerta
          </button>
          <button class="btn btn-sm btn-details" title="Ver Bitácora" onclick="window.viewCropDetails('${crop.id}')">
            📋 Bitácora
          </button>
        </div>
      </div>
    `;
  });
  html += `</div>`;
  activeCropsContainer.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────
//  RENDERIZADO: CATÁLOGO DE ESPECIES
// ──────────────────────────────────────────────────────────────
function renderCropTypesCatalog() {
  if (!cropTypesContainer) return;

  let html = `<div class="catalog-grid">`;
  cropTypesList.forEach(item => {
    html += `
      <div class="catalog-card glass-card">
        <div class="catalog-header">
          <span class="catalog-icon">${item.icon || '🌱'}</span>
          <div>
            <h4>${item.name}</h4>
            <small><em>${item.scientificName || ''}</em></small>
          </div>
        </div>
        <div class="catalog-body">
          <p><strong>💧 Riego:</strong> Cada ${item.wateringIntervalDays} días</p>
          <p><strong>🍃 Abono:</strong> Cada ${item.fertilizingIntervalDays || 'N/A'} días</p>
          <p><strong>⏱️ Días a cosecha:</strong> ${item.daysToHarvest} días</p>
          <p><strong>☀️ Sol:</strong> ${item.sunlight || 'Pleno sol'}</p>
          ${item.notes ? `<p class="catalog-notes">${item.notes}</p>` : ''}
        </div>
      </div>
    `;
  });
  html += `</div>`;
  cropTypesContainer.innerHTML = html;
}

function populateCropTypeOptions() {
  const select = document.getElementById("cropTypeSelect");
  if (!select) return;
  select.innerHTML = `<option value="">-- Seleccionar Especie --</option>`;
  cropTypesList.forEach(t => {
    select.innerHTML += `<option value="${t.id}">${t.icon || '🌱'} ${t.name} (${t.daysToHarvest} días a cosecha)</option>`;
  });
}

function populatePlotOptions() {
  const select = document.getElementById("plotSelect");
  if (!select) return;
  select.innerHTML = `<option value="">-- Sin Bancal Específico --</option>`;
  plotsList.forEach(p => {
    select.innerHTML += `<option value="${p.id}">${p.name}</option>`;
  });
}

// ──────────────────────────────────────────────────────────────
//  EVENT LISTENERS Y ACCIONES RÁPIDAS
// ──────────────────────────────────────────────────────────────
function setupEventListeners() {
  const btnGame = document.getElementById("viewTabGame");
  const btnClassic = document.getElementById("viewTabClassic");

  if (btnGame) {
    btnGame.addEventListener("click", () => switchViewTab("juego"));
  }
  if (btnClassic) {
    btnClassic.addEventListener("click", () => switchViewTab("clasica"));
  }

  if (newSiembraBtn) {
    newSiembraBtn.addEventListener("click", () => {
      if (siembraModal) siembraModal.classList.add("active");
    });
  }

  if (closeSiembraModalBtn) {
    closeSiembraModalBtn.addEventListener("click", () => {
      if (siembraModal) siembraModal.classList.remove("active");
    });
  }

  if (siembraForm) {
    siembraForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!currentUser) {
        showGameAlert("Debes iniciar sesión para registrar una siembra.", "🔒", "Acceso Requerido");
        return;
      }

      const btnSubmit = siembraForm.querySelector('button[type="submit"]');
      const originalText = btnSubmit ? btnSubmit.innerText : "Confirmar y Registrar Siembra";

      try {
        if (btnSubmit) {
          btnSubmit.disabled = true;
          btnSubmit.innerText = "Procesando siembra...";
        }

        const cropTypeId = document.getElementById("cropTypeSelect").value;
        const plotId = document.getElementById("plotSelect").value;
        const quantity = document.getElementById("quantityInput").value;
        const notes = document.getElementById("notesInput").value;
        const photoInput = document.getElementById("photoInput");

        let photoUrl = null;
        if (photoInput && photoInput.files && photoInput.files[0]) {
          if (btnSubmit) btnSubmit.innerText = "Comprimiendo y procesando foto...";
          photoUrl = await uploadOrCompressPhoto(photoInput.files[0], `huerta/siembras`);
        }

        await createCrop({
          cropTypeId,
          plotId,
          quantity,
          notes,
          photo: photoUrl,
          user: currentUser
        });

        siembraModal.classList.remove("active");
        siembraForm.reset();
        await loadHuertaData();
        showGameAlert("¡Siembra registrada exitosamente!", "🌱", "Siembra Exitosa");
      } catch (err) {
        console.error("Error al registrar siembra:", err);
        showGameAlert("Error al registrar siembra: " + err.message, "⚠️", "Error de Siembra");
      } finally {
        if (btnSubmit) {
          btnSubmit.disabled = false;
          btnSubmit.innerText = originalText;
        }
      }
    });
  }
}

function switchViewTab(view) {
  activeView = view;
  const gameSection = document.getElementById("farmGameSection");
  const classicSection = document.getElementById("classicBitacoraSection");
  const headerSection = document.querySelector(".page-header-section");
  const scopeControl = document.querySelector(".scope-segmented-control");
  const btnGame = document.getElementById("viewTabGame");
  const btnClassic = document.getElementById("viewTabClassic");

  if (view === "juego") {
    if (headerSection) headerSection.style.display = "none";
    if (scopeControl) scopeControl.style.display = "flex";
    if (gameSection) gameSection.style.display = "block";
    if (classicSection) classicSection.style.display = "none";
    if (btnGame) btnGame.classList.add("active");
    if (btnClassic) btnClassic.classList.remove("active");
  } else {
    if (headerSection) headerSection.style.display = "flex";
    if (scopeControl) scopeControl.style.display = "flex";
    if (gameSection) gameSection.style.display = "none";
    if (classicSection) classicSection.style.display = "block";
    if (btnGame) btnGame.classList.remove("active");
    if (btnClassic) btnClassic.classList.add("active");
  }

  applyGameModeLayout(view === "juego");

  if (currentUser) {
    saveUserViewPreference(currentUser.uid, view);
  }
}

// Modo juego a pantalla completa: el mapa ocupa todo el viewport, detrás del header y del menú inferior
function applyGameModeLayout(isGame) {
  document.documentElement.classList.toggle("huerta-game-mode", isGame);
  document.body.classList.toggle("huerta-game-mode", isGame);
  if (isGame) {
    // Si el mapa se renderizó estando oculto (vista clásica), recentrar con el tamaño real
    requestAnimationFrame(() => {
      if (typeof window.resetCameraView === "function") window.resetCameraView({ silent: true });
    });
  }
}

function setupSettingsModal() {
  const btnSettings = document.getElementById("huertaSettingsBtn");
  const modalSettings = document.getElementById("huertaSettingsModal");
  const closeBtn = document.getElementById("closeHuertaSettingsBtn");

  const toggleSound = document.getElementById("toggleSoundMaster");
  const toggleAnim = document.getElementById("toggleAnimMaster");
  const toggleAnimals = document.getElementById("toggleAnimalsMaster");
  const toggleVoice = document.getElementById("toggleVoiceMaster");

  if (toggleSound) {
    toggleSound.checked = localStorage.getItem("hh_sound_enabled") !== "false";
    toggleSound.addEventListener("change", (e) => {
      localStorage.setItem("hh_sound_enabled", e.target.checked ? "true" : "false");
    });
  }
  if (toggleAnim) {
    toggleAnim.checked = localStorage.getItem("hh_anim_enabled") !== "false";
    toggleAnim.addEventListener("change", (e) => {
      localStorage.setItem("hh_anim_enabled", e.target.checked ? "true" : "false");
    });
  }
  if (toggleAnimals) {
    toggleAnimals.checked = localStorage.getItem("hh_ambient_animals_enabled") !== "false";
    toggleAnimals.addEventListener("change", (e) => {
      localStorage.setItem("hh_ambient_animals_enabled", e.target.checked ? "true" : "false");
    });
  }
  if (toggleVoice) {
    toggleVoice.checked = localStorage.getItem("hh_voice_enabled") === "true";
    toggleVoice.addEventListener("change", (e) => {
      localStorage.setItem("hh_voice_enabled", e.target.checked ? "true" : "false");
    });
  }

  if (btnSettings && modalSettings) {
    btnSettings.addEventListener("click", () => modalSettings.classList.add("active"));
  }
  if (closeBtn && modalSettings) {
    closeBtn.addEventListener("click", () => modalSettings.classList.remove("active"));
  }
}

// Global quickAction para uso directo desde botones HTML
window.quickAction = async function(type, cropId) {
  if (!currentUser) {
    showGameAlert("Debes iniciar sesión para registrar acciones.", "🔒", "Acceso Requerido");
    return;
  }

  const crop = activeCropsList.find(c => c.id === cropId);
  if (!crop) return;

  if (type === 'riego') {
    const isRain = confirm(`¿Fue un riego por lluvia natural para ${crop.cropTypeName}? (Aceptar para Lluvia, Cancelar para Riego Manual)`);
    const notes = prompt("Notas adicionales (opcional):", "");
    try {
      await logRiego(cropId, { notes, isRain, user: currentUser });
      window.dispatchEvent(new CustomEvent('huerta:celebrate', {
        detail: { kind: 'riego', title: `¡Riego Registrado!`, subtitle: '+10 XP' }
      }));
      await awardUserGamification(currentUser.uid, 10, 5);
      await loadHuertaData();
    } catch (err) {
      showGameAlert("Error al registrar riego: " + err.message, "⚠️", "Error");
    }
  } else if (type === 'fertilizacion') {
    const product = prompt("Producto o tipo de abono utilizado:", "Compost orgánico escolar");
    if (!product) return;
    const notes = prompt("Notas del abonado (opcional):", "");
    try {
      await logFertilizacion(cropId, { product, notes, user: currentUser });
      window.dispatchEvent(new CustomEvent('huerta:celebrate', {
        detail: { kind: 'abono', title: `¡Abonado Registrado!`, subtitle: '+15 XP' }
      }));
      await awardUserGamification(currentUser.uid, 15, 10);
      await loadHuertaData();
    } catch (err) {
      showGameAlert("Error al registrar abono: " + err.message, "⚠️", "Error");
    }
  } else if (type === 'cosecha') {
    const qtyStr = prompt(`Cantidad cosechada de ${crop.cropTypeName}:`, "1");
    if (!qtyStr) return;
    const isFinal = confirm("¿Es esta la cosecha final del cultivo? (Aceptar = marca cultivo como cosechado)");
    const notes = prompt("Notas de la cosecha (opcional):", "");
    try {
      const res = await logCosecha(cropId, { quantity: Number(qtyStr), isFinalHarvest: isFinal, notes, user: currentUser });
      if (res && res.plotUnlocked) {
        window.dispatchEvent(new CustomEvent('huerta:celebrate', {
          detail: { kind: 'desbloqueo', title: `¡Bancal Desbloqueado!`, subtitle: '+50 XP' }
        }));
        await awardUserGamification(currentUser.uid, 50, 25);
      } else {
        window.dispatchEvent(new CustomEvent('huerta:celebrate', {
          detail: { kind: 'cosecha', title: `¡Cosecha Registrada!`, subtitle: '+30 XP' }
        }));
        await awardUserGamification(currentUser.uid, 30, 15);
      }
      await loadHuertaData();
    } catch (err) {
      showGameAlert("Error al registrar cosecha: " + err.message, "⚠️", "Error");
    }
  } else if (type === 'incidencia') {
    const description = prompt("Describe la plaga, enfermedad o alteración climatológica observada:", "");
    if (!description) return;
    try {
      await logIncidencia(cropId, { type: "incidencia", description, user: currentUser });
      showGameAlert("Alerta / Incidencia registrada", "⚠️", "Incidencia");
      await loadHuertaData();
    } catch (err) {
      showGameAlert("Error al registrar incidencia: " + err.message, "⚠️", "Error");
    }
  }
};

window.openLightbox = function(photoUrl) {
  if (!photoUrl) return;
  const modalHtml = `
    <div class="modal active" id="lightboxModal" style="z-index: 30000;" onclick="document.getElementById('lightboxModal').remove()">
      <div style="position: relative; max-width: 90vw; max-height: 90vh;">
        <img src="${photoUrl}" style="max-width: 100%; max-height: 85vh; border-radius: 12px; box-shadow: 0 10px 40px rgba(0,0,0,0.8);" />
        <p style="text-align: center; color: #fff; margin-top: 10px;">Clic en cualquier lugar para cerrar</p>
      </div>
    </div>
  `;
  const existing = document.getElementById("lightboxModal");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend", modalHtml);
};

window.viewCropDetails = async function(cropId) {
  const crop = await getCropById(cropId);
  if (!crop) return;

  const events = await getCropEvents(cropId);
  let modalHtml = `
    <div class="modal active" id="detailsModal">
      <div class="modal-content glass-card">
        <div class="modal-header">
          <h3>${crop.cropTypeIcon || '🌱'} ${crop.cropTypeName} — Historial y Bitácora</h3>
          <button class="close-btn" onclick="document.getElementById('detailsModal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <p><strong>Bancal:</strong> ${crop.plotName || 'Sin asignación'}</p>
          <p><strong>Sembrado por:</strong> ${crop.plantedByName} (${new Date(crop.plantedDate.toMillis()).toLocaleDateString()})</p>
          <p><strong>Estado:</strong> ${crop.status}</p>
          ${crop.photo ? `<div style="margin: 10px 0;"><img src="${crop.photo}" onclick="window.openLightbox('${crop.photo}')" style="width:100%; max-height:200px; object-fit:cover; border-radius:10px; cursor:pointer;" title="Clic para ampliar foto de siembra" /></div>` : ''}
          <hr/>
          <h4>Línea de Tiempo de Eventos</h4>
          ${events.length === 0 ? '<p>No se han registrado eventos para este cultivo aún.</p>' : ''}
          <ul class="events-list">
  `;

  events.forEach(ev => {
    const evDate = ev.date ? new Date(ev.date.toMillis()).toLocaleString() : '';
    let icon = "📝";
    if (ev.eventType === 'riego') icon = ev.isRain ? "🌧️" : "💧";
    if (ev.eventType === 'fertilizacion') icon = "🍃";
    if (ev.eventType === 'cosecha') icon = "🧺";
    if (ev.eventType === 'incidencia') icon = "⚠️";

    modalHtml += `
      <li class="event-item">
        <span class="event-icon">${icon}</span>
        <div>
          <strong>${ev.eventType.toUpperCase()}</strong> — <small>${evDate}</small><br/>
          <span>Por: ${ev.doneByName}</span>
          ${ev.notes ? `<p class="event-notes">${ev.notes}</p>` : ''}
          ${ev.description ? `<p class="event-notes">${ev.description}</p>` : ''}
          ${ev.photo ? `<div style="margin-top:6px;"><img src="${ev.photo}" onclick="window.openLightbox('${ev.photo}')" style="width:60px; height:60px; object-fit:cover; border-radius:6px; cursor:pointer;" title="Clic para ampliar" /></div>` : ''}
        </div>
      </li>
    `;
  });

  modalHtml += `
          </ul>
        </div>
      </div>
    </div>
  `;

  const existingModal = document.getElementById("detailsModal");
  if (existingModal) existingModal.remove();

  document.body.insertAdjacentHTML("beforeend", modalHtml);
};
