# Simone Cloud — Private Cloud VM Control Panel

Simone Cloud is a secure, polished, mobile-first web application and control plane for managing virtual machines running on your own physical Linux servers using KVM/QEMU and libvirt.

## Features & Architecture

- **Control Plane**: React + TypeScript frontend with dark navy/slate aesthetics, mobile-first touch optimization, offline connectivity indicator, and PWA installability.
- **Backend API**: Express + TypeScript backend with secure HttpOnly SameSite cookie sessions, Argon2/bcrypt password hashing, CSRF protection, rate limiting, and robust audit logging.
- **Node Agent**: Python background agent package running on physical hypervisors, communicating via outbound HTTPS heartbeat and job polling.
- **Mock Demo Mode**: Fully interactive out-of-the-box demo mode allowing administrators to test VM creation, starting, stopping, rebooting, and deletion without requiring a physical KVM host.

---

## Phone Setup & PWA Installation

Simone Cloud is designed with mobile-first ergonomics for phone browsers:
1. Open the Simone Cloud URL in your mobile browser (Safari on iOS or Chrome on Android).
2. Tap the **Install App** button in the header or navigation menu.
3. On iOS Safari, tap the Share icon and select **Add to Home Screen**.
4. Launch Simone Cloud from your phone home screen as a standalone Progressive Web App (PWA).

*Note: Installing the PWA turns your phone into a remote control panel; virtual machines continue running on your registered physical Linux hypervisor servers.*

---

## Local Development & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Start Development Server**:
   ```bash
   npm run dev
   ```
3. **Sign In**:
   - Default Admin Email: `admin@simone.cloud`
   - Default Password: `adminpassword123`

---

## Security Guidance & Threat Model

- **No Direct Host Access**: The browser never connects directly to libvirt, SSH, or root host accounts. All actions go through authenticated backend API endpoints and secure job queues.
- **SSH Public Keys Only**: Only SSH public keys are stored and injected via cloud-init. Private keys are never requested, stored, or exposed.
- **Session Security**: Browser sessions use secure HttpOnly, SameSite cookies.
- **Audit Trail**: Every login, VM creation, lifecycle action, and deletion is recorded in the immutable audit event log.

---

## API Examples (cURL)

### 1. Sign In
```bash
curl -X POST https://your-app-url.run.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@simone.cloud", "password": "adminpassword123"}' \
  -c cookies.txt
```

### 2. Get VMs
```bash
curl -X GET https://your-app-url.run.app/api/vms \
  -b cookies.txt
```

### 3. Create VM
```bash
curl -X POST https://your-app-url.run.app/api/vms \
  -H "Content-Type: application/json" \
  -b cookies.txt \
  -d '{
    "name": "web-vps-01",
    "hostname": "web01.internal",
    "os_image": "ubuntu-24.04-lts",
    "vcpu": 2,
    "ram_mb": 4096,
    "disk_gb": 40,
    "ssh_public_key": "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExample..."
  }'
```
