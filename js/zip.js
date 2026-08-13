/* ============================================================================
   zip.js — minimal ZIP writer, stored (uncompressed) entries only.

   Exports are a handful of small text files, so compression would buy nothing
   worth a dependency. Names are written UTF-8 with the language-encoding flag
   set, which every modern unzip honours.
   ========================================================================== */
(function () {
  'use strict';

  var CRC_TABLE = (function () {
    var t = new Uint32Array(256), c, i, k;
    for (i = 0; i < 256; i++) {
      c = i;
      for (k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[i] = c >>> 0;
    }
    return t;
  })();

  function crc32(u8) {
    var c = 0xFFFFFFFF, i;
    for (i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  /** Little-endian byte pushers. */
  function push16(a, n) { a.push(n & 0xFF, (n >>> 8) & 0xFF); }
  function push32(a, n) { a.push(n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF); }

  function dosStamp(d) {
    return {
      time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31),
      date: (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31)
    };
  }

  /**
   * @param {Array<{name: string, text?: string, data?: Uint8Array}>} entries
   * @returns {Blob}
   */
  window.Zip = {
    create: function (entries) {
      var enc = new TextEncoder(),
          stamp = dosStamp(new Date()),
          parts = [], central = [], offset = 0, i, e, name, data, crc, head;

      for (i = 0; i < entries.length; i++) {
        e = entries[i];
        name = enc.encode(e.name);
        data = e.data || enc.encode(e.text || '');
        crc = crc32(data);

        head = [];
        push32(head, 0x04034B50);
        push16(head, 20);            // version needed
        push16(head, 0x0800);        // UTF-8 names
        push16(head, 0);             // stored
        push16(head, stamp.time);
        push16(head, stamp.date);
        push32(head, crc);
        push32(head, data.length);   // compressed == uncompressed
        push32(head, data.length);
        push16(head, name.length);
        push16(head, 0);             // no extra field

        parts.push(new Uint8Array(head), name, data);

        push32(central, 0x02014B50);
        push16(central, 20);         // version made by
        push16(central, 20);         // version needed
        push16(central, 0x0800);
        push16(central, 0);
        push16(central, stamp.time);
        push16(central, stamp.date);
        push32(central, crc);
        push32(central, data.length);
        push32(central, data.length);
        push16(central, name.length);
        push16(central, 0);          // extra
        push16(central, 0);          // comment
        push16(central, 0);          // disk number
        push16(central, 0);          // internal attrs
        push32(central, 0);          // external attrs
        push32(central, offset);
        for (var j = 0; j < name.length; j++) central.push(name[j]);

        offset += head.length + name.length + data.length;
      }

      var eocd = [];
      push32(eocd, 0x06054B50);
      push16(eocd, 0);
      push16(eocd, 0);
      push16(eocd, entries.length);
      push16(eocd, entries.length);
      push32(eocd, central.length);
      push32(eocd, offset);
      push16(eocd, 0);

      parts.push(new Uint8Array(central), new Uint8Array(eocd));
      return new Blob(parts, { type: 'application/zip' });
    }
  };

})();
