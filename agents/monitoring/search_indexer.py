"""agents/monitoring/search_indexer.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import SearchIndexerAgent
if __name__ == "__main__":
    SearchIndexerAgent.run()
