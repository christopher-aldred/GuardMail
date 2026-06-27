import { useEffect, useState, useCallback } from 'react';
import { api } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ChartIcon, TrashIcon, BanIcon, CheckIcon } from '../components/Icons';

interface Stats {
  totalUsers: number;
  uniqueLogins24h: number;
  emailsSent: number;
  emailsReceived: number;
  emailsSent24h: number;
  emailsReceived24h: number;
}

interface AdminUser {
  id: string;
  username: string;
  email: string;
  customEmail: string;
  tier: string;
  role: string;
  disabled: boolean;
  emailVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

interface AdminEmail {
  id: string;
  userId: string;
  username: string;
  customEmail: string;
  from: string;
  to: string[];
  subject: string;
  status: string;
  createdAt: string;
}

type TabKey = 'users' | 'logins' | 'sent' | 'received';

const PAGE_SIZE = 10;

function fmtDate(s: string | null) {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function StatCard({
  label,
  value,
  sub,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-gray-800/60 border rounded-xl p-5 transition hover:bg-gray-800/80 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        active ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-700/50'
      }`}
    >
      <p className="text-sm text-gray-400">{label}</p>
      <p className="text-3xl font-bold text-gray-100 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </button>
  );
}

export function AdminPage() {
  const { user: me } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<TabKey | null>(null);

  // Users listing (users + logins share this shape)
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersLoading, setUsersLoading] = useState(false);

  // Emails listing (sent + received share this shape)
  const [emails, setEmails] = useState<AdminEmail[]>([]);
  const [emailsTotal, setEmailsTotal] = useState(0);
  const [emailsPage, setEmailsPage] = useState(1);
  const [emailsLoading, setEmailsLoading] = useState(false);

  const [actionError, setActionError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadStats = useCallback(() => {
    setLoading(true);
    api
      .getAdminStats()
      .then((s) => setStats(s))
      .catch((e) => setError(e.message ?? 'Failed to load stats'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const loadUsers = useCallback(
    async (tab: 'users' | 'logins', page: number) => {
      setUsersLoading(true);
      setActionError('');
      try {
        const res =
          tab === 'users'
            ? await api.getAdminUsers(page, PAGE_SIZE)
            : await api.getAdminLogins(page, PAGE_SIZE);
        setUsers(res.users);
        setUsersTotal(res.total);
        setUsersPage(res.page);
      } catch (e) {
        setActionError((e as Error).message ?? 'Failed to load users');
      } finally {
        setUsersLoading(false);
      }
    },
    [],
  );

  const loadEmails = useCallback(
    async (tab: 'sent' | 'received', page: number) => {
      setEmailsLoading(true);
      setActionError('');
      try {
        const res =
          tab === 'sent'
            ? await api.getAdminEmailsSent(page, PAGE_SIZE)
            : await api.getAdminEmailsReceived(page, PAGE_SIZE);
        setEmails(res.emails);
        setEmailsTotal(res.total);
        setEmailsPage(res.page);
      } catch (e) {
        setActionError((e as Error).message ?? 'Failed to load emails');
      } finally {
        setEmailsLoading(false);
      }
    },
    [],
  );

  const openTab = useCallback(
    (tab: TabKey) => {
      setActiveTab(tab);
      setConfirmDelete(null);
      setActionError('');
      if (tab === 'users' || tab === 'logins') {
        setUsersPage(1);
        loadUsers(tab, 1);
      } else {
        setEmailsPage(1);
        loadEmails(tab, 1);
      }
    },
    [loadUsers, loadEmails],
  );

  const handleDisable = async (id: string) => {
    setActionError('');
    try {
      await api.adminDisableUser(id);
      if (activeTab === 'users' || activeTab === 'logins') {
        await loadUsers(activeTab, usersPage);
      }
      loadStats();
    } catch (e) {
      setActionError((e as Error).message ?? 'Failed to disable user');
    }
  };

  const handleEnable = async (id: string) => {
    setActionError('');
    try {
      await api.adminEnableUser(id);
      if (activeTab === 'users' || activeTab === 'logins') {
        await loadUsers(activeTab, usersPage);
      }
      loadStats();
    } catch (e) {
      setActionError((e as Error).message ?? 'Failed to enable user');
    }
  };

  const handleDelete = async (id: string) => {
    setActionError('');
    try {
      await api.adminDeleteUser(id);
      setConfirmDelete(null);
      if (activeTab === 'users' || activeTab === 'logins') {
        // If we deleted the last row on the current page, step back a page.
        const remaining = usersTotal - 1;
        const lastPage = Math.max(1, Math.ceil(remaining / PAGE_SIZE));
        const targetPage = Math.min(usersPage, lastPage);
        await loadUsers(activeTab, targetPage);
      }
      loadStats();
    } catch (e) {
      setActionError((e as Error).message ?? 'Failed to delete user');
    }
  };

  const usersTotalPages = Math.max(1, Math.ceil(usersTotal / PAGE_SIZE));
  const emailsTotalPages = Math.max(1, Math.ceil(emailsTotal / PAGE_SIZE));

  if (loading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <p className="text-gray-400">Loading stats…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-gray-100 flex items-center gap-2">
        <ChartIcon size={22} className="text-blue-400" />
        Admin Dashboard
      </h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          label="User accounts"
          value={stats!.totalUsers}
          sub="All registered accounts — click to view"
          active={activeTab === 'users'}
          onClick={() => openTab('users')}
        />
        <StatCard
          label="Unique logins (24h)"
          value={stats!.uniqueLogins24h}
          sub="Distinct users who signed in in the past 24 hours"
          active={activeTab === 'logins'}
          onClick={() => openTab('logins')}
        />
        <StatCard
          label="Emails sent"
          value={stats!.emailsSent}
          sub={`${stats!.emailsSent24h} in the past 24 hours`}
          active={activeTab === 'sent'}
          onClick={() => openTab('sent')}
        />
        <StatCard
          label="Emails received"
          value={stats!.emailsReceived}
          sub={`${stats!.emailsReceived24h} in the past 24 hours`}
          active={activeTab === 'received'}
          onClick={() => openTab('received')}
        />
      </div>

      {activeTab && (activeTab === 'users' || activeTab === 'logins') && (
        <section className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-200">
              {activeTab === 'users'
                ? 'User accounts (most recently logged in)'
                : 'Users who logged in (past 24h)'}
            </h2>
            <button
              onClick={() => openTab(activeTab)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Refresh
            </button>
          </div>

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}

          {usersLoading ? (
            <p className="text-sm text-gray-400">Loading users…</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-gray-500">No users found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-700/50">
                    <th className="py-2 pr-3">Username</th>
                    <th className="py-2 pr-3">Custom email</th>
                    <th className="py-2 pr-3">Tier</th>
                    <th className="py-2 pr-3">Role</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last login</th>
                    <th className="py-2 pr-3">Created</th>
                    <th className="py-2 pr-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = me?.id === u.id;
                    const isAdmin = u.role === 'admin';
                    const protectedRow = isSelf || isAdmin;
                    return (
                      <tr key={u.id} className="border-b border-gray-800/60">
                        <td className="py-2 pr-3 text-gray-100">{u.username}</td>
                        <td className="py-2 pr-3 text-gray-300">{u.customEmail}</td>
                        <td className="py-2 pr-3 text-gray-400">{u.tier}</td>
                        <td className="py-2 pr-3 text-gray-400">{u.role}</td>
                        <td className="py-2 pr-3">
                          {u.disabled ? (
                            <span className="px-2 py-0.5 rounded text-xs bg-red-900/60 text-red-300">disabled</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-xs bg-green-900/40 text-green-300">active</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{fmtDate(u.lastLoginAt)}</td>
                        <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{fmtDate(u.createdAt)}</td>
                        <td className="py-2 pr-3 text-right whitespace-nowrap">
                          {protectedRow ? (
                            <span className="text-xs text-gray-600">—</span>
                          ) : u.disabled ? (
                            <button
                              onClick={() => handleEnable(u.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-900/50 text-green-300 hover:bg-green-900 transition"
                              title="Enable account"
                            >
                              <CheckIcon size={14} /> Enable
                            </button>
                          ) : (
                            <button
                              onClick={() => handleDisable(u.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-yellow-900/40 text-yellow-300 hover:bg-yellow-900/70 transition"
                              title="Disable account"
                            >
                              <BanIcon size={14} /> Disable
                            </button>
                          )}
                          {!protectedRow &&
                            (confirmDelete === u.id ? (
                              <span className="inline-flex items-center gap-1 ml-2">
                                <button
                                  onClick={() => handleDelete(u.id)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-600 text-white hover:bg-red-500 transition"
                                >
                                  <TrashIcon size={14} /> Confirm
                                </button>
                                <button
                                  onClick={() => setConfirmDelete(null)}
                                  className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-200 hover:bg-gray-600 transition"
                                >
                                  Cancel
                                </button>
                              </span>
                            ) : (
                              <button
                                onClick={() => setConfirmDelete(u.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-red-900/40 text-red-300 hover:bg-red-900/70 transition ml-2"
                                title="Delete account and purge all emails"
                              >
                                <TrashIcon size={14} /> Delete
                              </button>
                            ))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!usersLoading && users.length > 0 && (
            <Pagination
              page={usersPage}
              totalPages={usersTotalPages}
              total={usersTotal}
              onPage={(p) => loadUsers(activeTab, p)}
            />
          )}
        </section>
      )}

      {activeTab && (activeTab === 'sent' || activeTab === 'received') && (
        <section className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 md:p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-sm font-semibold text-gray-200">
              {activeTab === 'sent' ? 'Sent emails (newest first)' : 'Received emails (newest first)'}
            </h2>
            <button
              onClick={() => openTab(activeTab)}
              className="text-xs text-gray-400 hover:text-white"
            >
              Refresh
            </button>
          </div>

          {actionError && <p className="text-xs text-red-400">{actionError}</p>}

          {emailsLoading ? (
            <p className="text-sm text-gray-400">Loading emails…</p>
          ) : emails.length === 0 ? (
            <p className="text-sm text-gray-500">No emails found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 border-b border-gray-700/50">
                    <th className="py-2 pr-3">Owner</th>
                    <th className="py-2 pr-3">From</th>
                    <th className="py-2 pr-3">To</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {emails.map((e) => (
                    <tr key={e.id} className="border-b border-gray-800/60">
                      <td className="py-2 pr-3 text-gray-200 whitespace-nowrap">{e.username}</td>
                      <td className="py-2 pr-3 text-gray-400 whitespace-nowrap">{e.from}</td>
                      <td className="py-2 pr-3 text-gray-400 max-w-[14rem] truncate">{e.to.join(', ')}</td>
                      <td className="py-2 pr-3 text-gray-300 max-w-[16rem] truncate">{e.subject || '(no subject)'}</td>
                      <td className="py-2 pr-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-700/60 text-gray-300">{e.status}</span>
                      </td>
                      <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">{fmtDate(e.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!emailsLoading && emails.length > 0 && (
            <Pagination
              page={emailsPage}
              totalPages={emailsTotalPages}
              total={emailsTotal}
              onPage={(p) => loadEmails(activeTab, p)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  onPage,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
      <p className="text-xs text-gray-500">
        Page {page} of {totalPages} · {total} total
      </p>
      <div className="flex gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 rounded-lg text-xs bg-gray-700 text-gray-200 hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Prev
        </button>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="px-3 py-1 rounded-lg text-xs bg-gray-700 text-gray-200 hover:bg-gray-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  );
}