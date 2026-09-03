"""agents/verification/source_credibility.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import SourceCredibilityAgent
if __name__ == "__main__":
    SourceCredibilityAgent.run()
