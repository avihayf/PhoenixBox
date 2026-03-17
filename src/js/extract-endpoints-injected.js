(function () {
  var found = new Set();
  /* Pattern: quote char (", ', or backtick=\x60) followed by a path starting with / */
  var patStr = '["\'\\x60](\\/[a-zA-Z0-9_?&=\\/\\-#.][a-zA-Z0-9_?&=\\/\\-#.]*)';
  var sources = [document.documentElement.outerHTML];
  document.querySelectorAll("script").forEach(function (s) {
    if (s.textContent) { sources.push(s.textContent); }
  });
  sources.forEach(function (src) {
    var matches = src.matchAll(new RegExp(patStr, "g"));
    for (var m of matches) { found.add(m[1]); }
  });
  var noAssets = /\.(png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|css|map)$/i;
  return Array.from(found).filter(function (p) {
    return p.length > 1 && !noAssets.test(p);
  }).sort();
})();
