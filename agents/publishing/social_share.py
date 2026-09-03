"""agents/publishing/social_share.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from publishing import SocialShareAgent
if __name__ == "__main__":
    SocialShareAgent.run()
