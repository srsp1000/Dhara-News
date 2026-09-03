"""agents/deduplication/story_cluster.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from deduplication import StoryClusterManager
if __name__ == "__main__":
    StoryClusterManager.run()
