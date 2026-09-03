"""agents/ingestion/image_harvester.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from ingestion import ImageHarvesterAgent
if __name__ == "__main__":
    ImageHarvesterAgent.run()
