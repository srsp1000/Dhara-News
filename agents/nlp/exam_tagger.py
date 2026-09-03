"""agents/nlp/exam_tagger.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from nlp import ExamTaggerAgent
if __name__ == "__main__":
    ExamTaggerAgent.run()
