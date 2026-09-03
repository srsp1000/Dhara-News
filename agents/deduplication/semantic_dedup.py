"""agents/deduplication/semantic_dedup.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from deduplication import SemanticDedupAgent
if __name__ == "__main__":
    SemanticDedupAgent.run()
