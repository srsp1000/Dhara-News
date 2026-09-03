"""Entry point for Wikipedia On This Day Agent."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from civic import WikipediaOnThisDayAgent
if __name__ == "__main__":
    WikipediaOnThisDayAgent.run()
