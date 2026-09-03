"""agents/personalization/reading_depth.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from personalization import ReadingDepthAgent
if __name__ == "__main__":
    ReadingDepthAgent.run()
