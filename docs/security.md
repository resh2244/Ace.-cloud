# Security & Threat Model — Simone Cloud

## 1. Threat Boundary & Isolation
- **Hypervisor Isolation**: The web browser and API backend have zero direct access to hypervisor root shells, libvirt Unix sockets, or SSH daemon ports.
- **Node Agent Outbound-Only**: Node agents communicate exclusively via outbound HTTPS POST requests to the Simone Cloud control plane API. No inbound open ports are required on the hypervisor host.
- **Credential Protection**: Password hashes use bcrypt with salt rounds. SSH private keys are never handled or stored.

## 2. Access Control & RBAC
- Single-tenant administrator sign-in for MVP.
- All protected endpoints validate active session tokens from secure HttpOnly cookies.
