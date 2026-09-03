"""agents/verification/cross_reference.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import CrossReferenceAgent
if __name__ == "__main__":
    CrossReferenceAgent.run()
