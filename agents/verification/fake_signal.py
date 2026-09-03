"""agents/verification/fake_signal.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import FakeSignalAgent
if __name__ == "__main__":
    FakeSignalAgent.run()
