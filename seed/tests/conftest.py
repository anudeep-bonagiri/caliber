import sys
from pathlib import Path

SEED_DIR = Path(__file__).resolve().parents[1]
if str(SEED_DIR) not in sys.path:
    sys.path.insert(0, str(SEED_DIR))
