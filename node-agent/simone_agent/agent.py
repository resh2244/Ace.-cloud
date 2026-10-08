import time
import requests
import logging
from .config import SIMONE_API_URL, HOST_ID, AGENT_SECRET, HEARTBEAT_INTERVAL_SECONDS, POLL_INTERVAL_SECONDS
from .libvirt_adapter import LibvirtAdapter

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("simone_agent")

def run_agent():
    logger.info(f"Starting Simone Cloud Node Agent for host {HOST_ID} targeting {SIMONE_API_URL}")
    adapter = LibvirtAdapter()
    headers = {"Authorization": f"Bearer {AGENT_SECRET}"}

    last_heartbeat = 0

    while True:
        now = time.time()
        # 1. Send Heartbeat
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            try:
                hb_payload = {
                    "host_id": HOST_ID,
                    "agent_version": "1.0.0",
                    "cpu_used_percent": 15.2,
                    "ram_used_mb": 8192,
                    "storage_used_gb": 150,
                    "running_vms_count": 2,
                }
                res = requests.post(f"{SIMONE_API_URL}/agent/heartbeat", json=hb_payload, headers=headers, timeout=5)
                if res.status_code == 200:
                    logger.debug("Heartbeat sent successfully")
                else:
                    logger.warning(f"Heartbeat rejected: {res.status_code} {res.text}")
            except Exception as e:
                logger.error(f"Heartbeat connection error: {e}")
            last_heartbeat = now

        # 2. Poll for Jobs
        try:
            res = requests.post(f"{SIMONE_API_URL}/agent/jobs/claim", json={"host_id": HOST_ID}, headers=headers, timeout=5)
            if res.status_code == 200:
                data = res.json()
                job = data.get("job")
                if job:
                    job_id = job["id"]
                    job_type = job["type"]
                    payload = job["payload"]
                    logger.info(f"Claimed job {job_id} of type {job_type}")

                    try:
                        result_ip = None
                        if job_type == "create_vm":
                            res_virt = adapter.create_vm(
                                vm_id=payload["id"],
                                name=payload["name"],
                                vcpu=payload["vcpu"],
                                ram_mb=payload["ram_mb"],
                                disk_gb=payload["disk_gb"],
                                os_image=payload["os_image"],
                                ssh_pub_key=payload["ssh_public_key"]
                            )
                            result_ip = res_virt.get("ip_address")
                        elif job_type == "start_vm":
                            adapter.start_vm(payload["vm_id"])
                        elif job_type == "stop_vm":
                            adapter.stop_vm(payload["vm_id"])
                        elif job_type == "reboot_vm":
                            adapter.reboot_vm(payload["vm_id"])
                        elif job_type == "delete_vm":
                            adapter.delete_vm(payload["vm_id"])

                        # Report success
                        requests.post(
                            f"{SIMONE_API_URL}/agent/jobs/{job_id}/result",
                            json={"status": "succeeded", "ip_address": result_ip},
                            headers=headers,
                            timeout=5
                        )
                        logger.info(f"Job {job_id} completed successfully")
                    except Exception as job_err:
                        logger.error(f"Job {job_id} failed: {job_err}")
                        requests.post(
                            f"{SIMONE_API_URL}/agent/jobs/{job_id}/result",
                            json={"status": "failed", "error_message": str(job_err)},
                            headers=headers,
                            timeout=5
                        )
        except Exception as poll_err:
            logger.debug(f"Job polling error: {poll_err}")

        time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    run_agent()
