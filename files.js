/* AI HUB — file handling. Reads attachments in the browser (nothing is uploaded except what you send in a chat).
   Images are resized; PDFs, Word, Excel, PowerPoint and text files become text; scanned PDFs become page images. */
(function () {
  "use strict";
  var CDN = "https://cdnjs.cloudflare.com/ajax/libs/";
  var LIBS = {
    pdf: [CDN + "pdf.js/3.11.174/pdf.min.js"],
    mammoth: [CDN + "mammoth/1.6.0/mammoth.browser.min.js"],
    xlsx: [CDN + "xlsx/0.18.5/xlsx.full.min.js"],
    jszip: [CDN + "jszip/3.10.1/jszip.min.js"]
  };
  var loaded = {};
  function loadScript(src) {
    return loaded[src] || (loaded[src] = new Promise(function (res, rej) {
      var s = document.createElement("script"); s.src = src; s.async = true;
      s.onload = res; s.onerror = function () { delete loaded[src]; rej(new Error("Couldn't load a helper library. Check your connection.")); };
      document.head.appendChild(s);
    }));
  }
  function lib(name) { return Promise.all(LIBS[name].map(loadScript)); }

  var TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html?|css|scss|js|mjs|cjs|jsx|ts|tsx|py|java|c|h|cpp|hpp|cs|go|rs|rb|php|swift|kt|sql|sh|bash|bat|ps1|yml|yaml|toml|ini|cfg|conf|env|log|tex|srt|vtt|vue|svelte|r|lua|dart|gradle|properties|rtf)$/i;
  var MAX_TEXT = 400000, MAX_ATT = 6;

  /* ---------- tiny IndexedDB store so files survive a reload ---------- */
  var dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no idb"));
      var r = indexedDB.open("ai-hub-files", 1);
      r.onupgradeneeded = function () { r.result.createObjectStore("f", { keyPath: "id" }); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    }); dbp.catch(function () {});
    return dbp;
  }
  function tx(mode, fn) {
    return db().then(function (d) { return new Promise(function (res, rej) { var t = d.transaction("f", mode), s = t.objectStore("f"), q = fn(s); t.oncomplete = function () { res(q && q.result); }; t.onerror = function () { rej(t.error); }; }); });
  }
  var mem = new Map();
  var store = {
    put: function (rec) { mem.set(rec.id, rec); return tx("readwrite", function (s) { return s.put(rec); }).catch(function () {}); },
    get: function (id) { if (mem.has(id)) return Promise.resolve(mem.get(id)); return tx("readonly", function (s) { return s.get(id); }).then(function (r) { if (r) mem.set(id, r); return r || null; }).catch(function () { return null; }); },
    del: function (ids) { return Promise.all(ids.map(function (id) { mem.delete(id); return tx("readwrite", function (s) { return s.delete(id); }).catch(function () {}); })); },
    cached: function (id) { return mem.get(id) || null; },
    /* remove stored files that no saved chat refers to any more (runs at startup) */
    prune: function (keep) {
      return tx("readonly", function (s) { return s.getAllKeys(); }).then(function (keys) {
        var drop = (keys || []).filter(function (k) { return !keep.has(k); }); return drop.length ? store.del(drop) : null;
      }).catch(function () {});
    }
  };

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  function fileToDataURL(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; r.readAsDataURL(f); }); }

  /** Resize to maxSide and return a JPEG data URL (keeps requests small and fast). */
  function imageToJpeg(src, maxSide, quality) {
    return new Promise(function (res, rej) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, maxSide / Math.max(w, h));
        var c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
        var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality || 0.86));
      };
      img.onerror = function () { rej(new Error("This image format can't be opened by your browser.")); };
      img.src = src;
    });
  }
  function thumb(dataUrl) { return imageToJpeg(dataUrl, 160, 0.7); }

  function clipText(t) { t = String(t || "").replace(/\u0000/g, ""); return t.length > MAX_TEXT ? t.slice(0, MAX_TEXT) + "\n[... file cut at " + MAX_TEXT + " characters ...]" : t; }

  /* ---------- readers ---------- */
  function readPdf(file) {
    return lib("pdf").then(function () {
      var P = window.pdfjsLib; P.GlobalWorkerOptions.workerSrc = CDN + "pdf.js/3.11.174/pdf.worker.min.js";
      return file.arrayBuffer().then(function (buf) { return P.getDocument({ data: buf }).promise; }).then(function (doc) {
        var n = doc.numPages, parts = [], i = 1;
        function next() {
          if (i > Math.min(n, 150)) return Promise.resolve();
          var p = i++;
          return doc.getPage(p).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
            var line = "", out = "", lastY = null;
            tc.items.forEach(function (it) { var y = it.transform[5]; if (lastY !== null && Math.abs(y - lastY) > 4) { out += line.trim() + "\n"; line = ""; } line += it.str + " "; lastY = y; });
            parts.push("--- Page " + p + " ---\n" + (out + line).trim());
          }).then(next);
        }
        return next().then(function () {
          var text = parts.join("\n\n"), avg = text.replace(/--- Page \d+ ---/g, "").replace(/\s/g, "").length / Math.max(1, Math.min(n, 150));
          var note = n + " page" + (n > 1 ? "s" : "") + (n > 150 ? " (first 150 read)" : "");
          if (avg >= 40) return { kind: "text", text: clipText(text), note: note };
          // scanned PDF: send the first pages as images so the vision model can read them
          var imgs = [], k = 1;
          function render() {
            if (k > Math.min(n, 4)) return Promise.resolve();
            return doc.getPage(k++).then(function (pg) {
              var vp = pg.getViewport({ scale: 1.6 }), c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
              return pg.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise.then(function () { imgs.push(c.toDataURL("image/jpeg", 0.82)); });
            }).then(render);
          }
          return render().then(function () { return { kind: "text", text: "(Scanned PDF with no selectable text. The first " + imgs.length + " page(s) are attached as images.)", images: imgs, note: note + ", scanned" }; });
        });
      });
    });
  }
  function readDocx(file) {
    return lib("mammoth").then(function () { return file.arrayBuffer(); }).then(function (b) { return window.mammoth.extractRawText({ arrayBuffer: b }); })
      .then(function (r) { return { kind: "text", text: clipText(r.value), note: "Word document" }; });
  }
  function readSheet(file) {
    return lib("xlsx").then(function () { return file.arrayBuffer(); }).then(function (b) {
      var X = window.XLSX, wb = X.read(b, { type: "array" }), out = [];
      wb.SheetNames.slice(0, 8).forEach(function (nm) {
        var csv = X.utils.sheet_to_csv(wb.Sheets[nm]).split("\n"), more = csv.length > 400;
        out.push("### Sheet: " + nm + " (" + csv.length + " rows)\n" + csv.slice(0, 400).join("\n") + (more ? "\n[... " + (csv.length - 400) + " more rows ...]" : ""));
      });
      return { kind: "text", text: clipText(out.join("\n\n")), note: wb.SheetNames.length + " sheet(s)" };
    });
  }
  function readPptx(file) {
    return lib("jszip").then(function () { return file.arrayBuffer(); }).then(function (b) { return window.JSZip.loadAsync(b); }).then(function (zip) {
      var names = Object.keys(zip.files).filter(function (n) { return /^ppt\/slides\/slide\d+\.xml$/.test(n); }).sort(function (a, c) { return parseInt(a.match(/\d+/)[0], 10) - parseInt(c.match(/\d+/)[0], 10); });
      return Promise.all(names.map(function (n) { return zip.files[n].async("string"); })).then(function (xs) {
        var text = xs.map(function (x, i) { var t = (x.match(/<a:t>[^<]*<\/a:t>/g) || []).map(function (m) { return m.replace(/<\/?a:t>/g, ""); }).join(" "); return "--- Slide " + (i + 1) + " ---\n" + t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"); }).join("\n\n");
        return { kind: "text", text: clipText(text), note: names.length + " slides" };
      });
    });
  }

  /** Turn a File into a record: { id, name, mime, size, kind: "image"|"text", data?, text?, images?, note?, thumb? } */
  function process(file) {
    var name = file.name || "file", type = file.type || "", id = uid(), base = { id: id, name: name, mime: type, size: file.size };
    if (/^image\//.test(type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif|avif)$/i.test(name)) {
      if (file.size > 25e6) return Promise.reject(new Error(name + " is larger than 25 MB."));
      return fileToDataURL(file).then(function (u) { return imageToJpeg(u, 1568, 0.86); }).then(function (d) { return thumb(d).then(function (t) { return Object.assign(base, { kind: "image", data: d, thumb: t }); }); });
    }
    if (file.size > 30e6) return Promise.reject(new Error(name + " is larger than 30 MB."));
    var p;
    if (/pdf$/i.test(type) || /\.pdf$/i.test(name)) p = readPdf(file);
    else if (/\.docx$/i.test(name)) p = readDocx(file);
    else if (/\.(xlsx|xlsm|xls|ods)$/i.test(name)) p = readSheet(file);
    else if (/\.pptx$/i.test(name)) p = readPptx(file);
    else if (/^text\//.test(type) || /json|xml|javascript|csv/.test(type) || TEXT_EXT.test(name)) p = file.text().then(function (t) { return { kind: "text", text: clipText(t) }; });
    else return Promise.reject(new Error(name + ": this file type isn't supported yet. Try an image, PDF, Word, Excel, PowerPoint, or a text/code file."));
    return p.then(function (r) {
      if (!r.text || !r.text.trim()) throw new Error(name + " has no readable text.");
      return Object.assign(base, r);
    });
  }

  window.AIHubFiles = { process: process, store: store, MAX_ATT: MAX_ATT, uid: uid };
})();
