"""Entry point for the packaged Windows app (PyInstaller) and `python HushCam.py`."""
import sys

from hushcam.app import main

if __name__ == "__main__":
    sys.exit(main())
