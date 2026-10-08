import os
from dotenv import load_dotenv

load_dotenv()

SIMONE_API_URL = os.getenv("SIMONE_API_URL", "https://app.simone.cloud/api")
HOST_ID = os.getenv("HOST_ID", "host-node-01")
AGENT_SECRET = os.getenv("AGENT_SECRET", "simone-agent-secret-placeholder")
HEARTBEAT_INTERVAL_SECONDS = int(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "30"))
POLL_INTERVAL_SECONDS = int(os.getenv("POLL_INTERVAL_SECONDS", "10"))
LIBVIRT_URI = os.getenv("LIBVIRT_URI", "qemu:///system")
MOCK_HYPERVISOR = os.getenv("MOCK_HYPERVISOR", "false").lower() == "true"
