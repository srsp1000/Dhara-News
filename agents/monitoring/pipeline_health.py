"""agents/monitoring/pipeline_health.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from monitoring import PipelineHealthAgent
if __name__ == "__main__":
    PipelineHealthAgent.run()
