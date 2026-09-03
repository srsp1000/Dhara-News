"""agents/nlp/summarization.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from nlp import SummarizationAgent
if __name__ == "__main__":
    SummarizationAgent.run()
