"""agents/nlp/entity_extraction.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from nlp import EntityExtractionAgent
if __name__ == "__main__":
    EntityExtractionAgent.run()
