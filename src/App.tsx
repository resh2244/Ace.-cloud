/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Server, Cpu, HardDrive, Shield, Activity, Terminal, Play, Square, 
  RotateCw, Trash2, Plus, Search, CheckCircle2, AlertTriangle, 
  XCircle, Clock, LogOut, Lock, Eye, EyeOff, Menu, X, Copy, Check, 
  Wifi, HelpCircle, FileText, ArrowUpRight, ChevronRight, Layers, Smartphone, Bell
} from 'lucide-react';
import { OfflineBanner } from './components/OfflineBanner';
import { PWAInstallButton } from './components/PWAInstallButton';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase';

interface User {
  id: string;
  email: string;
  role: string;
  displayName?: string;
}

interface VM {
  id: string;
  name: string;
  hostname: string;
  os_image: string;
  status: 'queued' | 'provisioning' | 'running' | 'stopped' | 'deleting' | 'deleted' | 'failed' | 'unknown';
  vcpu: number;
  ram_mb: number;
  disk_gb: number;
  host_id: string;
  ip_address: string | null;
  network_mode: 'private_nat';
  ssh_public_key: string;
  created_at: string;
  updated_at: string;
}

interface Host {
  id: string;
  name: string;
  address: string;
  status: 'online' | 'offline' | 'maintenance';
  maintenance_mode?: boolean;
  agent_version: string;
  cpu_total: number;
  ram_total_mb: number;
  storage_total_gb: number;
  cpu_used_percent: number;
  ram_used_mb: number;
  storage_used_gb: number;
  running_vms_count: number;
  last_heartbeat: string;
}

interface Job {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  vm_id: string | null;
  error_message: string | null;
  created_at: string;
}

interface AuditEvent {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  details: string;
  created_at: string;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'vms' | 'create-vm' | 'vm-detail' | 'hosts' | 'jobs' | 'docs'>('dashboard');
  const [selectedVmId, setSelectedVmId] = useState<string | null>(null);

  // Auth form state
  const [email, setEmail] = useState('admin@simone.cloud');
  const [password, setPassword] = useState('adminpassword123');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // App data state
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [vms, setVms] = useState<VM[]>([]);
  const [osAllowlist, setOsAllowlist] = useState<any[]>([]);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedVmDetail, setSelectedVmDetail] = useState<{ vm: VM; host: any; jobs: Job[] } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Mobile menu state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Create VM Form State
  const [vmForm, setVmForm] = useState({
    name: '',
    hostname: '',
    os_image: 'ubuntu-24.04-lts',
    vcpu: 2,
    ram_mb: 4096,
    disk_gb: 40,
    ssh_public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG... ace-cloud-admin@workstation',
  });
  const [creatingVm, setCreatingVm] = useState(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    actionName: string;
    isDestructive?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Firebase Auth Observer & Session Sync
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const mappedUser: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email || 'user@ace.cloud',
          role: 'admin',
          displayName: firebaseUser.displayName || firebaseUser.email || 'Admin',
        };
        setUser(mappedUser);
        setLoadingAuth(false);
        loadAppData();
      } else {
        // Fallback to backend cookie session
        fetch('/api/auth/me')
          .then(res => {
            if (res.ok) return res.json();
            throw new Error('Not authenticated');
          })
          .then(data => {
            setUser(data.user);
            setLoadingAuth(false);
            loadAppData();
          })
          .catch(() => {
            setUser(null);
            setLoadingAuth(false);
          });
      }
    });

    return () => unsubscribe();
  }, []);

  const loadAppData = () => {
    fetch('/api/dashboard')
      .then(res => res.json())
      .then(data => {
        setDashboardData(data);
        checkThresholds(data.host);
      })
      .catch(err => console.error('Dashboard load error:', err));

    fetch('/api/vms')
      .then(res => res.json())
      .then(data => {
        setVms(data.vms || []);
        setOsAllowlist(data.os_allowlist || []);
      })
      .catch(err => console.error('VMs load error:', err));

    fetch('/api/hosts')
      .then(res => res.json())
      .then(data => setHosts(data.hosts || []))
      .catch(err => console.error('Hosts load error:', err));

    fetch('/api/jobs')
      .then(res => res.json())
      .then(data => setJobs(data.jobs || []))
      .catch(err => console.error('Jobs load error:', err));
  };

  const checkThresholds = (hostInfo: Host | null) => {
    if (!hostInfo) return;
    const cpu = hostInfo.cpu_used_percent || 0;
    const ramMb = hostInfo.ram_used_mb || 0;
    const ramTotal = hostInfo.ram_total_mb || 65536;
    const ramPct = (ramMb / ramTotal) * 100;

    if (cpu > 85 || ramPct > 85) {
      // Show persistent alert if threshold crossed
    }
  };

  // Periodic polling
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      loadAppData();
      if (selectedVmId) {
        fetch(`/api/vms/${selectedVmId}`)
          .then(res => res.json())
          .then(data => setSelectedVmDetail(data))
          .catch(() => {});
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [user, selectedVmId]);

  const handleGoogleSignIn = async () => {
    setAuthError('');
    setAuthLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      setUser({
        id: firebaseUser.uid,
        email: firebaseUser.email || 'user@ace.cloud',
        role: 'admin',
        displayName: firebaseUser.displayName || 'Admin',
      });
      showToast('Successfully signed in with Google');
      loadAppData();
    } catch (err: any) {
      setAuthError(err.message || 'Google Sign-In failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'register' ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      setUser(data.user);
      showToast(authMode === 'register' ? 'Account created successfully' : 'Signed in successfully');
      loadAppData();
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (e) {}
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    setCurrentTab('dashboard');
    showToast('Signed out successfully');
  };

  const openVmDetail = (vmId: string) => {
    setSelectedVmId(vmId);
    setCurrentTab('vm-detail');
    fetch(`/api/vms/${vmId}`)
      .then(res => res.json())
      .then(data => setSelectedVmDetail(data))
      .catch(err => showToast('Failed to load VM details', 'error'));
  };

  const handleCreateVm = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingVm(true);

    try {
      const idempotencyKey = `idemp-${Date.now()}-${Math.random()}`;
      const res = await fetch('/api/vms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vmForm, idempotency_key: idempotencyKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create VM');

      showToast(`VM '${vmForm.name}' queued successfully for provisioning`);
      loadAppData();
      openVmDetail(data.vm.id);
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setCreatingVm(false);
    }
  };

  const triggerVmAction = (vmId: string, action: 'start' | 'stop' | 'reboot' | 'delete') => {
    const vm = vms.find(v => v.id === vmId);
    const actionLabel = action.toUpperCase();
    const isDestructive = action === 'delete';

    setConfirmModal({
      title: `${actionLabel} Virtual Machine`,
      message: isDestructive 
        ? `Are you sure you want to permanently delete '${vm?.name || vmId}'? All data on attached disks will be destroyed.`
        : `Are you sure you want to ${action} virtual machine '${vm?.name || vmId}'?`,
      actionName: actionLabel,
      isDestructive,
      onConfirm: async () => {
        setConfirmModal(null);
        try {
          const endpoint = action === 'delete' ? `/api/vms/${vmId}` : `/api/vms/${vmId}/${action}`;
          const method = action === 'delete' ? 'DELETE' : 'POST';
          const res = await fetch(endpoint, { method });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || `Failed to ${action} VM`);

          showToast(`VM action '${action}' queued successfully`);
          loadAppData();
          if (selectedVmId === vmId) {
            openVmDetail(vmId);
          }
        } catch (err: any) {
          showToast(err.message, 'error');
        }
      },
    });
  };

  const toggleMaintenanceMode = async (hostId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/hosts/${hostId}/maintenance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maintenance_mode: !currentStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update maintenance mode');
      showToast(`Host maintenance mode ${!currentStatus ? 'enabled' : 'disabled'}`);
      loadAppData();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
            <CheckCircle2 className="h-3.5 w-3.5" /> Running
          </span>
        );
      case 'stopped':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20 tabular-nums">
            <Square className="h-3.5 w-3.5" /> Stopped
          </span>
        );
      case 'provisioning':
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 tabular-nums animate-pulse">
            <RotateCw className="h-3.5 w-3.5 animate-spin" /> Provisioning
          </span>
        );
      case 'deleting':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 tabular-nums animate-pulse">
            <RotateCw className="h-3.5 w-3.5 animate-spin" /> Deleting
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20 tabular-nums">
            <XCircle className="h-3.5 w-3.5" /> Failed
          </span>
        );
      case 'deleted':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 text-slate-500 tabular-nums">
            Deleted
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 tabular-nums">
            {status}
          </span>
        );
    }
  };

  if (loadingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        <div className="flex items-center gap-3">
          <RotateCw className="h-5 w-5 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Initializing Ace.cloud Control Plane...</span>
        </div>
      </div>
    );
  }

  // --- SIGN IN / REGISTER VIEW ---
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-4 py-8 text-slate-100 selection:bg-blue-500 selection:text-white">
        <OfflineBanner />
        
        {/* Big Ace.cloud Display Hero */}
        <div className="w-full max-w-4xl text-center mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider">
            Ace.cloud Private Infrastructure Control Plane
          </div>
          <h1 className="text-4xl md:text-7xl font-extrabold tracking-tight text-white font-sans">
            Ace<span className="text-blue-500">.</span>cloud
          </h1>
          <p className="text-sm md:text-base text-slate-400 max-w-xl mx-auto">
            High-performance private-cloud control panel for managing virtual machines and VPS instances on your own KVM/libvirt Linux servers.
          </p>
        </div>

        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl space-y-6">
          {/* Google Sign-In Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-white py-3 text-sm font-semibold text-slate-900 shadow-md hover:bg-slate-100 active:scale-[0.99] transition disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
            </svg>
            Sign in with Google (Firebase Auth)
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-800"></div>
            <span className="flex-shrink mx-4 text-xs text-slate-500 uppercase tracking-widest">or email</span>
            <div className="flex-grow border-t border-slate-800"></div>
          </div>

          {/* Create or Login Selector */}
          <div className="grid grid-cols-2 gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setAuthMode('login'); setAuthError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                authMode === 'login' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => { setAuthMode('register'); setAuthError(''); }}
              className={`py-2 text-xs font-semibold rounded-lg transition ${
                authMode === 'register' ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="space-y-4">
            {authError && (
              <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-3.5 text-xs text-rose-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                placeholder="admin@ace.cloud"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300">Password</label>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 transition"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 active:scale-[0.99] transition disabled:opacity-50"
            >
              {authLoading ? 'Processing...' : authMode === 'register' ? 'Create Ace.cloud Account' : 'Sign In to Ace.cloud'}
            </button>
          </form>

          {authMode === 'login' && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">
              <p className="font-medium text-slate-300">Default Admin Credentials:</p>
              <p className="mt-1 font-mono text-slate-400">Email: admin@simone.cloud</p>
              <p className="font-mono text-slate-400">Password: adminpassword123</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const summary = dashboardData?.summary || { total_vms: 0, running_vms: 0, stopped_vms: 0, provisioning_vms: 0, failed_vms: 0 };
  const host = dashboardData?.host;

  // Real-time threshold check across all tabs
  const cpuUsed = host?.cpu_used_percent || 0;
  const ramMb = host?.ram_used_mb || 0;
  const ramTotal = host?.ram_total_mb || 65536;
  const ramUsedPercent = ramTotal > 0 ? (ramMb / ramTotal) * 100 : 0;
  const isCriticalThresholdExceeded = cpuUsed > 85 || ramUsedPercent > 85;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row selection:bg-blue-500 selection:text-white">
      <OfflineBanner />

      {/* --- DESKTOP SIDEBAR --- */}
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-800 bg-slate-900/40 p-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/20">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <span className="font-bold tracking-tight text-white">Ace.cloud</span>
            <span className="block text-[10px] text-emerald-400 font-medium">● Demo Mode Active</span>
          </div>
        </div>

        <nav className="mt-8 space-y-1.5 flex-1">
          <button
            onClick={() => setCurrentTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'dashboard' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <Activity className="h-4 w-4" /> Dashboard
          </button>
          <button
            onClick={() => setCurrentTab('vms')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'vms' || currentTab === 'vm-detail' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <Cpu className="h-4 w-4" /> Virtual Machines
          </button>
          <button
            onClick={() => setCurrentTab('create-vm')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'create-vm' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <Plus className="h-4 w-4" /> Create VM Wizard
          </button>
          <button
            onClick={() => setCurrentTab('hosts')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'hosts' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <HardDrive className="h-4 w-4" /> Host Nodes
          </button>
          <button
            onClick={() => setCurrentTab('jobs')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'jobs' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <Terminal className="h-4 w-4" /> Jobs & Audit Logs
          </button>
          <button
            onClick={() => setCurrentTab('docs')}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition ${
              currentTab === 'docs' ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
            }`}
          >
            <FileText className="h-4 w-4" /> Docs & Guides
          </button>
        </nav>

        <div className="pt-6 border-t border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400 truncate">{user.email}</span>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* --- MOBILE HEADER & NAV --- */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex md:hidden items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
              <Server className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm text-white">Ace.cloud</span>
          </div>
          <div className="flex items-center gap-2">
            <PWAInstallButton />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </header>

        {/* Global Persistent Threshold Indicator in Top Bar */}
        {isCriticalThresholdExceeded && (
          <div className="bg-rose-600 px-4 py-2 text-xs font-bold text-white flex items-center justify-between gap-2 shadow-md animate-pulse">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 shrink-0" />
              <span>CRITICAL ALERT: Host CPU/RAM usage exceeded 85%! ({cpuUsed > 85 ? `CPU: ${cpuUsed}%` : ''} {ramUsedPercent > 85 ? `RAM: ${ramUsedPercent.toFixed(1)}%` : ''})</span>
            </div>
            <button
              onClick={() => setCurrentTab('hosts')}
              className="underline text-white text-[11px] whitespace-nowrap hover:opacity-80"
            >
              Inspect Nodes →
            </button>
          </div>
        )}

        {mobileMenuOpen && (
          <div className="md:hidden border-b border-slate-800 bg-slate-900 p-4 space-y-2">
            <button onClick={() => { setCurrentTab('dashboard'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Dashboard</button>
            <button onClick={() => { setCurrentTab('vms'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Virtual Machines</button>
            <button onClick={() => { setCurrentTab('create-vm'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Create VM Wizard</button>
            <button onClick={() => { setCurrentTab('hosts'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Host Nodes</button>
            <button onClick={() => { setCurrentTab('jobs'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Jobs & Audit Logs</button>
            <button onClick={() => { setCurrentTab('docs'); setMobileMenuOpen(false); }} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800">Docs & Guides</button>
            <button onClick={handleLogout} className="w-full text-left px-3 py-2 rounded-lg text-xs font-medium text-rose-400 hover:bg-slate-800">Sign Out</button>
          </div>
        )}

        {/* --- MAIN CONTENT VIEWPORT --- */}
        <main className="flex-1 p-4 md:p-8 max-w-7xl w-full mx-auto space-y-6">
          
          {/* Toast Notification */}
          {toast && (
            <div className={`fixed top-4 right-4 z-50 flex items-center gap-3 rounded-xl px-4 py-3 text-xs font-medium shadow-2xl backdrop-blur-md ${
              toast.type === 'success' ? 'bg-emerald-500/90 text-slate-950' : 
              toast.type === 'warning' ? 'bg-amber-500/90 text-slate-950' : 'bg-rose-500/90 text-white'
            }`}>
              {toast.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              <span>{toast.message}</span>
            </div>
          )}

          {/* --- TAB: DASHBOARD --- */}
          {currentTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Infrastructure Overview</h1>
                  <p className="text-xs md:text-sm text-slate-400">Managing virtual machines on private KVM hypervisors.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setCurrentTab('create-vm')}
                    className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition"
                  >
                    <Plus className="h-4 w-4" /> Create New VM
                  </button>
                </div>
              </div>

              {/* Summary Metric Cards */}
              {isCriticalThresholdExceeded && (
                <div className="rounded-2xl border border-rose-500/40 bg-rose-500/15 p-4 md:p-5 flex items-center justify-between gap-3 shadow-lg animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white shrink-0 shadow-md">
                      <AlertTriangle className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs md:text-sm font-bold text-rose-300">CRITICAL THRESHOLD: High Resource Utilization (&gt;85%)</h4>
                      <p className="text-[11px] md:text-xs text-rose-200/90 mt-0.5">
                        {cpuUsed > 85 ? `CPU usage is at ${cpuUsed}%` : ''}
                        {cpuUsed > 85 && ramUsedPercent > 85 ? ' · ' : ''}
                        {ramUsedPercent > 85 ? `RAM usage is at ${ramUsedPercent.toFixed(1)}%` : ''}. Immediate action required.
                      </p>
                    </div>
                  </div>
                  <span className="hidden sm:inline-flex px-3 py-1 rounded-full text-xs font-bold bg-rose-600 text-white uppercase tracking-wider shrink-0">
                    &gt;85% Warning
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <span className="text-xs text-slate-400 font-medium">Total Active VMs</span>
                  <p className="mt-2 text-2xl md:text-3xl font-bold font-mono tabular-nums text-white">{summary.total_vms}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <span className="text-xs text-emerald-400 font-medium flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Running</span>
                  <p className="mt-2 text-2xl md:text-3xl font-bold font-mono tabular-nums text-white">{summary.running_vms}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <span className="text-xs text-slate-400 font-medium flex items-center gap-1.5"><Square className="h-3.5 w-3.5" /> Stopped</span>
                  <p className="mt-2 text-2xl md:text-3xl font-bold font-mono tabular-nums text-white">{summary.stopped_vms}</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
                  <span className="text-xs text-amber-400 font-medium flex items-center gap-1.5"><RotateCw className="h-3.5 w-3.5" /> Provisioning</span>
                  <p className="mt-2 text-2xl md:text-3xl font-bold font-mono tabular-nums text-white">{summary.provisioning_vms}</p>
                </div>
              </div>

              {/* Host Status Card */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-blue-400">
                      <Server className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-white">{host?.name || 'No Host Connected'}</h2>
                      <p className="text-xs font-mono text-slate-400">{host?.address || 'Offline'} · Agent v{host?.agent_version || '1.0.0'}</p>
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium tabular-nums ${
                    host?.status === 'online' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    ● {host?.status ? host.status.toUpperCase() : 'OFFLINE'}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>CPU Utilization</span>
                      <span className="font-mono text-white">{cpuUsed}% / {host?.cpu_total || 16} Cores</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${cpuUsed > 85 ? 'bg-rose-500 animate-pulse' : 'bg-blue-500'}`} style={{ width: `${cpuUsed}%` }} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>RAM Allocation</span>
                      <span className="font-mono text-white">{(ramMb / 1024).toFixed(1)} GB / {((ramTotal || 65536) / 1024).toFixed(0)} GB</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full ${ramUsedPercent > 85 ? 'bg-rose-500 animate-pulse' : 'bg-indigo-500'}`} style={{ width: `${ramUsedPercent}%` }} />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>Storage Capacity</span>
                      <span className="font-mono text-white">{host?.storage_used_gb || 0} GB / {host?.storage_total_gb || 1000} GB</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${((host?.storage_used_gb || 0) / (host?.storage_total_gb || 1000)) * 100}%` }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Recent VMs Preview */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">Active Virtual Machines</h3>
                  <button onClick={() => setCurrentTab('vms')} className="text-xs font-medium text-blue-400 hover:underline flex items-center gap-1">
                    View all <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-3">
                  {vms.filter(v => v.status !== 'deleted').slice(0, 4).map(vm => (
                    <div
                      key={vm.id}
                      onClick={() => openVmDetail(vm.id)}
                      className="flex items-center justify-between p-4 rounded-xl border border-slate-800 bg-slate-950/50 hover:bg-slate-800/50 cursor-pointer transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-blue-400">
                          <Cpu className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{vm.name}</p>
                          <p className="text-xs text-slate-400 font-mono">{vm.hostname} · {vm.vcpu} vCPU · {vm.ram_mb / 1024} GB RAM</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {renderStatusBadge(vm.status)}
                        <span className="font-mono text-xs text-slate-400 hidden sm:inline">{vm.ip_address || 'Assigning IP...'}</span>
                      </div>
                    </div>
                  ))}
                  {vms.filter(v => v.status !== 'deleted').length === 0 && (
                    <p className="text-xs text-slate-400 py-6 text-center">No virtual machines configured yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* --- TAB: VIRTUAL MACHINES LIST --- */}
          {currentTab === 'vms' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Virtual Machines</h1>
                  <p className="text-xs md:text-sm text-slate-400">Manage VPS lifecycles, network assignment, and SSH credentials.</p>
                </div>
                <button
                  onClick={() => setCurrentTab('create-vm')}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition"
                >
                  <Plus className="h-4 w-4" /> Create VM
                </button>
              </div>

              {/* Filters & Search */}
              <div className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search by name, hostname, or IP address..."
                    className="w-full rounded-xl border border-slate-800 bg-slate-900/60 pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                
                {/* Touch-Friendly Status Filter Buttons */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: 'All VMs' },
                    { id: 'running', label: 'Running' },
                    { id: 'stopped', label: 'Stopped' },
                    { id: 'provisioning', label: 'Provisioning' },
                    { id: 'failed', label: 'Failed' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setStatusFilter(tab.id)}
                      className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                        statusFilter === tab.id 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'bg-slate-900/60 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* VMs Grid / List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {vms
                  .filter(v => v.status !== 'deleted')
                  .filter(v => {
                    if (statusFilter !== 'all' && v.status !== statusFilter) return false;
                    if (searchQuery) {
                      const q = searchQuery.toLowerCase();
                      return v.name.toLowerCase().includes(q) || v.hostname.toLowerCase().includes(q) || (v.ip_address && v.ip_address.includes(q));
                    }
                    return true;
                  })
                  .map(vm => (
                    <div
                      key={vm.id}
                      className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4 hover:border-slate-700 transition"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 cursor-pointer" onClick={() => openVmDetail(vm.id)}>
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-blue-400">
                            <Cpu className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-semibold text-white hover:text-blue-400 transition">{vm.name}</h3>
                            <p className="text-xs font-mono text-slate-400">{vm.hostname}</p>
                          </div>
                        </div>
                        {renderStatusBadge(vm.status)}
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800/80 text-xs">
                        <div>
                          <span className="text-slate-400 block">vCPU / RAM</span>
                          <span className="font-mono font-medium text-white">{vm.vcpu} vCPU / {vm.ram_mb / 1024} GB</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Disk</span>
                          <span className="font-mono font-medium text-white">{vm.disk_gb} GB SSD</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">IP Address</span>
                          <span className="font-mono font-medium text-emerald-400">{vm.ip_address || 'Pending'}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <div className="flex items-center gap-2">
                          {vm.status === 'stopped' && (
                            <button
                              onClick={() => triggerVmAction(vm.id, 'start')}
                              className="flex items-center gap-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition"
                            >
                              <Play className="h-3 w-3" /> Start
                            </button>
                          )}
                          {vm.status === 'running' && (
                            <>
                              <button
                                onClick={() => triggerVmAction(vm.id, 'stop')}
                                className="flex items-center gap-1.5 rounded-lg bg-amber-600/20 border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-600/30 transition"
                              >
                                <Square className="h-3 w-3" /> Stop
                              </button>
                              <button
                                onClick={() => triggerVmAction(vm.id, 'reboot')}
                                className="flex items-center gap-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/30 transition"
                              >
                                <RotateCw className="h-3 w-3" /> Reboot
                              </button>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => openVmDetail(vm.id)}
                          className="flex items-center gap-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                        >
                          Manage <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* --- TAB: CREATE VM WIZARD --- */}
          {currentTab === 'create-vm' && (
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Create Virtual Machine</h1>
                <p className="text-xs md:text-sm text-slate-400">Configure VPS compute resources, allowlisted OS image, and SSH access.</p>
              </div>

              <form onSubmit={handleCreateVm} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8 space-y-6">
                <div>
                  <label className="block text-xs font-medium text-slate-300">VM Name (Identifier)</label>
                  <input
                    type="text"
                    required
                    value={vmForm.name}
                    onChange={e => setVmForm({ ...vmForm, name: e.target.value })}
                    placeholder="e.g. prod-db-node"
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Hostname</label>
                  <input
                    type="text"
                    required
                    value={vmForm.hostname}
                    onChange={e => setVmForm({ ...vmForm, hostname: e.target.value })}
                    placeholder="e.g. db01.internal"
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">Operating System Image</label>
                  <select
                    value={vmForm.os_image}
                    onChange={e => setVmForm({ ...vmForm, os_image: e.target.value })}
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none"
                  >
                    {osAllowlist.map(img => (
                      <option key={img.id} value={img.id}>{img.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300">vCPU Cores</label>
                    <select
                      value={vmForm.vcpu}
                      onChange={e => setVmForm({ ...vmForm, vcpu: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none tabular-nums"
                    >
                      <option value={1}>1 vCPU</option>
                      <option value={2}>2 vCPUs</option>
                      <option value={4}>4 vCPUs</option>
                      <option value={8}>8 vCPUs</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">RAM (MB)</label>
                    <select
                      value={vmForm.ram_mb}
                      onChange={e => setVmForm({ ...vmForm, ram_mb: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none tabular-nums"
                    >
                      <option value={2048}>2048 MB (2 GB)</option>
                      <option value={4096}>4096 MB (4 GB)</option>
                      <option value={8192}>8192 MB (8 GB)</option>
                      <option value={16384}>16384 MB (16 GB)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-300">SSD Disk (GB)</label>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={vmForm.disk_gb}
                      onChange={e => setVmForm({ ...vmForm, disk_gb: Number(e.target.value) })}
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs text-white focus:border-blue-500 focus:outline-none tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300">SSH Public Key (Required)</label>
                  <textarea
                    rows={3}
                    required
                    value={vmForm.ssh_public_key}
                    onChange={e => setVmForm({ ...vmForm, ssh_public_key: e.target.value })}
                    placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI..."
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs font-mono text-white placeholder-slate-600 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Only public SSH keys are stored. Private keys are never requested or stored.</p>
                </div>

                <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setCurrentTab('vms')}
                    className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creatingVm}
                    className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-500 transition disabled:opacity-50"
                  >
                    {creatingVm ? 'Queueing Provisioning...' : 'Provision Virtual Machine'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* --- TAB: VM DETAILS --- */}
          {currentTab === 'vm-detail' && selectedVmDetail && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <button onClick={() => setCurrentTab('vms')} className="text-xs text-blue-400 hover:underline mb-2 flex items-center gap-1">
                    ← Back to Virtual Machines
                  </button>
                  <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white flex items-center gap-3">
                    {selectedVmDetail.vm.name}
                    {renderStatusBadge(selectedVmDetail.vm.status)}
                  </h1>
                </div>
                <div className="flex items-center gap-2">
                  {selectedVmDetail.vm.status === 'stopped' && (
                    <button
                      onClick={() => triggerVmAction(selectedVmDetail.vm.id, 'start')}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 px-3.5 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-600/30 transition"
                    >
                      <Play className="h-3.5 w-3.5" /> Start
                    </button>
                  )}
                  {selectedVmDetail.vm.status === 'running' && (
                    <>
                      <button
                        onClick={() => triggerVmAction(selectedVmDetail.vm.id, 'stop')}
                        className="flex items-center gap-1.5 rounded-xl bg-amber-600/20 border border-amber-500/30 px-3.5 py-2 text-xs font-medium text-amber-400 hover:bg-amber-600/30 transition"
                      >
                        <Square className="h-3.5 w-3.5" /> Stop
                      </button>
                      <button
                        onClick={() => triggerVmAction(selectedVmDetail.vm.id, 'reboot')}
                        className="flex items-center gap-1.5 rounded-xl bg-blue-600/20 border border-blue-500/30 px-3.5 py-2 text-xs font-medium text-blue-400 hover:bg-blue-600/30 transition"
                      >
                        <RotateCw className="h-3.5 w-3.5" /> Reboot
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => triggerVmAction(selectedVmDetail.vm.id, 'delete')}
                    className="flex items-center gap-1.5 rounded-xl bg-rose-600/20 border border-rose-500/30 px-3.5 py-2 text-xs font-medium text-rose-400 hover:bg-rose-600/30 transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>

              {/* VM Specs & Connection Card */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Compute & Storage Configuration</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">Hostname</span>
                      <span className="font-mono text-white">{selectedVmDetail.vm.hostname}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">OS Image</span>
                      <span className="font-mono text-white">{selectedVmDetail.vm.os_image}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">vCPU Allocation</span>
                      <span className="font-mono text-white tabular-nums">{selectedVmDetail.vm.vcpu} vCPUs</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">RAM Memory</span>
                      <span className="font-mono text-white tabular-nums">{selectedVmDetail.vm.ram_mb / 1024} GB</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-400">SSD Disk</span>
                      <span className="font-mono text-white tabular-nums">{selectedVmDetail.vm.disk_gb} GB</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">Network & Access</h3>
                  <div className="space-y-3 text-xs">
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">Assigned IP (Private/NAT)</span>
                      <span className="font-mono text-emerald-400">{selectedVmDetail.vm.ip_address || 'Assigning IP...'}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-800/80">
                      <span className="text-slate-400">Hypervisor Host</span>
                      <span className="font-mono text-white">{selectedVmDetail.host?.name || 'host-node-01'}</span>
                    </div>
                    <div className="pt-2">
                      <span className="text-slate-400 block mb-1">Quick SSH Command</span>
                      <div className="flex items-center gap-2 rounded-xl bg-slate-950 p-3 font-mono text-xs text-slate-300">
                        <span className="truncate">ssh ubuntu@{selectedVmDetail.vm.ip_address || '<IP>'}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`ssh ubuntu@${selectedVmDetail.vm.ip_address || '10.0.0.15'}`);
                            showToast('SSH command copied to clipboard');
                          }}
                          className="p-1.5 rounded-lg bg-slate-800 text-white hover:bg-slate-700 shrink-0"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Event & Job History */}
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-white">Operation & Job History</h3>
                <div className="space-y-2">
                  {selectedVmDetail.jobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-3">
                        <Terminal className="h-4 w-4 text-blue-400" />
                        <div>
                          <span className="font-semibold text-white uppercase">{job.type}</span>
                          <span className="text-slate-400 ml-2 font-mono">{new Date(job.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-0.5 rounded-full font-medium tabular-nums ${
                        job.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' :
                        job.status === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {job.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- TAB: HOSTS --- */}
          {currentTab === 'hosts' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Physical Compute Hosts</h1>
                <p className="text-xs md:text-sm text-slate-400">Registered KVM hypervisors running the Ace.cloud node agent.</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {hosts.map(h => (
                  <div key={h.id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-blue-400">
                          <Server className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="text-sm font-semibold text-white">{h.name}</h3>
                          <p className="text-xs font-mono text-slate-400">{h.address} · Agent v{h.agent_version}</p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tabular-nums">
                        ● ONLINE
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 text-xs">
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <span className="text-slate-400">Total vCPU Cores</span>
                        <p className="mt-1 text-base font-bold font-mono text-white tabular-nums">{h.cpu_total}</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <span className="text-slate-400">Total RAM Memory</span>
                        <p className="mt-1 text-base font-bold font-mono text-white tabular-nums">{h.ram_total_mb / 1024} GB</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <span className="text-slate-400">Storage Capacity</span>
                        <p className="mt-1 text-base font-bold font-mono text-white tabular-nums">{h.storage_total_gb} GB</p>
                      </div>
                      <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-3">
                        <span className="text-slate-400">Running VMs</span>
                        <p className="mt-1 text-base font-bold font-mono text-white tabular-nums">{h.running_vms_count}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400">Maintenance Mode:</span>
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${h.maintenance_mode ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-slate-800 text-slate-400'}`}>
                          {h.maintenance_mode ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </div>
                      <button
                        onClick={() => toggleMaintenanceMode(h.id, !!h.maintenance_mode)}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                          h.maintenance_mode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30'
                        }`}
                      >
                        {h.maintenance_mode ? 'Disable Maintenance Mode' : 'Enable Maintenance Mode'}
                      </button>
                    </div>

                    {h.maintenance_mode && (
                      <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-3">
                        <div className="flex items-center gap-2 text-amber-400 text-xs font-semibold">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>Host is in Maintenance Mode — New VM scheduling is prevented. Existing VMs below should be migrated:</span>
                        </div>
                        <div className="space-y-2">
                          {vms.filter(v => v.host_id === h.id && v.status !== 'deleted').map(vm => (
                            <div key={vm.id} className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-lg text-xs">
                              <div className="flex items-center gap-2">
                                <Cpu className="h-3.5 w-3.5 text-blue-400" />
                                <span className="font-semibold text-white">{vm.name}</span>
                                <span className="text-slate-400 font-mono">({vm.ip_address || 'No IP'})</span>
                              </div>
                              <button
                                onClick={() => openVmDetail(vm.id)}
                                className="text-blue-400 hover:underline font-medium"
                              >
                                Inspect / Migrate →
                              </button>
                            </div>
                          ))}
                          {vms.filter(v => v.host_id === h.id && v.status !== 'deleted').length === 0 && (
                            <p className="text-xs text-slate-400 italic">No active VMs currently running on this host.</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- TAB: JOBS & AUDIT LOGS --- */}
          {currentTab === 'jobs' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Jobs & Audit Trail</h1>
                <p className="text-xs md:text-sm text-slate-400">Immutable audit logs and background asynchronous operation queue.</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-white">Recent Background Jobs</h3>
                <div className="space-y-2">
                  {jobs.map(job => (
                    <div key={job.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-3">
                        <Terminal className="h-4 w-4 text-blue-400" />
                        <div>
                          <span className="font-semibold text-white uppercase">{job.type}</span>
                          <span className="text-slate-400 ml-3 font-mono">{new Date(job.created_at).toLocaleString()}</span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full font-medium tabular-nums ${
                        job.status === 'succeeded' ? 'bg-emerald-500/10 text-emerald-400' :
                        job.status === 'failed' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'
                      }`}>
                        {job.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 space-y-4">
                <h3 className="text-sm font-semibold text-white">Security & Audit Events</h3>
                <div className="space-y-2">
                  {dashboardData?.recent_activity?.map((act: AuditEvent) => (
                    <div key={act.id} className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-slate-800/80 text-xs">
                      <div className="flex items-center gap-3">
                        <Shield className="h-4 w-4 text-indigo-400" />
                        <div>
                          <span className="font-semibold text-white">{act.action}</span>
                          <span className="text-slate-400 ml-2">({act.user_email})</span>
                          <p className="text-slate-300 mt-0.5">{act.details}</p>
                        </div>
                      </div>
                      <span className="font-mono text-slate-500">{new Date(act.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* --- TAB: DOCS & GUIDES --- */}
          {currentTab === 'docs' && (
            <div className="max-w-3xl mx-auto space-y-6">
              <div>
                <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">Documentation & Phone Setup</h1>
                <p className="text-xs md:text-sm text-slate-400">Deployment guides, phone PWA setup, and threat model architecture.</p>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:p-8 space-y-6 text-xs md:text-sm text-slate-300 leading-relaxed">
                <h3 className="text-base font-semibold text-white">Phone-First VM Management</h3>
                <p>
                  Ace.cloud is engineered for mobile browser access. You can monitor hosts, queue VM creation, start, stop, reboot, and inspect logs directly from your iPhone or Android phone.
                </p>

                <h4 className="text-sm font-semibold text-white pt-2">Installing as a Progressive Web App (PWA)</h4>
                <ol className="list-decimal pl-5 space-y-2 text-slate-300">
                  <li>Open Ace.cloud in Safari (iOS) or Chrome (Android).</li>
                  <li>Tap the <strong>Install App</strong> button in the top navigation bar.</li>
                  <li>On iPhone, tap the Share icon and select <strong>Add to Home Screen</strong>.</li>
                </ol>

                <h4 className="text-sm font-semibold text-white pt-2">Security & Host Requirements</h4>
                <p>
                  The control plane backend communicates securely with the Python node agent running on your KVM hypervisor host via outbound HTTPS. Private/NAT networking is configured by default.
                </p>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* --- CONFIRMATION MODAL --- */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-semibold text-white">{confirmModal.title}</h3>
            <p className="text-xs md:text-sm text-slate-300 leading-relaxed">{confirmModal.message}</p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setConfirmModal(null)}
                className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmModal.onConfirm}
                className={`rounded-xl px-5 py-2.5 text-xs font-semibold text-white shadow-lg transition ${
                  confirmModal.isDestructive ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-600/20'
                }`}
              >
                {confirmModal.actionName}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
