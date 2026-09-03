"""agents/publishing/seo_agent.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from publishing import SEOAgent
if __name__ == "__main__":
    SEOAgent.run()
