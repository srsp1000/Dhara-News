"""agents/ingestion/rss_feed.py — entry point for docker-compose"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from ingestion import RSSFeedAgent
if __name__ == "__main__":
    RSSFeedAgent.run()
