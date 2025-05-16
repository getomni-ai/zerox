// Tesseract relies on node-fetch v2, which has a deprecated version of punycode
// Suppress the warning for now. Check in when teseract updates to node-fetch v3
// https://github.com/naptha/tesseract.js/issues/876
if (process.stderr.write === process.stderr.constructor.prototype.write) {
  const stdErrWrite = process.stderr.write;
  process.stderr.write = function (chunk: any, ...args: any[]) {
    const str = Buffer.isBuffer(chunk) ? chunk.toString() : chunk;

    // Filter out the punycode deprecation warning
    if (str.includes("punycode")) {
      return true;
    }
    return stdErrWrite.apply(process.stderr, [chunk]);
  };
}
