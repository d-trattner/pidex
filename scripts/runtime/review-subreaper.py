"""Linux-only supervision primitives; no global settings or installed state changes."""
import ctypes
import os
import signal
import sys


def process_start(pid):
    with open(f"/proc/{pid}/stat", encoding="utf-8") as source:
        return source.read().rsplit(")", 1)[1].split()[19]


def signal_exact(pid, start, name):
    if pid <= 1 or name not in ("SIGTERM", "SIGKILL"):
        return 2
    try:
        fd = os.pidfd_open(pid)
        try:
            # The fd pins the process before checking /proc; PID reuse cannot
            # redirect the eventual signal to a successor process.
            if process_start(pid) != start:
                return 3
            signal.pidfd_send_signal(fd, getattr(signal, name))
        finally:
            os.close(fd)
        return 0
    except ProcessLookupError:
        return 0
    except FileNotFoundError:
        return 0


def main():
    if len(sys.argv) == 5 and sys.argv[1] == "--signal":
        return signal_exact(int(sys.argv[2]), sys.argv[3], sys.argv[4])
    # Check pidfd support before admitting any provider child.
    fd = os.pidfd_open(os.getpid())
    try:
        signal.pidfd_send_signal(fd, 0)
    finally:
        os.close(fd)
    with open(f"/proc/self/task/{os.getpid()}/children", encoding="ascii") as children:
        children.read()
    libc = ctypes.CDLL(None, use_errno=True)
    value = ctypes.c_int()
    # PR_SET_CHILD_SUBREAPER / PR_GET_CHILD_SUBREAPER survives execve, not fork.
    if libc.prctl(36, 1, 0, 0, 0) != 0 or libc.prctl(37, ctypes.byref(value), 0, 0, 0) != 0 or value.value != 1:
        return 125
    if sys.argv[1:] == ["--probe"]:
        return 0
    if len(sys.argv) < 3:
        return 125
    os.environ["PIDEX_REVIEW_SUBREAPER"] = "1"
    os.execv(sys.argv[1], sys.argv[1:])


try:
    sys.exit(main())
except (OSError, ValueError, AttributeError):
    sys.stderr.write("REVIEW_EXECUTION_SUBREAPER_UNAVAILABLE\n")
    sys.exit(125)
