"""agents/publishing/publish_queue.py — entry point"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from publishing import PublishQueueManager
if __name__ == "__main__":
    PublishQueueManager.run()
