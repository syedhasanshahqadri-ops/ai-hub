/* Tiny, safe Markdown renderer. All text is HTML-escaped before any tag is produced. */
(function () {
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }

  var KW = new Set(("const let var function return if else for while do switch case break continue new class extends import from export default " +
    "async await try catch finally throw typeof instanceof in of this null true false undefined def lambda None True False elif pass with as is not " +
    "and or print self public private protected static void int float double string bool char struct enum interface type package fn mut use impl match " +
    "pub echo foreach end then local nil select where insert update delete create table values limit order group by join on").split(" "));
  var HASH_LANGS = new Set(["py", "python", "bash", "sh", "shell", "zsh", "yaml", "yml", "ruby", "rb", "toml", "r", "powershell", "ps1", "dockerfile"]);
  var RE_C = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;
  var RE_H = /(#[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

  function highlight(code, lang) {
    var re = new RegExp((HASH_LANGS.has(lang) ? RE_H : RE_C).source, "g");
    var out = "", last = 0, m;
    while ((m = re.exec(code))) {
      out += esc(code.slice(last, m.index));
      var t = m[0];
      if (m[1]) out += '<span class="tk-c">' + esc(t) + "</span>";
      else if (m[2]) out += '<span class="tk-s">' + esc(t) + "</span>";
      else if (m[3]) out += '<span class="tk-n">' + esc(t) + "</span>";
      else if (KW.has(t)) out += '<span class="tk-k">' + esc(t) + "</span>";
      else if (code.charAt(re.lastIndex) === "(") out += '<span class="tk-f">' + esc(t) + "</span>";
      else out += esc(t);
      last = re.lastIndex;
      if (t.length === 0) re.lastIndex++;
    }
    return out + esc(code.slice(last));
  }

  function inline(src) {
    var codes = [];
    var s = src.replace(/`([^`\n]+)`/g, function (m, c) { codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = esc(s);
    s = s.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
         .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
         .replace(/~~([^~\n]+)~~/g, "<del>$1</del>")
         .replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
         .replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return s.replace(/\u0000(\d+)\u0000/g, function (m, i) { return "<code>" + esc(codes[+i]) + "</code>"; });
  }

  function codeBlock(code, lang) {
    var l = (lang || "").toLowerCase();
    return '<div class="codeblock"><div class="code-head"><span>' + esc(l || "code") +
      '</span><button type="button" class="code-copy" data-copy-code>Copy</button></div><pre><code>' +
      highlight(code, l) + "</code></pre></div>";
  }

  var LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  var TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  function cells(line) { return line.trim().replace(/^\||\|$/g, "").split("|").map(function (c) { return c.trim(); }); }

  function buildList(items) {
    var html = "", stack = [];
    items.forEach(function (it) {
      var tag = it.ordered ? "ol" : "ul";
      while (stack.length && it.indent < stack[stack.length - 1].indent) html += "</li></" + stack.pop().tag + ">";
      var top = stack[stack.length - 1];
      if (!top || it.indent > top.indent) { html += "<" + tag + "><li>"; stack.push({ indent: it.indent, tag: tag }); }
      else html += "</li><li>";
      html += inline(it.text);
    });
    while (stack.length) html += "</li></" + stack.pop().tag + ">";
    return html;
  }

  function isBlockStart(line, next) {
    return /^\s*```/.test(line) || /^#{1,4}\s/.test(line) || /^\s*>/.test(line) || LIST_RE.test(line) ||
      /^\s*([-*_])(\s*\1){2,}\s*$/.test(line) || (line.indexOf("|") >= 0 && next !== undefined && TABLE_SEP.test(next));
  }

  function render(src) {
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [], i = 0, m;
    while (i < lines.length) {
      var line = lines[i];
      if ((m = line.match(/^\s*```\s*([\w+#.-]*)\s*$/))) {
        var buf = []; i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) buf.push(lines[i++]);
        i++;
        out.push(codeBlock(buf.join("\n"), m[1]));
        continue;
      }
      if (/^\s*$/.test(line)) { i++; continue; }
      if ((m = line.match(/^(#{1,4})\s+(.*)$/))) { var n = m[1].length + 1; out.push("<h" + n + ">" + inline(m[2]) + "</h" + n + ">"); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push("<hr>"); i++; continue; }
      if (/^\s*>/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + render(q.join("\n")) + "</blockquote>");
        continue;
      }
      if (LIST_RE.test(line)) {
        var items = [];
        while (i < lines.length) {
          var lm = lines[i].match(LIST_RE);
          if (lm) { items.push({ indent: lm[1].replace(/\t/g, "    ").length, ordered: /\d/.test(lm[2]), text: lm[3] }); i++; }
          else if (/^\s*$/.test(lines[i]) && i + 1 < lines.length && LIST_RE.test(lines[i + 1])) i++;
          else break;
        }
        out.push(buildList(items));
        continue;
      }
      if (line.indexOf("|") >= 0 && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
        var head = cells(line); i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf("|") >= 0 && !/^\s*$/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function (r) { return "<tr>" + r.map(function (c) { return "<td>" + inline(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
          "</tbody></table></div>");
        continue;
      }
      var para = [line]; i++;
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !isBlockStart(lines[i], lines[i + 1])) para.push(lines[i++]);
      out.push("<p>" + para.map(inline).join("<br>") + "</p>");
    }
    return out.join("");
  }

  window.AIHubMD = { render: render, esc: esc };
})();
