"""Entry point for Court Order Agent."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from civic import CourtOrderAgent
if __name__ == "__main__":
    CourtOrderAgent.run()
