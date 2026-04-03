"""
File Cleanup Scheduler — PradnyaChakshu
Deletes uploaded CSVs and orphaned reports older than FILE_TTL_HOURS.
Runs as an async background loop on server startup.
"""
import asyncio
import logging
import os
import time

from config import settings

logger = logging.getLogger("pradnyachakshu.cleanup")

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
REPORT_DIR = os.path.join(os.path.dirname(__file__), "reports")

# How often to scan (seconds) — every 30 minutes
SCAN_INTERVAL_SECONDS = 30 * 60


async def _delete_old_files(directory: str, ttl_seconds: float):
    """Delete files in `directory` older than `ttl_seconds`."""
    if not os.path.isdir(directory):
        return
    now = time.time()
    deleted = 0
    for fname in os.listdir(directory):
        fpath = os.path.join(directory, fname)
        try:
            if os.path.isfile(fpath):
                age = now - os.path.getmtime(fpath)
                if age > ttl_seconds:
                    os.remove(fpath)
                    deleted += 1
                    logger.info(f"Cleanup: deleted {fpath} (age={age/3600:.1f}h)")
        except OSError as e:
            logger.warning(f"Cleanup: could not delete {fpath}: {e}")
    if deleted:
        logger.info(f"Cleanup: removed {deleted} file(s) from {directory}")


async def run_cleanup_loop():
    """
    Infinite async loop that deletes old uploads & reports.
    Registered as a FastAPI startup background task.
    """
    ttl_seconds = settings.file_ttl_hours * 3600
    logger.info(
        f"File cleanup loop started — TTL={settings.file_ttl_hours}h, "
        f"scan every {SCAN_INTERVAL_SECONDS // 60}min"
    )
    while True:
        try:
            await _delete_old_files(UPLOAD_DIR, ttl_seconds)
            # Keep reports longer (7 days) so users can re-download
            await _delete_old_files(REPORT_DIR, ttl_seconds * 7)
        except Exception as e:
            logger.error(f"Cleanup loop error: {e}", exc_info=True)
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)
