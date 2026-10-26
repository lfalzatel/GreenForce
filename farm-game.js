// ══════════════════════════════════════════════════════════════════════════
//  Green Force — Módulo Huerta Escolar
//  farm-game.js — Vista de Granja 2.5D e Interacción Gamificada
// ══════════════════════════════════════════════════════════════════════════

import {
  logRiego,
  logFertilizacion,
  logCosecha,
  awardUserGamification
} from "./huerta-service.js";
import {
  playActionBlocked,
  playAmbientChirp,
  playWatering,
  playFertilizing,
  playHarvest,
  playUnlockPlot,
  playClickSound
} from "./farm-sounds.js";
import { spawnFloatingText } from "./farm-overworld.js?v=64";

let currentCrops = [];
let currentPlots = [];
let currentUser = null;
let currentRole = "integrante";
let currentScope = "colegio";
let onRefreshDataCallback = null;
let onBackToMapCallback = null;
let animalTimer = null;

export function renderFarmGame(container, { crops, plots, user, role, scope = "colegio", onRefreshData, onBackToMap }) {
  currentCrops = crops || [];
  currentPlots = plots || [];
  currentUser = user;
  currentRole = role;
  currentScope = scope;
  onRefreshDataCallback = onRefreshData;
  onBackToMapCallback = onBackToMap;

  if (!container) return;

  const scopeTitle = scope === 'colegio' 
    ? '🏫 Huerta Escolar — IE Barro Blanco' 
    : '🏡 Mi Granja / Huerta Individual';

  container.innerHTML = `
    <div class="farm-scene-wrapper wooden-board-theme">
      <div class="farm-board-top-nav">
        <button class="back-to-map-btn" onclick="window.backToOverworldMap()">
          <i class="fas fa-map-marked-alt"></i> ⬅️ Volver al Mapa
        </button>
        <h3 class="board-title-header">${scopeTitle}</h3>
      </div>

      <div class="farm-header-bar">
        <div class="farm-stats">
          <span class="stat-badge xp-badge"><i class="fas fa-star"></i> <strong id="farmXpDisplay">0</strong> XP</span>
          <span class="stat-badge coins-badge"><i class="fas fa-coins"></i> <strong id="farmCoinsDisplay">0</strong> Monedas</span>
        </div>
        <div class="farm-status-legend">
          <span>💧 Riego listo</span>
          <span>🍃 Abono listo</span>
          <span>✨ Cosecha madura</span>
        </div>
      </div>

      <!-- Tablero 2.5D con Bancales de Madera Reales -->
      <div class="farm-grid-25d wooden-grid-25d" id="farmGrid25D">
        <!-- Renderizado dinámico de cajas de madera -->
      </div>
    </div>
  `;

  renderPlotsGrid();
  startAmbientAnimals(container);
  loadUserGamificationStats();
}

window.backToOverworldMap = function() {
  if (onBackToMapCallback) {
    onBackToMapCallback();
  }
};

function renderPlotsGrid() {
  const gridEl = document.getElementById("farmGrid25D");
  if (!gridEl) return;

  if (currentPlots.length === 0) {
    if (currentScope === 'individual') {
      gridEl.innerHTML = `
        <div class="glass-card empty-plots-card" style="text-align: center; padding: 28px 20px; max-width: 480px; margin: 30px auto; background: rgba(15, 26, 10, 0.85); border: 2px dashed #d9a94e; border-radius: 20px; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="font-size: 3.2rem; margin-bottom: 10px;">🪴</div>
          <h3 style="color: #ffd464; font-size: 1.25rem; margin-bottom: 8px;">¡Bienvenido a Tu Huerta Individual!</h3>
          <p style="color: #cbd5e0; font-size: 0.88rem; line-height: 1.5; margin-bottom: 20px;">
            Aún no tienes camas de siembra activas. Puedes crear una <strong>Cama de Práctica Virtual</strong> para entrenar y sembrar tus propios cultivos experimentales.
          </p>
          <button class="game-btn" onclick="document.getElementById('practicePlotModal').classList.add('active')" style="padding: 12px 22px; font-size: 0.92rem; background: linear-gradient(180deg, #7fc25c, #2e5b22); color: white; border-radius: 14px; border: none; cursor: pointer; font-weight: bold; box-shadow: 0 4px 12px rgba(0,0,0,0.4);">
            <i class="fas fa-plus-circle"></i> + Crear Cama de Práctica Virtual 🪴
          </button>
        </div>
      `;
    } else {
      gridEl.innerHTML = `
        <div class="glass-card empty-plots-card" style="text-align: center; padding: 28px 20px; max-width: 480px; margin: 30px auto; background: rgba(15, 26, 10, 0.85); border: 2px dashed #81c784; border-radius: 20px; color: #fff; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <div style="font-size: 3.2rem; margin-bottom: 10px;">🏫</div>
          <h3 style="color: #a5d6a7; font-size: 1.25rem; margin-bottom: 8px;">Huerta Escolar Colectiva</h3>
          <p style="color: #cbd5e0; font-size: 0.88rem; line-height: 1.5; margin-bottom: 20px;">
            No hay bancales activos registrados en la IE Barro Blanco en este momento.
          </p>
          <button class="game-btn" onclick="window.backToOverworldMap()" style="padding: 10px 20px; font-size: 0.88rem; background: linear-gradient(180deg, #4c8a3a, #1f4a24); color: white; border-radius: 12px; border: none; cursor: pointer;">
            ⬅️ Volver al Mapa General
          </button>
        </div>
      `;
    }
    return;
  }

  let html = '';
  const nowMs = Date.now();

  currentPlots.forEach(plot => {
    const isLocked = plot.gameStatus === 'bloqueada';
    const isUnlocked = plot.gameStatus === 'desbloqueada';
    const isUsed = plot.gameStatus === 'en_uso';

    // Buscar cultivo asociado a este bancal
    const crop = currentCrops.find(c => c.plotId === plot.id && c.status !== 'cosechado' && c.status !== 'perdido');

    const isPractice = plot.isReal === false;
    const practiceBadgeHtml = isPractice ? `<span class="practice-badge">PRÁCTICA</span>` : '';
    const practiceClass = isPractice ? 'plot-practice' : '';

    if (isLocked) {
      html += `
        <div class="plot-card-25d plot-locked ${practiceClass}" onclick="window.handlePlotClick('${plot.id}', 'locked')">
          <div class="plot-soil soil-locked">
            <div class="lock-overlay">
              <i class="fas fa-lock lock-icon"></i>
              <span class="plot-number">Bancal #${(plot.order ?? 0) + 1}</span>
              <small class="lock-tooltip">Cosecha el bancal anterior para desbloquear</small>
            </div>
          </div>
        </div>
      `;
    } else if (isUnlocked && !crop) {
      const isAdminOrLider = currentRole === 'admin' || currentRole === 'lider' || isPractice;
      html += `
        <div class="plot-card-25d plot-empty ${practiceClass}" onclick="window.handlePlotClick('${plot.id}', 'empty')">
          <div class="plot-soil soil-tilled">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span class="plot-name-tag">${plot.name}</span>
              ${practiceBadgeHtml}
            </div>
            <div class="empty-action-indicator">
              <i class="fas fa-seedling"></i>
              <span>${isAdminOrLider ? '+ Sembrar Aquí' : 'Bancal Disponible'}</span>
            </div>
          </div>
        </div>
      `;
    } else if (crop) {
      // Calcular % de crecimiento
      const plantedMs = crop.plantedDate ? crop.plantedDate.toMillis() : nowMs;
      const harvestMs = crop.expectedHarvestDate ? crop.expectedHarvestDate.toMillis() : (plantedMs + 30 * 86400000);
      const totalCycle = Math.max(harvestMs - plantedMs, 1);
      const elapsed = Math.max(nowMs - plantedMs, 0);
      const growthRatio = Math.min(elapsed / totalCycle, 1.0);

      const isReady = crop.status === 'listo_para_cosecha' || growthRatio >= 1.0;

      // Determinación de etapa de sprite
      let stageClass = 'stage-seed';
      let stageIcon = '🌱';
      if (isReady) {
        stageClass = 'stage-ready';
        stageIcon = crop.cropTypeIcon || '🥬';
      } else if (growthRatio >= 0.6) {
        stageClass = 'stage-grown';
        stageIcon = crop.cropTypeIcon || '🪴';
      } else if (growthRatio >= 0.2) {
        stageClass = 'stage-sprout';
        stageIcon = '🌿';
      }

      // Overlays de alerta por riego y abono
      const isWaterDue = crop.nextWateringDue && crop.nextWateringDue.toMillis() <= nowMs + (12 * 3600 * 1000);
      const isFertDue = crop.nextFertilizingDue && crop.nextFertilizingDue.toMillis() <= nowMs + (12 * 3600 * 1000);

      html += `
        <div class="plot-card-25d plot-active ${practiceClass} ${isReady ? 'plot-ready-glow' : ''}" onclick="window.handleCropPlantClick('${crop.id}')">
          <div class="plot-soil soil-active">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
              <span class="plot-name-tag">${crop.cropTypeName}</span>
              ${practiceBadgeHtml}
            </div>
            
            <!-- Planta en crecimiento -->
            <div class="plant-sprite-container ${stageClass}">
              <span class="plant-emoji">${stageIcon}</span>
            </div>

            <!-- Overlays de alerta -->
            <div class="alerts-overlay">
              ${isWaterDue ? '<span class="badge-alert alert-water pulse" title="¡Riego vencido!">💧</span>' : ''}
              ${isFertDue ? '<span class="badge-alert alert-fert pulse" title="¡Abono vencido!">🍃</span>' : ''}
              ${isReady ? '<span class="badge-alert alert-harvest ready-glow" title="¡Listo para cosechar!">🧺</span>' : ''}
            </div>

            <!-- Barra de progreso de crecimiento -->
            <div class="growth-progress-bar" title="Progreso de crecimiento: ${Math.round(growthRatio * 100)}%">
              <div class="growth-fill" style="width: ${Math.round(growthRatio * 100)}%;"></div>
            </div>
          </div>
        </div>
      `;
    }
  });

  gridEl.innerHTML = html;
}

// ──────────────────────────────────────────────────────────────
//  MANEJO DE CLICS E INTERACCIONES EN LA GRANJA
// ──────────────────────────────────────────────────────────────

window.handlePlotClick = function(plotId, state) {
  if (state === 'locked') {
    playActionBlocked();
    alert("🔒 Este bancal está bloqueado. Cosecha la cama de cultivo previa para desbloquear esta parcela.");
  } else if (state === 'empty') {
    const plot = currentPlots.find(p => p.id === plotId);
    const isOwnPractice = plot && plot.isReal === false && currentUser && plot.ownerUid === currentUser.uid;
    if (currentRole === 'admin' || currentRole === 'lider' || isOwnPractice) {
      const selectPlot = document.getElementById("plotSelect");
      if (selectPlot) selectPlot.value = plotId;
      const modal = document.getElementById("siembraModal");
      if (modal) modal.classList.add("active");
    } else {
      alert("🌱 Este bancal está listo para sembrar. Pide a tu docente o líder ambiental que registre una nueva siembra.");
    }
  }
};

window.handleCropPlantClick = function(cropId) {
  const crop = currentCrops.find(c => c.id === cropId);
  if (!crop) return;

  const nowMs = Date.now();
  const isWaterDue = crop.nextWateringDue && crop.nextWateringDue.toMillis() <= nowMs + (12 * 3600 * 1000);
  const isFertDue = crop.nextFertilizingDue && crop.nextFertilizingDue.toMillis() <= nowMs + (12 * 3600 * 1000);
  const isReady = crop.status === 'listo_para_cosecha';

  const nextWaterStr = crop.nextWateringDue ? new Date(crop.nextWateringDue.toMillis()).toLocaleDateString() : 'N/A';
  const nextFertStr = crop.nextFertilizingDue ? new Date(crop.nextFertilizingDue.toMillis()).toLocaleDateString() : 'N/A';

  const modalHtml = `
    <div class="modal active" id="farmActionSheet" style="z-index: 28000;">
      <div class="modal-content glass-card farm-action-card">
        <div class="modal-header">
          <h3>${crop.cropTypeIcon || '🌱'} ${crop.cropTypeName}</h3>
          <button class="close-btn" onclick="document.getElementById('farmActionSheet').remove()">&times;</button>
        </div>
        <div class="farm-action-body">
          <p class="crop-location">📍 <strong>Ubicación:</strong> ${crop.plotName || 'Sin bancal'}</p>
          <p class="crop-dates">📅 <strong>Sembrado:</strong> ${new Date(crop.plantedDate.toMillis()).toLocaleDateString()}</p>
          
          <div class="action-buttons-stack">
            <button class="farm-btn btn-water ${!isWaterDue ? 'disabled-btn' : ''}" 
                    onclick="window.executeFarmAction('riego', '${crop.id}', ${isWaterDue}, '${nextWaterStr}')">
              💧 Regar ${isWaterDue ? '(¡Listo hoy!)' : `(Próx: ${nextWaterStr})`}
            </button>

            <button class="farm-btn btn-fert ${!isFertDue ? 'disabled-btn' : ''}" 
                    onclick="window.executeFarmAction('fertilizacion', '${crop.id}', ${isFertDue}, '${nextFertStr}')">
              🍃 Abonar ${isFertDue ? '(¡Listo hoy!)' : `(Próx: ${nextFertStr})`}
            </button>

            <button class="farm-btn btn-harvest ${!isReady ? 'disabled-btn' : ''}" 
                    onclick="window.executeFarmAction('cosecha', '${crop.id}', ${isReady}, '')">
              🧺 Cosechar ${isReady ? ' (¡Cosecha Madura!)' : ' (En crecimiento)'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const existing = document.getElementById("farmActionSheet");
  if (existing) existing.remove();
  document.body.insertAdjacentHTML("beforeend", modalHtml);
};

window.executeFarmAction = async function(action, cropId, isAllowed, nextDateStr) {
  const sheet = document.getElementById("farmActionSheet");
  if (sheet) sheet.remove();

  if (!isAllowed) {
    playActionBlocked();
    if (typeof window.showGameToast === 'function') {
      window.showGameToast(`La planta no requiere ${action} en este momento. Próxima: ${nextDateStr}`, "⏳", "Labor no requerida");
    } else {
      alert(`⏳ ¡Tranquilo! La planta no requiere ${action} en este momento. Próxima fecha estipulada: ${nextDateStr}`);
    }
    return;
  }

  if (!currentUser) {
    if (typeof window.showGameToast === 'function') {
      window.showGameToast("Debes iniciar sesión para registrar labores.", "🔒", "Acceso Requerido");
    } else {
      alert("Debes iniciar sesión para registrar labores.");
    }
    return;
  }

  const crop = currentCrops.find(c => c.id === cropId);
  if (!crop) return;

  try {
    if (action === 'riego') {
      const isRain = confirm(`¿Fue riego por lluvia natural para ${crop.cropTypeName}?`);
      await logRiego(cropId, { isRain, user: currentUser });
      playWatering();
      spawnFloatingText("💧 +10 XP • +5 Monedas", window.innerWidth / 2, window.innerHeight / 2 - 50, "#4fc3f7");

      // Disparar evento de celebración
      window.dispatchEvent(new CustomEvent('huerta:celebrate', {
        detail: {
          kind: 'riego',
          title: `¡${crop.cropTypeName} regada!`,
          subtitle: '+10 XP • +5 Monedas'
        }
      }));

      await awardUserGamification(currentUser.uid, 10, 5);
    } else if (action === 'fertilizacion') {
      const product = prompt("Tipo de abono utilizado:", "Compost orgánico escolar");
      if (!product) return;
      await logFertilizacion(cropId, { product, user: currentUser });
      playFertilizing();
      spawnFloatingText("🍃 +15 XP • +10 Monedas", window.innerWidth / 2, window.innerHeight / 2 - 50, "#81c784");

      window.dispatchEvent(new CustomEvent('huerta:celebrate', {
        detail: {
          kind: 'abono',
          title: `¡${crop.cropTypeName} abonada!`,
          subtitle: '+15 XP • +10 Monedas'
        }
      }));

      await awardUserGamification(currentUser.uid, 15, 10);
    } else if (action === 'cosecha') {
      const qtyStr = prompt(`Cantidad cosechada de ${crop.cropTypeName}:`, "1");
      if (!qtyStr) return;

      const result = await logCosecha(cropId, { quantity: Number(qtyStr), isFinalHarvest: true, user: currentUser });

      if (result.plotUnlocked) {
        playUnlockPlot();
        spawnFloatingText("🔓 ¡NUEVO BANCAL DESBLOQUEADO! +50 XP", window.innerWidth / 2, window.innerHeight / 2 - 50, "#ffd54f");
        window.dispatchEvent(new CustomEvent('huerta:celebrate', {
          detail: {
            kind: 'desbloqueo',
            title: `¡LOGRO! ${result.unlockedPlotName || 'Nuevo Bancal'} Desbloqueado`,
            subtitle: '+50 XP • +25 Monedas'
          }
        }));
        await awardUserGamification(currentUser.uid, 50, 25);
      } else {
        playHarvest();
        spawnFloatingText("🧺 +30 XP • +15 Monedas", window.innerWidth / 2, window.innerHeight / 2 - 50, "#ffd54f");
        window.dispatchEvent(new CustomEvent('huerta:celebrate', {
          detail: {
            kind: 'cosecha',
            title: `¡Cosecha de ${crop.cropTypeName} completada!`,
            subtitle: '+30 XP • +15 Monedas'
          }
        }));
        await awardUserGamification(currentUser.uid, 30, 15);
      }
    }

    if (onRefreshDataCallback) await onRefreshDataCallback();
    loadUserGamificationStats();
  } catch (err) {
    console.error("Error ejecutando acción de granja:", err);
    if (typeof window.showGameToast === 'function') {
      window.showGameToast("Error: " + err.message, "⚠️", "Error");
    } else {
      alert("Error: " + err.message);
    }
  }
};

// ──────────────────────────────────────────────────────────────
//  ESTADÍSTICAS Y ANIMALES AMBIENTALES
// ──────────────────────────────────────────────────────────────

async function loadUserGamificationStats() {
  if (!currentUser) return;
  try {
    const xpEl = document.getElementById("farmXpDisplay");
    const coinsEl = document.getElementById("farmCoinsDisplay");
    if (xpEl) xpEl.innerText = currentUser.farmXp || 0;
    if (coinsEl) coinsEl.innerText = currentUser.farmCoins || 0;
  } catch (e) {
    console.warn("No se pudieron renderizar los puntos de granja:", e);
  }
}

function startAmbientAnimals(container) {
  if (animalTimer) clearInterval(animalTimer);

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isReducedMotion) return;

  animalTimer = setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    if (localStorage.getItem('hh_ambient_animals_enabled') === 'false') return;

    spawnAmbientAnimal(container);
  }, 35000); // Aparece cada 35s
}

function spawnAmbientAnimal(container) {
  const animal = document.createElement('div');
  animal.className = 'ambient-animal-svg';
  const isButterfly = Math.random() > 0.5;
  animal.innerText = isButterfly ? '🦋' : '🐦';

  const startY = 20 + Math.random() * 50; // vh
  animal.style.cssText = `
    position: absolute;
    left: -50px;
    top: ${startY}vh;
    font-size: 1.8rem;
    pointer-events: none;
    z-index: 100;
    transition: transform 12s linear;
  `;

  const scene = container.querySelector('.farm-scene-wrapper');
  if (!scene) return;
  scene.appendChild(animal);

  playAmbientChirp();

  requestAnimationFrame(() => {
    animal.style.transform = `translate(${window.innerWidth + 100}px, ${(Math.random() - 0.5) * 80}px)`;
  });

  setTimeout(() => {
    animal.remove();
  }, 12500);
}
