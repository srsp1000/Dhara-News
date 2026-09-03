"""agents/ingestion/web_crawler.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from ingestion import WebCrawlerAgent
if __name__ == "__main__":
    WebCrawlerAgent.run()
