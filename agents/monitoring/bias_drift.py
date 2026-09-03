"""agents/monitoring/bias_drift.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import BiasDriftAgent
if __name__ == "__main__":
    BiasDriftAgent.run()
