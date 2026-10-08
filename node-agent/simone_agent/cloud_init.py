import yaml

def generate_cloud_init_iso(hostname: string, ssh_public_key: string) -> dict:
    """
    Generates cloud-init user-data and meta-data configurations.
    Injects ONLY the submitted SSH public key. Never accepts private keys.
    """
    user_data = {
        "#cloud-config": True,
        "hostname": hostname,
        "manage_etc_hosts": True,
        "users": [
            {
                "name": "ubuntu",
                "sudo": ["ALL=(ALL) NOPASSWD:ALL"],
                "shell": "/bin/bash",
                "ssh_authorized_keys": [ssh_public_key.strip()],
            }
        ],
        "ssh_pwauth": False,
        "package_update": True,
        "packages": ["qemu-guest-agent"],
        "runcmd": [
            ["systemctl", "enable", "--now", "qemu-guest-agent"]
        ]
    }

    meta_data = {
        "instance-id": hostname,
        "local-hostname": hostname,
    }

    return {
        "user_data": yaml.dump(user_data, default_flow_style=False),
        "meta_data": yaml.dump(meta_data, default_flow_style=False),
    }
