"""Entry point for Parliament Tracker Agent."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from civic import ParliamentTrackerAgent
if __name__ == "__main__":
    ParliamentTrackerAgent.run()
