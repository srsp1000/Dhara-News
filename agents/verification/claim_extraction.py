"""agents/verification/claim_extraction.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from verification import ClaimExtractionAgent
if __name__ == "__main__":
    ClaimExtractionAgent.run()
