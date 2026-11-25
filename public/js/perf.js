// R7 instrumentation: time from QR decode / search submission until the record renders.
let mark = null;

export function startTiming(source) {
  mark = { start: performance.now(), source };
}

export function takeTiming() {
  if (!mark) return null;
  const result = { ms: Math.round(performance.now() - mark.start), source: mark.source };
  mark = null;
  return result;
}
