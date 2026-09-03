"""agents/personalization/trending_detector.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from personalization import TrendingDetectorAgent
if __name__ == "__main__":
    TrendingDetectorAgent.run()
