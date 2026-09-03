"""agents/verification/truth_score.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import TruthScoreAgent
if __name__ == "__main__":
    TruthScoreAgent.run()
