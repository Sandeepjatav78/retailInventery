import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';

const DESKTOP_QUERY = '(min-width: 1024px)';
const PIN_KEY = 'sidebar_open';
const SWIPE_MIN = 60;      // px of horizontal movement that counts as a swipe
const EDGE_ZONE = 24;      // swipe right starting this close to the left edge opens the menu

const readPinned = () => {
  try {
    const saved = localStorage.getItem(PIN_KEY);
    return saved === null ? true : saved === '1';
  } catch {
    return true;
  }
};

// Left side menu. Desktop: open by default and pushes the page; ☰ hides it (remembered).
// Mobile: hidden by default, slides over the page; ☰ / swipe from the left edge opens it,
// swipe left / tap outside / picking a page closes it.
const Sidebar = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const userRole = localStorage.getItem('userRole'); // 'admin' or 'staff'

  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const [desktopOpen, setDesktopOpen] = useState(readPinned);
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = isDesktop ? desktopOpen : mobileOpen;

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (e) => setIsDesktop(e.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const setOpen = (value) => {
    if (isDesktop) {
      setDesktopOpen(value);
      try { localStorage.setItem(PIN_KEY, value ? '1' : '0'); } catch { /* storage blocked */ }
    } else {
      setMobileOpen(value);
    }
  };

  // Swipe gestures (touch screens).
  const touchStart = useRef(null);
  useEffect(() => {
    const onStart = (e) => {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    };
    const onEnd = (e) => {
      const start = touchStart.current;
      touchStart.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dy) > Math.abs(dx)) return; // vertical scroll, ignore
      if (dx < 0 && open) setOpen(false);
      if (dx > 0 && !open && start.x <= EDGE_ZONE) setOpen(true);
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchend', onEnd);
    };
  });

  // Count of bill photos sent from the mobile app and not entered yet (refreshed on page change).
  const [pendingUploads, setPendingUploads] = useState(0);
  useEffect(() => {
    if (userRole !== 'admin') return;
    api.get('/medicines/bill-uploads', { params: { status: 'Pending', limit: 1 } })
      .then((res) => setPendingUploads(res.data?.pendingCount || 0))
      .catch(() => {});
  }, [userRole, location.pathname]);

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to Logout?')) {
      localStorage.clear();
      navigate('/login');
    }
  };

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'staff';

  // [path, icon, label, visible]
  const sections = [
    ['Billing', [
      ['/', '📦', 'Inventory', isAdmin || isStaff],
      ['/sales', '💰', 'Sale', isAdmin],
      ['/manual', '📝', 'Bill', true],
      ['/auto-bill', '🎲', 'Auto Bill', isStaff],
      ['/reports', '📊', 'Reports', true],
      ['/credits', '💳', 'Credit', isAdmin],
      ['/schedule-ledger', '💊', 'Schedule Ledger', isStaff],
    ]],
    ['Purchase', [
      ['/purchase-bill', '📥', 'Purchase Bill', isAdmin],
      ['/mobile-uploads', '📲', 'Mobile Uploads', isAdmin],
      ['/purchase-bill-history', '🗂', 'Bill History', isAdmin],
      ['/supplier-ledger', '📖', 'Party Ledger', isAdmin],
      ['/kachi-entry', '🧾', 'Kachi Entry', isAdmin],
      ['/cp', '🏷', 'CP', isAdmin],
      ['/purchase-returns', '↩️', 'Purchase Return', isStaff],
    ]],
  ];

  const current = sections.flatMap(([, links]) => links).find(([path]) => path === location.pathname);

  const linkClass = (path) => {
    const base = 'flex items-center gap-3 px-3 py-2 rounded-lg font-semibold text-sm transition-colors whitespace-nowrap';
    return location.pathname === path
      ? `${base} bg-teal-50 text-teal-700 border border-teal-100 shadow-sm`
      : `${base} text-gray-600 hover:bg-gray-50 hover:text-teal-600 border border-transparent`;
  };

  return (
    <>
      {/* Dim background behind the menu on mobile */}
      {!isDesktop && open && (
        <div className="fixed inset-0 z-40 bg-slate-900/40" onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-gray-200 shadow-sm flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-hidden={!open}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-gray-100">
          <h2 className="text-lg font-extrabold text-teal-800 tracking-tight flex items-center gap-2">🌿 Radhe Pharmacy</h2>
          <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Menu band karein">«</button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
          {sections.map(([title, links]) => {
            const visible = links.filter(([, , , show]) => show);
            if (visible.length === 0) return null;
            return (
              <div key={title}>
                <p className="px-3 mb-1 text-[10px] font-extrabold uppercase tracking-wider text-gray-400">{title}</p>
                <ul className="space-y-0.5">
                  {visible.map(([path, icon, label]) => (
                    <li key={path}>
                      <Link to={path} className={linkClass(path)} onClick={() => setMobileOpen(false)}>
                        <span className="w-5 text-center">{icon}</span>
                        <span className="flex-1">{label}</span>
                        {path === '/mobile-uploads' && pendingUploads > 0 && (
                          <span className="px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{pendingUploads}</span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="p-3 border-t border-gray-100 flex items-center justify-between">
          {isAdmin ? (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase border tracking-wide bg-purple-50 text-purple-700 border-purple-100">Admin</span>
          ) : <span className="text-xs font-semibold text-gray-400 capitalize">{userRole || ''}</span>}
          <button onClick={handleLogout} className="text-red-500 hover:text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg text-sm font-bold" title="Logout">
            Logout ➔
          </button>
        </div>
      </aside>

      <div className={`min-h-screen flex flex-col transition-[padding] duration-200 ${isDesktop && open ? 'pl-60' : ''}`}>
        <header className="h-14 bg-white border-b border-gray-200 flex items-center gap-3 px-3 sm:px-4 shadow-sm sticky top-0 z-30">
          <button
            onClick={() => setOpen(!open)}
            className="w-10 h-10 rounded-lg border border-gray-200 text-gray-700 hover:bg-teal-50 hover:text-teal-700 text-xl leading-none"
            title={open ? 'Menu chhupayein' : 'Menu kholein'}
            aria-label="Toggle menu"
          >
            ☰
          </button>
          <span className="font-extrabold text-gray-800 truncate">
            {current ? `${current[1]} ${current[2]}` : '🌿 Radhe Pharmacy'}
          </span>
          {isAdmin && pendingUploads > 0 && !open && (
            <Link to="/mobile-uploads" className="ml-auto px-2 py-1 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold whitespace-nowrap">
              📲 {pendingUploads} pending
            </Link>
          )}
        </header>
        {children}
      </div>
    </>
  );
};

export default Sidebar;
