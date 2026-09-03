"""agents/ingestion/social_signal.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from ingestion import SocialSignalAgent
if __name__ == "__main__":
    SocialSignalAgent.run()
