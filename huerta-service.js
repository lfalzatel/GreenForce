// ══════════════════════════════════════════════════════════════════════════
//  Green Force — Módulo Bitácora de Cultivos (Huerta Escolar)
//  huerta-service.js — Servicio de datos Firestore
// ══════════════════════════════════════════════════════════════════════════

import { db, auth } from "./firebase-config.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

// Catálogo por defecto de 8 especies típicas de huerta escolar
export const DEFAULT_CROP_TYPES = [
  {
    id: "zanahoria",
    name: "Zanahoria",
    scientificName: "Daucus carota",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 21,
    daysToHarvest: 75,
    sunlight: "pleno sol",
    notes: "Requiere suelo suelto y profundo. Riego constante sin encharcar.",
    icon: "🥕"
  },
  {
    id: "lechuga",
    name: "Lechuga",
    scientificName: "Lactuca sativa",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 15,
    daysToHarvest: 45,
    sunlight: "sombra parcial",
    notes: "Cosechar preferiblemente en la mañana para conservar frescura.",
    icon: "🥬"
  },
  {
    id: "cilantro",
    name: "Cilantro",
    scientificName: "Coriandrum sativum",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 20,
    daysToHarvest: 40,
    sunlight: "pleno sol",
    notes: "Crecimiento rápido. Evitar sol abrasador constante.",
    icon: "🌿"
  },
  {
    id: "rabano",
    name: "Rábano",
    scientificName: "Raphanus sativus",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 15,
    daysToHarvest: 30,
    sunlight: "pleno sol",
    notes: "Uno de los cultivos más rápidos. Ideal para primeros proyectos.",
    icon: "🪴"
  },
  {
    id: "tomate",
    name: "Tomate",
    scientificName: "Solanum lycopersicum",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 14,
    daysToHarvest: 90,
    sunlight: "pleno sol",
    notes: "Requiere tutorado (guías) y deshijado regular.",
    icon: "🍅"
  },
  {
    id: "frijol",
    name: "Fríjol",
    scientificName: "Phaseolus vulgaris",
    wateringIntervalDays: 3,
    fertilizingIntervalDays: 25,
    daysToHarvest: 60,
    sunlight: "pleno sol",
    notes: "Fija nitrógeno en el suelo. Excelente para rotación de cultivo.",
    icon: "🫘"
  },
  {
    id: "cebolla",
    name: "Cebolla de Rama",
    scientificName: "Allium fistulosum",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 20,
    daysToHarvest: 70,
    sunlight: "pleno sol",
    notes: "Resistente. Se puede cosechar por tallos dejando la raíz viva.",
    icon: "🧅"
  },
  {
    id: "acelga",
    name: "Acelga",
    scientificName: "Beta vulgaris var. cicla",
    wateringIntervalDays: 2,
    fertilizingIntervalDays: 20,
    daysToHarvest: 50,
    sunlight: "sombra parcial",
    notes: "Permite cosechas continuas de hojas exteriores.",
    icon: "🥬"
  }
];

// Bancales por defecto con progresión de juego y ámbito institucional
export const DEFAULT_PLOTS = [
  { id: "bancal-1", name: "Bancal 1 - Hortalizas de Hoja", description: "Zona con sombra parcial", isActive: true, order: 0, gameStatus: "desbloqueada", unlockedAt: null, unlockedByHarvestOf: null, ownerScope: "colegio", ownerUid: null, ownerName: null, isReal: true },
  { id: "bancal-2", name: "Bancal 2 - Raíces y Tubérculos", description: "Suelo profundo y suelto", isActive: true, order: 1, gameStatus: "bloqueada", unlockedAt: null, unlockedByHarvestOf: null, ownerScope: "colegio", ownerUid: null, ownerName: null, isReal: true },
  { id: "bancal-3", name: "Bancal 3 - Frutos y Leguminosas", description: "Zona de pleno sol", isActive: true, order: 2, gameStatus: "bloqueada", unlockedAt: null, unlockedByHarvestOf: null, ownerScope: "colegio", ownerUid: null, ownerName: null, isReal: true }
];

// ──────────────────────────────────────────────────────────────
//  1. SEMBRAR CATÁLOGO INICIAL (SI ESTÁ VACÍO)
// ──────────────────────────────────────────────────────────────
export async function seedHuertaIfNeeded() {
  try {
    const cropTypesRef = collection(db, "cropTypes");
    const snapshot = await getDocs(cropTypesRef);
    
    if (snapshot.empty) {
      console.log("Precargando catálogo de especies iniciales para la huerta...");
      for (const item of DEFAULT_CROP_TYPES) {
        const docRef = doc(db, "cropTypes", item.id);
        await setDoc(docRef, {
          ...item,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }

    const plotsRef = collection(db, "plots");
    const plotsSnapshot = await getDocs(plotsRef);
    if (plotsSnapshot.empty) {
      console.log("Precargando bancales iniciales...");
      for (const plot of DEFAULT_PLOTS) {
        const plotRef = doc(db, "plots", plot.id);
        await setDoc(plotRef, {
          ...plot,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
    }
  } catch (err) {
    console.error("Error al verificar/precargar datos de huerta:", err);
  }
}

// ──────────────────────────────────────────────────────────────
//  2. OBTENER DATOS (CATÁLOGO, BANCALES, CULTIVOS)
// ──────────────────────────────────────────────────────────────
export async function getCropTypes() {
  const querySnapshot = await getDocs(collection(db, "cropTypes"));
  const types = [];
  querySnapshot.forEach(doc => {
    types.push({ id: doc.id, ...doc.data() });
  });
  return types;
}

export async function getPlots(scope = null, uid = null) {
  const querySnapshot = await getDocs(collection(db, "plots"));
  const plots = [];
  querySnapshot.forEach(doc => {
    const data = doc.data();
    // Default fallback para documentos antiguos
    const plotScope = data.ownerScope || 'colegio';
    const plotUid = data.ownerUid || null;
    const isReal = data.isReal !== undefined ? data.isReal : true;

    const item = { id: doc.id, ownerScope: plotScope, ownerUid: plotUid, isReal, ...data };

    if (!scope || scope === 'todos') {
      plots.push(item);
    } else if (scope === 'colegio') {
      if (plotScope === 'colegio') plots.push(item);
    } else if (scope === 'individual') {
      if (plotScope === 'individual') {
        if (!uid || plotUid === uid) plots.push(item);
      }
    }
  });
  plots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return plots;
}

export async function createPracticePlot({ name, description, user }) {
  if (!user) throw new Error("Debes iniciar sesión para crear una cama de práctica");
  if (!name) throw new Error("El nombre de la cama de práctica es obligatorio");

  // Validar límite duro de máximo 3 camas de práctica activas por estudiante
  const allPlots = await getPlots('individual', user.uid);
  const practicePlots = allPlots.filter(p => p.isReal === false);

  if (practicePlots.length >= 3) {
    throw new Error("⚠️ Has alcanzado el límite máximo de 3 bancales de práctica activos.");
  }

  const newPlot = {
    name,
    description: description || "Cama virtual de entrenamiento",
    ownerScope: "individual",
    ownerUid: user.uid,
    ownerName: user.displayName || user.email || "Estudiante",
    isReal: false,
    order: practicePlots.length,
    gameStatus: "desbloqueada",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, "plots"), newPlot);
  return docRef.id;
}

export async function assignIndividualRealPlot({ studentUid, studentName, name, description }) {
  if (!studentUid || !studentName) throw new Error("Debe seleccionar a un estudiante de Green Force");
  if (!name) throw new Error("El nombre de la parcela es obligatorio");

  const newPlot = {
    name,
    description: description || `Bancal físico asignado a ${studentName}`,
    ownerScope: "individual",
    ownerUid: studentUid,
    ownerName: studentName,
    isReal: true,
    order: 0,
    gameStatus: "desbloqueada",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, "plots"), newPlot);
  return docRef.id;
}

export async function awardUserGamification(uid, xp = 0, coins = 0) {
  if (!uid) return;
  try {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data();
      const currentXp = data.farmXp || 0;
      const currentCoins = data.farmCoins || 0;
      await updateDoc(userRef, {
        farmXp: currentXp + xp,
        farmCoins: currentCoins + coins,
        updatedAt: serverTimestamp()
      });
    }
  } catch (err) {
    console.warn("No se pudieron actualizar estadísticas de gamificación:", err);
  }
}

export async function saveUserViewPreference(uid, preferredView) {
  if (!uid) return;
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, { preferredView, updatedAt: serverTimestamp() });
  } catch (err) {
    console.warn("No se pudo guardar la preferencia de vista:", err);
  }
}

export async function addCropType({ name, scientificName, wateringIntervalDays, fertilizingIntervalDays, daysToHarvest, sunlight, notes, icon }) {
  if (!name) throw new Error("El nombre de la especie es obligatorio");
  const newType = {
    name,
    scientificName: scientificName || null,
    wateringIntervalDays: Number(wateringIntervalDays) || 2,
    fertilizingIntervalDays: fertilizingIntervalDays ? Number(fertilizingIntervalDays) : null,
    daysToHarvest: Number(daysToHarvest) || 60,
    sunlight: sunlight || "pleno sol",
    notes: notes || null,
    icon: icon || "🌱",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, "cropTypes"), newType);
  return docRef.id;
}

export async function addPlot({ name, description }) {
  if (!name) throw new Error("El nombre del bancal es obligatorio");
  const newPlot = {
    name,
    description: description || null,
    ownerScope: "colegio",
    ownerUid: null,
    ownerName: null,
    isReal: true,
    order: 0,
    gameStatus: "desbloqueada",
    isActive: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const docRef = await addDoc(collection(db, "plots"), newPlot);
  return docRef.id;
}

export async function getActiveCrops(scope = null, uid = null) {
  const q = query(
    collection(db, "crops"),
    orderBy("plantedDate", "desc")
  );
  const querySnapshot = await getDocs(q);
  const crops = [];
  querySnapshot.forEach(doc => {
    const data = doc.data();
    const cropScope = data.ownerScope || 'colegio';
    const cropUid = data.ownerUid || null;
    const isReal = data.isReal !== undefined ? data.isReal : true;

    const item = { id: doc.id, ownerScope: cropScope, ownerUid: cropUid, isReal, ...data };

    if (!scope || scope === 'todos') {
      crops.push(item);
    } else if (scope === 'colegio') {
      if (cropScope === 'colegio') crops.push(item);
    } else if (scope === 'individual') {
      if (cropScope === 'individual') {
        if (!uid || cropUid === uid) crops.push(item);
      }
    }
  });

  // Verificar automáticamente cultivos que alcanzaron su fecha estimada de cosecha
  const now = Timestamp.now();
  for (const crop of crops) {
    if (crop.status === 'creciendo' && crop.expectedHarvestDate && crop.expectedHarvestDate <= now) {
      crop.status = 'listo_para_cosecha';
      try {
        await updateDoc(doc(db, "crops", crop.id), {
          status: 'listo_para_cosecha',
          updatedAt: serverTimestamp()
        });
      } catch (e) {
        console.warn("No se pudo actualizar estado automático de cosecha:", e);
      }
    }
  }

  return crops;
}

export async function getCropById(cropId) {
  const cropRef = doc(db, "crops", cropId);
  const snap = await getDoc(cropRef);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

// ──────────────────────────────────────────────────────────────
//  3. REGISTRAR NUEVO CULTIVO (SIEMBRA)
// ──────────────────────────────────────────────────────────────
export async function createCrop({ cropTypeId, plotId, quantity, notes, photo = null, user }) {
  if (!cropTypeId) throw new Error("Debe seleccionar una especie de cultivo");

  // Obtener especie para los intervalos
  const cropTypeDoc = await getDoc(doc(db, "cropTypes", cropTypeId));
  if (!cropTypeDoc.exists()) throw new Error("El tipo de cultivo no existe");
  const cropType = cropTypeDoc.data();

  let plotName = null;
  let ownerScope = "colegio";
  let ownerUid = null;
  let ownerName = null;
  let isReal = true;

  if (plotId) {
    const plotDoc = await getDoc(doc(db, "plots", plotId));
    if (plotDoc.exists()) {
      const pData = plotDoc.data();
      plotName = pData.name;
      ownerScope = pData.ownerScope || "colegio";
      ownerUid = pData.ownerUid || null;
      ownerName = pData.ownerName || null;
      isReal = pData.isReal !== undefined ? pData.isReal : true;
    }
  }

  const plantedDate = Timestamp.now();
  const daysToHarvest = cropType.daysToHarvest || 60;
  const expectedHarvestMs = plantedDate.toMillis() + (daysToHarvest * 24 * 60 * 60 * 1000);
  const expectedHarvestDate = Timestamp.fromMillis(expectedHarvestMs);

  const wateringIntervalDays = cropType.wateringIntervalDays || 2;
  const nextWateringMs = plantedDate.toMillis() + (wateringIntervalDays * 24 * 60 * 60 * 1000);
  const nextWateringDue = Timestamp.fromMillis(nextWateringMs);

  let nextFertilizingDue = null;
  if (cropType.fertilizingIntervalDays) {
    const nextFertMs = plantedDate.toMillis() + (cropType.fertilizingIntervalDays * 24 * 60 * 60 * 1000);
    nextFertilizingDue = Timestamp.fromMillis(nextFertMs);
  }

  const newCrop = {
    cropTypeId,
    cropTypeName: cropType.name,
    cropTypeIcon: cropType.icon || "🌱",
    plotId: plotId || null,
    plotName: plotName,
    ownerScope,
    ownerUid,
    ownerName,
    isReal,
    plantedDate,
    expectedHarvestDate,
    status: "creciendo",
    plantedByUid: user.uid,
    plantedByName: user.displayName || user.email || "Usuario Green Force",
    quantity: quantity ? Number(quantity) : 1,
    photo: photo || null,
    notes: notes || null,
    lastWateredAt: null,
    lastFertilizedAt: null,
    nextWateringDue,
    nextFertilizingDue,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, "crops"), newCrop);

  // Marcar bancal como en_uso si corresponde
  if (plotId) {
    try {
      await updateDoc(doc(db, "plots", plotId), {
        gameStatus: 'en_uso',
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn("No se pudo actualizar estado del bancal:", e);
    }
  }

  return docRef.id;
}

// ──────────────────────────────────────────────────────────────
//  4. REGISTRO DE EVENTOS (RIEGO, FERTILIZACIÓN, COSECHA, INCIDENCIA)
// ──────────────────────────────────────────────────────────────

export async function logRiego(cropId, { notes = "", isRain = false, user }) {
  const cropRef = doc(db, "crops", cropId);
  const riegosRef = collection(cropRef, "riegos");
  const now = Timestamp.now();

  await runTransaction(db, async (transaction) => {
    const cropSnap = await transaction.get(cropRef);
    if (!cropSnap.exists()) throw new Error("Cultivo no encontrado");
    const crop = cropSnap.data();

    // Obtener intervalo del cropType
    const typeSnap = await transaction.get(doc(db, "cropTypes", crop.cropTypeId));
    const intervalDays = typeSnap.exists() ? (typeSnap.data().wateringIntervalDays || 2) : 2;

    const nextDueMs = now.toMillis() + (intervalDays * 24 * 60 * 60 * 1000);
    const nextWateringDue = Timestamp.fromMillis(nextDueMs);

    transaction.set(doc(riegosRef), {
      date: now,
      isRain: !!isRain,
      doneByUid: user.uid,
      doneByName: user.displayName || user.email || "Usuario Green Force",
      notes: isRain ? (notes ? `Lluvia natural: ${notes}` : "Lluvia natural") : notes,
      createdAt: serverTimestamp()
    });

    transaction.update(cropRef, {
      lastWateredAt: now,
      nextWateringDue: nextWateringDue,
      updatedAt: serverTimestamp()
    });
  });
}

export async function logFertilizacion(cropId, { product = "Abono Orgánico", quantity = "Dosis normal", notes = "", user }) {
  const cropRef = doc(db, "crops", cropId);
  const fertRef = collection(cropRef, "fertilizaciones");
  const now = Timestamp.now();

  await runTransaction(db, async (transaction) => {
    const cropSnap = await transaction.get(cropRef);
    if (!cropSnap.exists()) throw new Error("Cultivo no encontrado");
    const crop = cropSnap.data();

    const typeSnap = await transaction.get(doc(db, "cropTypes", crop.cropTypeId));
    const intervalDays = typeSnap.exists() ? (typeSnap.data().fertilizingIntervalDays || 21) : 21;

    const nextDueMs = now.toMillis() + (intervalDays * 24 * 60 * 60 * 1000);
    const nextFertilizingDue = Timestamp.fromMillis(nextDueMs);

    transaction.set(doc(fertRef), {
      date: now,
      product,
      quantity,
      doneByUid: user.uid,
      doneByName: user.displayName || user.email || "Usuario Green Force",
      notes,
      createdAt: serverTimestamp()
    });

    transaction.update(cropRef, {
      lastFertilizedAt: now,
      nextFertilizingDue,
      updatedAt: serverTimestamp()
    });
  });
}

export async function logCosecha(cropId, { quantity, unit = "unidades", isFinalHarvest = true, notes = "", photo = null, user }) {
  const cropRef = doc(db, "crops", cropId);
  const cosechasRef = collection(cropRef, "cosechas");
  const now = Timestamp.now();
  let plotUnlocked = false;
  let unlockedPlotName = null;

  await runTransaction(db, async (transaction) => {
    const cropSnap = await transaction.get(cropRef);
    if (!cropSnap.exists()) throw new Error("Cultivo no encontrado");
    const cropData = cropSnap.data();

    // Firestore exige todas las lecturas de la transacción antes de cualquier escritura
    const plotRef = (isFinalHarvest && cropData.plotId) ? doc(db, "plots", cropData.plotId) : null;
    const plotSnap = plotRef ? await transaction.get(plotRef) : null;

    transaction.set(doc(cosechasRef), {
      date: now,
      quantity: Number(quantity) || 1,
      unit,
      isFinalHarvest: !!isFinalHarvest,
      doneByUid: user.uid,
      doneByName: user.displayName || user.email || "Usuario Green Force",
      notes,
      photo,
      createdAt: serverTimestamp()
    });

    const updateData = { updatedAt: serverTimestamp() };
    if (isFinalHarvest) {
      updateData.status = 'cosechado';

      // Si tiene bancal asignado, actualizar estado del bancal y buscar el siguiente a desbloquear
      if (plotSnap) {
        if (plotSnap.exists()) {
          const currentPlot = plotSnap.data();
          const currentOrder = currentPlot.order ?? 0;
          const currentScope = currentPlot.ownerScope || 'colegio';

          // El bancal actual vuelve a estar 'desbloqueada' (disponible para otra siembra)
          transaction.update(plotRef, {
            gameStatus: 'desbloqueada',
            updatedAt: serverTimestamp()
          });

          // Buscar el bancal con orden consecutivo (order = currentOrder + 1) del mismo dueño
          const allPlotsSnap = await getDocs(collection(db, "plots"));
          let nextPlotDoc = null;
          allPlotsSnap.forEach(d => {
            const p = d.data();
            const sameOwner = (p.ownerScope || 'colegio') === currentScope && (p.ownerUid || null) === (currentPlot.ownerUid || null);
            if (sameOwner && (p.order ?? 0) === currentOrder + 1 && p.gameStatus === 'bloqueada') {
              nextPlotDoc = { id: d.id, ref: doc(db, "plots", d.id), ...p };
            }
          });

          if (nextPlotDoc) {
            transaction.update(nextPlotDoc.ref, {
              gameStatus: 'desbloqueada',
              unlockedAt: now,
              unlockedByHarvestOf: cropId,
              updatedAt: serverTimestamp()
            });
            plotUnlocked = true;
            unlockedPlotName = nextPlotDoc.name;
          }
        }
      }
    }
    transaction.update(cropRef, updateData);
  });

  return { plotUnlocked, unlockedPlotName };
}

export async function logIncidencia(cropId, { type = "otro", description = "", photo = null, user }) {
  const cropRef = doc(db, "crops", cropId);
  const incidenciasRef = collection(cropRef, "incidencias");
  const now = Timestamp.now();

  await addDoc(incidenciasRef, {
    date: now,
    type,
    description,
    photo,
    doneByUid: user.uid,
    doneByName: user.displayName || user.email || "Usuario Green Force",
    createdAt: serverTimestamp()
  });
}

// ──────────────────────────────────────────────────────────────
//  5. OBTENER SUBCOLECCIONES DE EVENTOS HISTÓRICOS
// ──────────────────────────────────────────────────────────────
export async function getCropEvents(cropId) {
  const cropRef = doc(db, "crops", cropId);

  const [riegosSnap, fertSnap, cosechasSnap, incidenciasSnap] = await Promise.all([
    getDocs(query(collection(cropRef, "riegos"), orderBy("date", "desc"))),
    getDocs(query(collection(cropRef, "fertilizaciones"), orderBy("date", "desc"))),
    getDocs(query(collection(cropRef, "cosechas"), orderBy("date", "desc"))),
    getDocs(query(collection(cropRef, "incidencias"), orderBy("date", "desc")))
  ]);

  const events = [];

  riegosSnap.forEach(d => events.push({ id: d.id, eventType: 'riego', ...d.data() }));
  fertSnap.forEach(d => events.push({ id: d.id, eventType: 'fertilizacion', ...d.data() }));
  cosechasSnap.forEach(d => events.push({ id: d.id, eventType: 'cosecha', ...d.data() }));
  incidenciasSnap.forEach(d => events.push({ id: d.id, eventType: 'incidencia', ...d.data() }));

  // Ordenar cronológicamente descendente
  events.sort((a, b) => {
    const tA = a.date ? a.date.toMillis() : 0;
    const tB = b.date ? b.date.toMillis() : 0;
    return tB - tA;
  });

  return events;
}
