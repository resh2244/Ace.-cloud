# Simone Cloud Node Agent

The Simone Cloud Node Agent runs on your physical Linux hypervisor host (KVM/QEMU/libvirt). It securely polls the Simone Cloud control plane backend over outbound HTTPS, claims queued jobs, and interfaces with libvirt to manage virtual machines.

## Installation & Setup

1. Copy `.env.example` to `.env` and configure your API URL and Agent Secret.
2. Ensure Python 3.10+ and `libvirt-python` are installed.
3. Run the agent:
   ```bash
   python -m simone_agent.agent
   ```
