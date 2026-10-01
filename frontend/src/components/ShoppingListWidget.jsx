import React, { useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'shopping_list_v1';
const AUTO_DELETE_MS = 24 * 60 * 60 * 1000; // 1 din baad bought items hat jaayenge

const loadList = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveList = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Ignore storage failures (private mode / quota) — list just won't persist.
  }
};

// Drops items that were ticked ("le aaya") more than 24h ago.
const pruneExpired = (list) => {
  const now = Date.now();
  return list.filter((item) => !(item.checked && item.checkedAt && now - item.checkedAt > AUTO_DELETE_MS));
};

const ShoppingListWidget = () => {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(() => pruneExpired(loadList()));
  const [text, setText] = useState('');
  const inputRef = useRef(null);

  // Prune on mount and once an hour while the tab stays open, so stale
  // bought items eventually disappear even without reopening the popup.
  useEffect(() => {
    const clean = () => setItems((prev) => {
      const next = pruneExpired(prev);
      if (next.length !== prev.length) saveList(next);
      return next;
    });
    clean();
    const interval = setInterval(clean, 60 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  const persist = (next) => {
    setItems(next);
    saveList(next);
  };

  const addItem = () => {
    const value = text.trim();
    if (!value) return;
    const next = [...items, { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, text: value, checked: false, createdAt: Date.now(), checkedAt: null }];
    persist(next);
    setText('');
  };

  const toggleItem = (id) => {
    const next = items.map((item) => item.id === id
      ? { ...item, checked: !item.checked, checkedAt: !item.checked ? Date.now() : null }
      : item);
    persist(next);
  };

  const removeItem = (id) => {
    persist(items.filter((item) => item.id !== id));
  };

  const pendingCount = items.filter((i) => !i.checked).length;
  const pending = items.filter((i) => !i.checked);
  const bought = items.filter((i) => i.checked);

  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      {open && (
        <div className="mb-3 w-72 sm:w-80 max-h-[70vh] flex flex-col rounded-2xl border border-amber-200 bg-amber-50 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-amber-100 border-b border-amber-200">
            <h3 className="font-extrabold text-amber-900 text-sm flex items-center gap-1.5">🛒 Market Se Lana Hai</h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-amber-700 hover:text-amber-900 font-bold text-sm px-1.5 rounded hover:bg-amber-200"
              title="Close"
            >✕</button>
          </div>

          <div className="px-3 py-2 border-b border-amber-200 bg-amber-50 flex gap-2">
            <input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
              placeholder="Item likho... (jaise: Paracetamol strip)"
              className="flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-amber-300"
            />
            <button
              type="button"
              onClick={addItem}
              className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-sm font-bold shrink-0"
            >Add</button>
          </div>

          <div className="overflow-y-auto flex-1 px-3 py-2 space-y-1.5">
            {items.length === 0 && (
              <p className="text-xs text-amber-700/70 italic text-center py-4">List khali hai — upar type karke add karein.</p>
            )}

            {pending.map((item) => (
              <label key={item.id} className="flex items-center gap-2 rounded-lg bg-white border border-amber-200 px-2.5 py-2 text-sm cursor-pointer">
                <input type="checkbox" checked={false} onChange={() => toggleItem(item.id)} className="w-4 h-4 accent-amber-600 shrink-0" />
                <span className="flex-1 text-gray-800">{item.text}</span>
                <button type="button" onClick={(e) => { e.preventDefault(); removeItem(item.id); }} className="text-gray-300 hover:text-red-500 text-xs font-bold px-1" title="Remove">✕</button>
              </label>
            ))}

            {bought.length > 0 && (
              <>
                <div className="pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700/70">✅ Le Aaya Hu (24h me hat jayega)</div>
                {bought.map((item) => (
                  <label key={item.id} className="flex items-center gap-2 rounded-lg bg-amber-100/60 border border-amber-200 px-2.5 py-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={true} onChange={() => toggleItem(item.id)} className="w-4 h-4 accent-amber-600 shrink-0" />
                    <span className="flex-1 text-amber-800/70 line-through">{item.text}</span>
                    <button type="button" onClick={(e) => { e.preventDefault(); removeItem(item.id); }} className="text-amber-400 hover:text-red-500 text-xs font-bold px-1" title="Remove">✕</button>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-600 text-white text-2xl shadow-xl flex items-center justify-center transition-transform hover:scale-105"
        title="Market List"
      >
        🛒
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center border-2 border-white">
            {pendingCount}
          </span>
        )}
      </button>
    </div>
  );
};

export default ShoppingListWidget;
