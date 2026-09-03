"""agents/personalization/profession_feed.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from personalization import ProfessionFeedAgent
if __name__ == "__main__":
    ProfessionFeedAgent.run()
