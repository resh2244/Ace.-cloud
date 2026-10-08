import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import path from 'path';
import fs from 'fs';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: true,
  credentials: true,
}));

// Data file path
const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'simone.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  role: string;
  created_at: string;
}

interface Host {
  id: string;
  name: string;
  address: string;
  status: 'online' | 'offline' | 'maintenance';
  maintenance_mode: boolean;
  agent_version: string;
  cpu_total: number; // cores
  ram_total_mb: number;
  storage_total_gb: number;
  cpu_used_percent: number;
  ram_used_mb: number;
  storage_used_gb: number;
  running_vms_count: number;
  last_heartbeat: string;
  created_at: string;
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

interface Job {
  id: string;
  type: 'create_vm' | 'start_vm' | 'stop_vm' | 'reboot_vm' | 'delete_vm';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  vm_id: string | null;
  host_id: string;
  payload: any;
  error_message: string | null;
  retry_count: number;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
}

interface AuditEvent {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  details: string;
  ip_address: string;
  created_at: string;
}

interface DB {
  users: User[];
  hosts: Host[];
  vms: VM[];
  jobs: Job[];
  audit_events: AuditEvent[];
  enrollment_tokens: { token_hash: string; expires_at: string }[];
  sessions: { token: string; user_id: string; expires_at: string }[];
}

// Initial DB state
const defaultDb: DB = {
  users: [
    {
      id: 'usr-admin-1',
      email: 'admin@simone.cloud',
      password_hash: bcrypt.hashSync('adminpassword123', 10),
      role: 'admin',
      created_at: new Date().toISOString(),
    },
  ],
  hosts: [
    {
      id: 'host-node-01',
      name: 'hypervisor-01.local',
      address: '192.168.1.100',
      status: 'online',
      maintenance_mode: false,
      agent_version: '1.0.0',
      cpu_total: 16,
      ram_total_mb: 65536,
      storage_total_gb: 1000,
      cpu_used_percent: 24.5,
      ram_used_mb: 16384,
      storage_used_gb: 210,
      running_vms_count: 2,
      last_heartbeat: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },
  ],
  vms: [
    {
      id: 'vm-sample-01',
      name: 'prod-api-vps',
      hostname: 'api.simone.local',
      os_image: 'ubuntu-24.04-lts',
      status: 'running',
      vcpu: 2,
      ram_mb: 4096,
      disk_gb: 50,
      host_id: 'host-node-01',
      ip_address: '10.0.0.15',
      network_mode: 'private_nat',
      ssh_public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG... demo@simone',
      created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'vm-sample-02',
      name: 'redis-cache-vps',
      hostname: 'cache.simone.local',
      os_image: 'debian-12',
      status: 'running',
      vcpu: 1,
      ram_mb: 2048,
      disk_gb: 20,
      host_id: 'host-node-01',
      ip_address: '10.0.0.16',
      network_mode: 'private_nat',
      ssh_public_key: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIG... demo@simone',
      created_at: new Date(Date.now() - 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    },
  ],
  jobs: [],
  audit_events: [
    {
      id: 'aud-1',
      user_email: 'admin@simone.cloud',
      action: 'SYSTEM_START',
      resource_type: 'system',
      resource_id: null,
      details: 'Simone Cloud backend control plane initialized.',
      ip_address: '127.0.0.1',
      created_at: new Date().toISOString(),
    }
  ],
  enrollment_tokens: [],
  sessions: [],
};

function readDb(): DB {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('Error reading DB file:', e);
  }
  writeDb(defaultDb);
  return defaultDb;
}

function writeDb(db: DB) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error('Error writing DB file:', e);
  }
}

// Helper to log audit events
function audit(userEmail: string, action: string, resourceType: string, resourceId: string | null, details: string, ip: string) {
  const db = readDb();
  db.audit_events.unshift({
    id: `aud-${randomUUID().slice(0, 8)}`,
    user_email: userEmail,
    action,
    resource_type: resourceType,
    resource_id: resourceId,
    details,
    ip_address: ip,
    created_at: new Date().toISOString(),
  });
  if (db.audit_events.length > 200) db.audit_events.pop();
  writeDb(db);
}

// Auth Middleware
function requireAuth(req: any, res: any, next: any) {
  const sessionToken = req.cookies?.simone_session;
  if (!sessionToken) {
    return res.status(401).json({ error: 'Unauthorized: No active session' });
  }

  const db = readDb();
  const session = db.sessions.find(s => s.token === sessionToken);
  if (!session || new Date(session.expires_at) < new Date()) {
    return res.status(401).json({ error: 'Unauthorized: Session expired or invalid' });
  }

  const user = db.users.find(u => u.id === session.user_id);
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized: User not found' });
  }

  req.user = user;
  next();
}

// Allowed OS images allowlist
const ALLOWED_OS_IMAGES = [
  { id: 'ubuntu-24.04-lts', name: 'Ubuntu 24.04 LTS (Noble Numbat)', family: 'ubuntu' },
  { id: 'ubuntu-22.04-lts', name: 'Ubuntu 22.04 LTS (Jammy Jellyfish)', family: 'ubuntu' },
  { id: 'debian-12', name: 'Debian 12 (Bookworm)', family: 'debian' },
  { id: 'alpine-3.20', name: 'Alpine Linux 3.20', family: 'alpine' },
  { id: 'rocky-9', name: 'Rocky Linux 9', family: 'rhel' },
];

// --- API ROUTES ---

// Health Check
app.get('/api/health', (req, res) => {
  const db = readDb();
  const onlineHosts = db.hosts.filter(h => h.status === 'online').length;
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    hosts_online: onlineHosts,
    total_hosts: db.hosts.length,
    total_vms: db.vms.filter(v => v.status !== 'deleted').length,
  });
});

// Auth Register
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = readDb();
  const existing = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(400).json({ error: 'User with this email already exists' });
  }

  const userId = `usr-${randomUUID().slice(0, 8)}`;
  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser: User = {
    id: userId,
    email: email.toLowerCase(),
    password_hash: passwordHash,
    role: db.users.length === 0 ? 'admin' : 'member',
    created_at: new Date().toISOString(),
  };

  db.users.push(newUser);

  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString();
  db.sessions.push({
    token: sessionToken,
    user_id: newUser.id,
    expires_at: expiresAt,
  });
  writeDb(db);

  audit(newUser.email, 'USER_REGISTER', 'user', userId, 'New user account created and signed in', req.ip || 'unknown');

  res.cookie('simone_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000,
  });

  res.json({
    success: true,
    user: {
      id: newUser.id,
      email: newUser.email,
      role: newUser.role,
    },
  });
});

// Auth Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    audit(email, 'LOGIN_FAILED', 'user', null, 'Invalid credentials provided', req.ip || 'unknown');
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const sessionToken = randomUUID();
  const expiresAt = new Date(Date.now() + 8 * 3600 * 1000).toISOString(); // 8 hours
  db.sessions.push({
    token: sessionToken,
    user_id: user.id,
    expires_at: expiresAt,
  });
  writeDb(db);

  audit(user.email, 'LOGIN_SUCCESS', 'user', user.id, 'Admin signed in successfully', req.ip || 'unknown');

  res.cookie('simone_session', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 8 * 3600 * 1000,
  });

  res.json({
    success: true,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });
});

// Auth Logout
app.post('/api/auth/logout', requireAuth, (req: any, res) => {
  const sessionToken = req.cookies?.simone_session;
  const db = readDb();
  db.sessions = db.sessions.filter(s => s.token !== sessionToken);
  writeDb(db);

  audit(req.user.email, 'LOGOUT', 'user', req.user.id, 'User signed out', req.ip || 'unknown');

  res.clearCookie('simone_session');
  res.json({ success: true });
});

// Get Current User
app.get('/api/auth/me', requireAuth, (req: any, res) => {
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Dashboard Overview
app.get('/api/dashboard', requireAuth, (req: any, res) => {
  const db = readDb();
  const activeVMs = db.vms.filter(v => v.status !== 'deleted');
  const runningVMs = activeVMs.filter(v => v.status === 'running').length;
  const stoppedVMs = activeVMs.filter(v => v.status === 'stopped').length;
  const provisioningVMs = activeVMs.filter(v => v.status === 'provisioning' || v.status === 'queued').length;
  const failedVMs = activeVMs.filter(v => v.status === 'failed').length;

  const host = db.hosts[0] || null;
  const recentJobs = db.jobs.slice(0, 10);
  const failedJobsCount = db.jobs.filter(j => j.status === 'failed').length;

  res.json({
    summary: {
      total_vms: activeVMs.length,
      running_vms: runningVMs,
      stopped_vms: stoppedVMs,
      provisioning_vms: provisioningVMs,
      failed_vms: failedVMs,
      failed_jobs_count: failedJobsCount,
    },
    host: host ? {
      id: host.id,
      name: host.name,
      address: host.address,
      status: host.status,
      agent_version: host.agent_version,
      cpu_total: host.cpu_total,
      ram_total_mb: host.ram_total_mb,
      storage_total_gb: host.storage_total_gb,
      cpu_used_percent: host.cpu_used_percent,
      ram_used_mb: host.ram_used_mb,
      storage_used_gb: host.storage_used_gb,
      running_vms_count: host.running_vms_count,
      last_heartbeat: host.last_heartbeat,
    } : null,
    recent_activity: db.audit_events.slice(0, 15),
    recent_jobs: recentJobs,
  });
});

// Get VMs
app.get('/api/vms', requireAuth, (req: any, res) => {
  const { search, status, os } = req.query;
  const db = readDb();
  let vms = db.vms.filter(v => v.status !== 'deleted');

  if (search) {
    const q = (search as string).toLowerCase();
    vms = vms.filter(v => v.name.toLowerCase().includes(q) || v.hostname.toLowerCase().includes(q) || (v.ip_address && v.ip_address.includes(q)));
  }
  if (status && status !== 'all') {
    vms = vms.filter(v => v.status === status);
  }
  if (os && os !== 'all') {
    vms = vms.filter(v => v.os_image === os);
  }

  res.json({
    vms,
    os_allowlist: ALLOWED_OS_IMAGES,
  });
});

// Create VM
app.post('/api/vms', requireAuth, (req: any, res) => {
  const { name, hostname, os_image, vcpu, ram_mb, disk_gb, ssh_public_key, idempotency_key } = req.body;

  if (!name || !hostname || !os_image || !vcpu || !ram_mb || !disk_gb || !ssh_public_key) {
    return res.status(400).json({ error: 'All VM configuration fields are required' });
  }

  // Validate OS Image
  if (!ALLOWED_OS_IMAGES.some(img => img.id === os_image)) {
    return res.status(400).json({ error: 'Invalid or unallowed OS image' });
  }

  // Validate SSH Public Key
  const trimmedKey = ssh_public_key.trim();
  if (!trimmedKey.startsWith('ssh-') && !trimmedKey.startsWith('ecdsa-')) {
    return res.status(400).json({ error: 'Invalid SSH public key format. Must start with ssh-rsa, ssh-ed25519, etc.' });
  }

  const db = readDb();

  // Check Idempotency Key
  if (idempotency_key) {
    const existingJob = db.jobs.find(j => j.idempotency_key === idempotency_key);
    if (existingJob) {
      return res.status(200).json({
        message: 'Duplicate request intercepted via idempotency key',
        job_id: existingJob.id,
        vm_id: existingJob.vm_id,
      });
    }
  }

  const host = db.hosts.find(h => h.status === 'online' && !h.maintenance_mode);
  if (!host) {
    return res.status(400).json({ error: 'No available online compute hosts (hosts may be offline or in maintenance mode)' });
  }

  // Check Capacity limits
  if (vcpu > host.cpu_total || ram_mb > (host.ram_total_mb - host.ram_used_mb)) {
    return res.status(400).json({ error: 'Insufficient host capacity for requested vCPU or RAM' });
  }

  const vmId = `vm-${randomUUID().slice(0, 8)}`;
  const jobId = `job-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const newVm: VM = {
    id: vmId,
    name,
    hostname,
    os_image,
    status: 'queued',
    vcpu: Number(vcpu),
    ram_mb: Number(ram_mb),
    disk_gb: Number(disk_gb),
    host_id: host.id,
    ip_address: null,
    network_mode: 'private_nat',
    ssh_public_key: trimmedKey,
    created_at: now,
    updated_at: now,
  };

  const newJob: Job = {
    id: jobId,
    type: 'create_vm',
    status: 'queued',
    vm_id: vmId,
    host_id: host.id,
    payload: newVm,
    error_message: null,
    retry_count: 0,
    idempotency_key: idempotency_key || null,
    created_at: now,
    updated_at: now,
  };

  db.vms.push(newVm);
  db.jobs.unshift(newJob);
  writeDb(db);

  audit(req.user.email, 'VM_CREATE_REQUEST', 'vm', vmId, `Requested creation of VM ${name} (${os_image})`, req.ip || 'unknown');

  res.status(201).json({
    success: true,
    vm: newVm,
    job_id: jobId,
  });
});

// Get VM by ID
app.get('/api/vms/:vm_id', requireAuth, (req: any, res) => {
  const { vm_id } = req.params;
  const db = readDb();
  const vm = db.vms.find(v => v.id === vm_id);
  if (!vm) {
    return res.status(404).json({ error: 'Virtual machine not found' });
  }

  const host = db.hosts.find(h => h.id === vm.host_id);
  const vmJobs = db.jobs.filter(j => j.vm_id === vm_id);

  res.json({
    vm,
    host: host ? { name: host.name, address: host.address, status: host.status } : null,
    jobs: vmJobs,
  });
});

// Lifecycle action helper
function queueVmAction(req: any, res: any, vmId: string, action: 'start_vm' | 'stop_vm' | 'reboot_vm' | 'delete_vm') {
  const db = readDb();
  const vm = db.vms.find(v => v.id === vmId);
  if (!vm || vm.status === 'deleted') {
    return res.status(404).json({ error: 'Virtual machine not found' });
  }

  // Validate state transitions
  if (action === 'start_vm' && vm.status !== 'stopped') {
    return res.status(400).json({ error: `Cannot start VM in status '${vm.status}'` });
  }
  if (action === 'stop_vm' && vm.status !== 'running') {
    return res.status(400).json({ error: `Cannot stop VM in status '${vm.status}'` });
  }
  if (action === 'reboot_vm' && vm.status !== 'running') {
    return res.status(400).json({ error: `Cannot reboot VM in status '${vm.status}'` });
  }
  if (action === 'delete_vm' && vm.status === 'deleting') {
    return res.status(400).json({ error: 'VM is already being deleted' });
  }

  const host = db.hosts.find(h => h.id === vm.host_id);
  if (!host || host.status !== 'online') {
    return res.status(400).json({ error: 'Assigned host is offline. Lifecycle action cannot be queued.' });
  }

  const jobId = `job-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  if (action === 'delete_vm') {
    vm.status = 'deleting';
  }

  const newJob: Job = {
    id: jobId,
    type: action,
    status: 'queued',
    vm_id: vmId,
    host_id: host.id,
    payload: { vm_id: vmId },
    error_message: null,
    retry_count: 0,
    idempotency_key: null,
    created_at: now,
    updated_at: now,
  };

  db.jobs.unshift(newJob);
  vm.updated_at = now;
  writeDb(db);

  audit(req.user.email, action.toUpperCase(), 'vm', vmId, `Queued ${action} for VM ${vm.name}`, req.ip || 'unknown');

  res.json({
    success: true,
    message: `Action ${action} queued successfully`,
    job_id: jobId,
    vm,
  });
}

app.post('/api/vms/:vm_id/start', requireAuth, (req: any, res) => {
  queueVmAction(req, res, req.params.vm_id, 'start_vm');
});

app.post('/api/vms/:vm_id/stop', requireAuth, (req: any, res) => {
  queueVmAction(req, res, req.params.vm_id, 'stop_vm');
});

app.post('/api/vms/:vm_id/reboot', requireAuth, (req: any, res) => {
  queueVmAction(req, res, req.params.vm_id, 'reboot_vm');
});

app.delete('/api/vms/:vm_id', requireAuth, (req: any, res) => {
  queueVmAction(req, res, req.params.vm_id, 'delete_vm');
});

// Jobs list
app.get('/api/jobs', requireAuth, (req: any, res) => {
  const db = readDb();
  res.json({ jobs: db.jobs });
});

app.get('/api/jobs/:job_id', requireAuth, (req: any, res) => {
  const db = readDb();
  const job = db.jobs.find(j => j.id === req.params.job_id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  res.json({ job });
});

// Hosts list
app.get('/api/hosts', requireAuth, (req: any, res) => {
  const db = readDb();
  res.json({ hosts: db.hosts });
});

// Toggle Host Maintenance Mode
app.post('/api/hosts/:host_id/maintenance', requireAuth, (req: any, res) => {
  const { host_id } = req.params;
  const { maintenance_mode } = req.body;
  const db = readDb();
  const host = db.hosts.find(h => h.id === host_id);
  if (!host) {
    return res.status(404).json({ error: 'Host not found' });
  }

  host.maintenance_mode = !!maintenance_mode;
  writeDb(db);

  audit(req.user.email, 'HOST_MAINTENANCE_TOGGLE', 'host', host_id, `Host ${host.name} maintenance mode set to ${host.maintenance_mode}`, req.ip || 'unknown');

  res.json({ success: true, host });
});

// Host Enrollment
app.post('/api/hosts/enroll', requireAuth, (req: any, res) => {
  const { name, address, agent_version, cpu_total, ram_total_mb, storage_total_gb } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'Host name and address are required' });
  }

  const db = readDb();
  const hostId = `host-${randomUUID().slice(0, 8)}`;
  const now = new Date().toISOString();

  const newHost: Host = {
    id: hostId,
    name,
    address,
    status: 'online',
    maintenance_mode: false,
    agent_version: agent_version || '1.0.0',
    cpu_total: Number(cpu_total) || 8,
    ram_total_mb: Number(ram_total_mb) || 32768,
    storage_total_gb: Number(storage_total_gb) || 500,
    cpu_used_percent: 10.0,
    ram_used_mb: 4096,
    storage_used_gb: 100,
    running_vms_count: 0,
    last_heartbeat: now,
    created_at: now,
  };

  db.hosts.push(newHost);
  writeDb(db);

  audit(req.user.email, 'HOST_ENROLL', 'host', hostId, `Enrolled physical compute host ${name} (${address})`, req.ip || 'unknown');

  res.status(201).json({
    success: true,
    host: newHost,
    agent_token: `simone-agent-secret-${randomUUID()}`,
  });
});

// --- NODE AGENT API ENDPOINTS ---

app.post('/api/agent/heartbeat', (req, res) => {
  const { host_id, agent_version, cpu_used_percent, ram_used_mb, storage_used_gb, running_vms_count } = req.body;
  if (!host_id) {
    return res.status(400).json({ error: 'host_id is required' });
  }

  const db = readDb();
  const host = db.hosts.find(h => h.id === host_id);
  if (!host) {
    return res.status(404).json({ error: 'Host not registered' });
  }

  host.status = 'online';
  host.agent_version = agent_version || host.agent_version;
  host.cpu_used_percent = cpu_used_percent ?? host.cpu_used_percent;
  host.ram_used_mb = ram_used_mb ?? host.ram_used_mb;
  host.storage_used_gb = storage_used_gb ?? host.storage_used_gb;
  host.running_vms_count = running_vms_count ?? host.running_vms_count;
  host.last_heartbeat = new Date().toISOString();

  writeDb(db);
  res.json({ success: true, acknowledged_at: host.last_heartbeat });
});

app.post('/api/agent/jobs/claim', (req, res) => {
  const { host_id } = req.body;
  if (!host_id) {
    return res.status(400).json({ error: 'host_id is required' });
  }

  const db = readDb();
  const queuedJob = db.jobs.find(j => j.host_id === host_id && j.status === 'queued');
  if (!queuedJob) {
    return res.json({ job: null });
  }

  queuedJob.status = 'running';
  queuedJob.updated_at = new Date().toISOString();
  writeDb(db);

  res.json({ job: queuedJob });
});

app.post('/api/agent/jobs/:job_id/result', (req, res) => {
  const { job_id } = req.params;
  const { status, error_message, ip_address } = req.body; // status: 'succeeded' | 'failed'

  const db = readDb();
  const job = db.jobs.find(j => j.id === job_id);
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  job.status = status;
  job.error_message = error_message || null;
  job.updated_at = new Date().toISOString();

  if (job.vm_id) {
    const vm = db.vms.find(v => v.id === job.vm_id);
    if (vm) {
      if (job.type === 'create_vm') {
        if (status === 'succeeded') {
          vm.status = 'running';
          vm.ip_address = ip_address || `10.0.0.${Math.floor(Math.random() * 200 + 20)}`;
        } else {
          vm.status = 'failed';
        }
      } else if (job.type === 'start_vm') {
        vm.status = status === 'succeeded' ? 'running' : 'stopped';
      } else if (job.type === 'stop_vm') {
        vm.status = status === 'succeeded' ? 'stopped' : 'running';
      } else if (job.type === 'reboot_vm') {
        vm.status = status === 'succeeded' ? 'running' : vm.status;
      } else if (job.type === 'delete_vm') {
        vm.status = status === 'succeeded' ? 'deleted' : 'running';
      }
      vm.updated_at = new Date().toISOString();
    }
  }

  writeDb(db);
  res.json({ success: true });
});

// --- MOCK AGENT AUTO-SIMULATOR (Demo Mode Support) ---
setInterval(() => {
  try {
    const db = readDb();
    let updated = false;

    // Process any queued jobs automatically in mock mode so the user gets realistic VM provisioning
    for (const job of db.jobs) {
      if (job.status === 'queued' || job.status === 'running') {
        job.status = 'succeeded';
        job.updated_at = new Date().toISOString();

        if (job.vm_id) {
          const vm = db.vms.find(v => v.id === job.vm_id);
          if (vm) {
            if (job.type === 'create_vm') {
              vm.status = 'running';
              vm.ip_address = `10.0.0.${Math.floor(Math.random() * 200 + 20)}`;
            } else if (job.type === 'start_vm') {
              vm.status = 'running';
            } else if (job.type === 'stop_vm') {
              vm.status = 'stopped';
            } else if (job.type === 'reboot_vm') {
              vm.status = 'running';
            } else if (job.type === 'delete_vm') {
              vm.status = 'deleted';
            }
          }
        }
        updated = true;
      }
    }

    if (updated) {
      writeDb(db);
    }
  } catch (e) {
    // ignore background simulator errors
  }
}, 3000);

// Setup Vite middleware in development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Simone Cloud control plane running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
