import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from './auth/AuthContext';
import {
  ShieldIcon, InboxIcon, SendIcon, PencilIcon, BanIcon, LockIcon,
  SettingsIcon, LogOutIcon, DocIcon, ScanIcon, ChartIcon, KeyIcon,
} from './components/Icons';

const navItems = [
  { to: '/app/inbox', label: 'Inbox', Icon: InboxIcon },
  { to: '/app/scanning', label: 'Scanning', Icon: ScanIcon },
  { to: '/app/sent', label: 'Sent', Icon: SendIcon },
  { to: '/app/compose', label: 'Compose', Icon: PencilIcon },
  { to: '/app/spam', label: 'Spam', Icon: BanIcon },
  { to: '/app/quarantine', label: 'Quarantine', Icon: LockIcon },
  { to: '/app/settings', label: 'Settings', Icon: SettingsIcon },
  { to: '/app/api', label: 'API', Icon: KeyIcon },
];

const adminNavItems = [
  { to: '/app/admin', label: 'Admin', Icon: ChartIcon },
];

export default function App() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'bg-blue-600 text-white'
        : 'text-gray-400 hover:text-white hover:bg-gray-800'
    }`;

  return (
    <div className="min-h-screen flex bg-gray-900 text-gray-100">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-gray-800/50 border-r border-gray-700/50 p-4">
        <Link to="/" className="flex items-center gap-2 mb-8 px-2">
          <ShieldIcon size={22} className="text-blue-400" />
          <span className="font-bold text-lg">AI Guard Mail</span>
        </Link>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
          {user?.role === 'admin' && adminNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              <item.Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-gray-700/50 pt-4 mt-4 space-y-1">
          <Link to="/docs" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition">
            <DocIcon size={18} />
            <span>Docs</span>
          </Link>
          {user && (
            <p className="text-xs text-gray-500 mb-2 px-3 truncate">{user.customEmail}</p>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
          >
            <LogOutIcon size={18} />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-30 bg-gray-800 border-b border-gray-700/50 px-4 py-3 flex items-center justify-between">
        <Link to="/app" className="flex items-center gap-2">
          <ShieldIcon size={20} className="text-blue-400" />
          <span className="font-bold">AI Guard Mail</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-gray-700"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileOpen
              ? <path d="M6 18L18 6M6 6l12 12" />
              : <path d="M3 12h18M3 6h18M3 18h18" />}
          </svg>
        </button>
      </div>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setMobileOpen(false)}>
          <div
            className="absolute right-0 top-0 bottom-0 w-64 bg-gray-800 border-l border-gray-700/50 p-4 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-6 mt-12" />
            <nav className="flex flex-col gap-1 flex-1">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              {user?.role === 'admin' && adminNavItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={linkClass}
                  onClick={() => setMobileOpen(false)}
                >
                  <item.Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
              <Link
                to="/docs"
                className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
                onClick={() => setMobileOpen(false)}
              >
                <DocIcon size={18} />
                <span>Docs</span>
              </Link>
            </nav>
            <div className="border-t border-gray-700/50 pt-4 mt-4">
              {user && (
                <p className="text-xs text-gray-500 mb-2 px-3 truncate">{user.customEmail}</p>
              )}
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition"
              >
                <LogOutIcon size={18} />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}
