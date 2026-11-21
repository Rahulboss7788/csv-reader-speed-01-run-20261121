// Fast exact drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// run(input) returns exactly what csv-reader 1.0.0 returns for
// {text, header}: {columns, rows, errors}. The reader's broken-row policy,
// followed here to the letter:
//
//   - a U+FEFF at the very start of the text is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no
//     record;
//   - outside a quoted field a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not
//     doubled, "" inside it one quote, and each CRLF or lone CR inside it
//     read as LF; what follows its closing quote, up to the next comma or
//     line break, is appended as it stands (quote_junk, when the field
//     ends); a quote that never closes is a literal character, and the text
//     after it is read again as unquoted (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it (every record when header is false), each padded
//     with "" (short_row, with fields: its count) or cut (long_row, with
//     extra: the cut fields) to the first record's width;
//   - each error is {code, line, row}, in the order met, a record's
//     short_row or long_row when the record ends: line the 1-based line its
//     record starts on, counting every LF, CRLF and lone CR inside quotes,
//     and row its record's index in rows, null for the header.
//
// Speed: the reference walks one character at a time and builds every field
// a character at a time. This reader instead works in slices: a field is
// one slice up to its next delimiter (a single regex scan finds the nearest
// comma, CR or LF) or up to its closing quote, and only the rare broken
// pieces (stray CR, doubled quotes, line breaks inside quotes) take a
// slower path. Nothing is kept from one call to the next; the answer is
// built once, in order, with no re-scanning.

const COMMA = 0; // a field ended at a comma: the record goes on
const LINE_BREAK = 1; // a field ended at a line break: the record ends
const END = 2; // a field ended at the end of the text: the record ends

// The next comma, CR or LF at or after the search position: one native
// scan finds whichever delimiter an unquoted field ends at.
const DELIM = /[,\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (n > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Errors met while reading it carry these.
  let recordLine = 1;
  let recordRow = null;
  // How the last field read ended (COMMA, LINE_BREAK or END).
  let fieldEnd = END;

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Sets fieldEnd.
  function unquoted(value) {
    let start = pos;
    for (;;) {
      DELIM.lastIndex = pos;
      const m = DELIM.exec(text);
      if (m === null) {
        value += text.slice(start);
        pos = n;
        fieldEnd = END;
        return value;
      }
      const e = m.index;
      const ch = m[0];
      if (ch === '\r') {
        if (text.charCodeAt(e + 1) === 10) {
          // CRLF: the record ends here, the CR itself kept out.
          value += text.slice(start, e);
          pos = e + 2;
          line += 1;
          fieldEnd = LINE_BREAK;
          return value;
        }
        // A lone CR: dropped, and the field goes on after it.
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        value += text.slice(start, e);
        pos = e + 1;
        start = e + 1;
        continue;
      }
      value += text.slice(start, e);
      if (ch === ',') {
        pos = e + 1;
        fieldEnd = COMMA;
      } else {
        pos = e + 1;
        line += 1;
        fieldEnd = LINE_BREAK;
      }
      return value;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function quoted() {
    const open = pos;
    const openLine = line;
    let p = open + 1;
    let segStart = p;
    let parts = null; // pieces before a doubled quote, once one is met
    let q;
    for (;;) {
      q = text.indexOf('"', p);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as an unquoted field. Line changes from
        // the failed scan are undone, as the reference resets them.
        line = openLine;
        errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
        pos = open + 1;
        return unquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote kept, the field goes on after it.
        if (parts === null) parts = [];
        parts.push(text.slice(segStart, q + 1));
        p = q + 2;
        segStart = q + 2;
        continue;
      }
      break; // q is the closing quote
    }
    // The field's content, with "" collapsed to one quote.
    let value = parts === null ? text.slice(open + 1, q) : parts.join('') + text.slice(segStart, q);
    // Each CRLF or lone CR inside it is one LF, and each line break inside
    // it moves the line count on. Most quoted fields hold neither, so this
    // stays a pair of cheap searches.
    if (value.indexOf('\r') !== -1 || value.indexOf('\n') !== -1) {
      let breaks = 0;
      value = value.replace(/\r\n?|\n/g, () => {
        breaks += 1;
        return '\n';
      });
      line += breaks;
    }
    pos = q + 1;
    if (pos >= n) {
      fieldEnd = END;
      return value;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fieldEnd = COMMA;
      return value;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fieldEnd = LINE_BREAK;
      return value;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fieldEnd = LINE_BREAK;
      return value;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = unquoted(value);
    if (junk.length > value.length) {
      errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    }
    return junk;
  }

  while (pos < n) {
    // Lines with no characters are no records.
    let c = text.charCodeAt(pos);
    while (c === 10 || (c === 13 && text.charCodeAt(pos + 1) === 10)) {
      pos += c === 10 ? 1 : 2;
      line += 1;
      if (pos >= n) break;
      c = text.charCodeAt(pos);
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        fields.push(quoted());
      } else {
        lastQuoted = false;
        fields.push(unquoted(''));
      }
    } while (fieldEnd === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
