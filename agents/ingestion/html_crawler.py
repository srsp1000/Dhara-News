"""agents/ingestion/html_crawler.py - entry point for docker-compose"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from ingestion import HTMLCrawlerAgent


if __name__ == "__main__":
    HTMLCrawlerAgent.run()
