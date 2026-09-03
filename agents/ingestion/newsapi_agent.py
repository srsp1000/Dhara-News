"""agents/ingestion/newsapi_agent.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from ingestion import NewsAPIAgent
if __name__ == "__main__":
    NewsAPIAgent.run()
