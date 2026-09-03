"""agents/monitoring/ad_quality.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import AdQualityAgent
if __name__ == "__main__":
    AdQualityAgent.run()
