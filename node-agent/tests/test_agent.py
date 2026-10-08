import unittest
from simone_agent.cloud_init import generate_cloud_init_iso

class TestCloudInit(unittest.TestCase):
    def test_generate_cloud_init(self):
        result = generate_cloud_init_iso("test-vps", "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey")
        self.assertIn("test-vps", result["user_data"])
        self.assertIn("ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleKey", result["user_data"])
        self.assertIn("instance-id", result["meta_data"])

if __name__ == "__main__":
    unittest.main()
