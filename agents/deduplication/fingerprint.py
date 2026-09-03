"""agents/deduplication/fingerprint.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from deduplication import FingerprintAgent
if __name__ == "__main__":
    FingerprintAgent.run()
