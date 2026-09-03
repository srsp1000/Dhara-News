"""agents/monitoring/breaking_news_detector.py - entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import BreakingNewsDetectorAgent

if __name__ == "__main__":
    BreakingNewsDetectorAgent.run()
