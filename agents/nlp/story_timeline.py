"""agents/nlp/story_timeline.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from nlp import StoryTimelineAgent
if __name__ == "__main__":
    StoryTimelineAgent.run()
