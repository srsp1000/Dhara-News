"""agents/verification/satire_detector.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import SatireDetectorAgent
if __name__ == "__main__":
    SatireDetectorAgent.run()
