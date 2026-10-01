// Single source of truth for the drug-schedule dropdown/badges on the
// frontend — the actual list + descriptions come from the backend
// (server/utils/scheduleDetector.js) via GET /medicines/schedule-categories,
// so both sides never drift apart.

let cache = null; // { categories: string[], info: Record<string,string> }
let inflight = null;

const FALLBACK_CATEGORIES = ['None', 'G', 'H', 'H1', 'X'];

export const fetchScheduleCategories = async (api) => {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = api.get('/medicines/schedule-categories')
    .then((res) => {
      cache = {
        categories: res.data?.categories?.length ? res.data.categories : FALLBACK_CATEGORIES,
        info: res.data?.info || {}
      };
      return cache;
    })
    .catch(() => {
      cache = { categories: FALLBACK_CATEGORIES, info: {} };
      return cache;
    })
    .finally(() => { inflight = null; });
  return inflight;
};

// The handful of schedules an actual retail SKU is realistically tagged
// with get their own color; everything else (the administrative schedules
// like A/B/D/J/N/P/P1/T/U/Z) shares one neutral style since they'll almost
// never be picked for a real product.
export const SCHEDULE_BADGE_STYLES = {
  X: 'bg-purple-50 text-purple-700 border-purple-200',
  H1: 'bg-red-50 text-red-700 border-red-200',
  H: 'bg-amber-50 text-amber-700 border-amber-200',
  G: 'bg-sky-50 text-sky-700 border-sky-200',
  C: 'bg-teal-50 text-teal-700 border-teal-200',
  C1: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  E1: 'bg-rose-50 text-rose-700 border-rose-200',
  O: 'bg-lime-50 text-lime-700 border-lime-200',
  R1: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  R: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  S: 'bg-pink-50 text-pink-700 border-pink-200',
  F: 'bg-orange-50 text-orange-700 border-orange-200',
  F1: 'bg-orange-50 text-orange-700 border-orange-200'
};
export const DEFAULT_SCHEDULE_BADGE_STYLE = 'bg-gray-50 text-gray-600 border-gray-200';
