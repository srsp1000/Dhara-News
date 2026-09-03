"""agents/verification/contradiction_detector.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import ContradictionDetectorAgent
if __name__ == "__main__":
    ContradictionDetectorAgent.run()
