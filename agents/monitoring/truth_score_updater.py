"""agents/monitoring/truth_score_updater.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import TruthScoreUpdater
if __name__ == "__main__":
    TruthScoreUpdater.run()
