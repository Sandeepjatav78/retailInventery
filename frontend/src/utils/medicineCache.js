const CACHE_KEY = 'medicine_inventory_cache_v2';
const CACHE_TTL_MS = 5 * 60 * 1000;

const canUseStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const normalizeText = (value) => String(value || '').trim().toLowerCase();

export const getCachedMedicines = () => {
  if (!canUseStorage()) return [];

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return [];

    return parsed.items;
  } catch {
    return [];
  }
};

export const getCachedMedicinesMeta = () => {
  if (!canUseStorage()) return { items: [], ts: 0 };

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { items: [], ts: 0 };

    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed?.items) ? parsed.items : [],
      ts: Number(parsed?.ts || 0),
    };
  } catch {
    return { items: [], ts: 0 };
  }
};

export const setCachedMedicines = (items) => {
  if (!canUseStorage()) return;

  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), items: Array.isArray(items) ? items : [] }));
  } catch {
    // ignore cache write failures
  }
};

export const isMedicinesCacheFresh = () => {
  const meta = getCachedMedicinesMeta();
  return Boolean(meta.ts && Date.now() - meta.ts < CACHE_TTL_MS && meta.items.length >= 0);
};

export const filterMedicinesFromCache = (items, query, options = {}) => {
  const {
    includeOutOfStock = false,
    userRole = 'staff',
    searchPartyName = false,
  } = options;

  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  return (Array.isArray(items) ? items : []).filter((med) => {
    if (!includeOutOfStock) {
      const quantity = Number(med.quantity || 0);
      const looseQty = Number(med.looseQty || 0);
      if (quantity <= 0 && looseQty <= 0) return false;
    }

    if (userRole === 'staff' && !normalizeText(med.hsnCode)) {
      return false;
    }

    const haystackParts = [med.productName, med.batchNumber, med.hsnCode];
    if (searchPartyName) {
      haystackParts.push(med.partyName);
    }

    return haystackParts.some((part) => normalizeText(part).includes(normalizedQuery));
  });
};

export const syncMedicinesCache = async (api) => {
  const res = await api.get('/medicines');
  setCachedMedicines(res.data);
  return res.data;
};
