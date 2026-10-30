// tsx asks for os.userInfo() on Windows. Some restricted Windows runners deny
// that OS lookup, so give tsx a stable per-machine temporary-directory suffix.
if (process.platform === 'win32' && typeof process.geteuid !== 'function') {
  process.geteuid = () => 1000;
}
