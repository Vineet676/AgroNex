import sys
from pathlib import Path

# Add project root and backend to sys.path so backend modules can be imported
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))
sys.path.insert(0, str(ROOT_DIR))

try:
    from backend.main import app
except ImportError:
    from main import app
