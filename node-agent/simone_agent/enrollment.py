import requests
import logging
import os
from .config import SIMONE_API_URL, HOST_ID

logger = logging.getLogger("simone_agent.enrollment")

def enroll_agent(enrollment_token: str, host_name: str, host_address: str) -> str:
    """
    Performs one-time enrollment of the node agent with the backend control plane.
    Exchanges an enrollment token for an agent authentication secret.
    """
    url = f"{SIMONE_API_URL}/hosts/enroll"
    payload = {
        "name": host_name,
        "address": host_address,
        "agent_version": "1.0.0",
        "cpu_total": os.cpu_count() or 8,
        "ram_total_mb": 32768,
        "storage_total_gb": 500,
        "enrollment_token": enrollment_token,
    }

    try:
        response = requests.post(url, json=payload, timeout=10)
        if response.status_code == 201:
            data = response.json()
            agent_secret = data.get("agent_token")
            logger.info(f"Successfully enrolled host {host_name} with ID {data.get('host', {}).get('id')}")
            return agent_secret
        else:
            raise Exception(f"Enrollment failed: {response.status_code} {response.text}")
    except Exception as e:
        logger.error(f"Enrollment connection error: {e}")
        raise
