// A fast drop-in for csv-reader 1.0.0: readCsv's exact answer for every input,
// computed with indexOf-driven scans instead of one character at a time.
//
// The semantics below are csv-reader 1.0.0's own, reimplemented from scratch:
// a U+FEFF at the very start is dropped; a record ends at LF or CRLF and a line
// left with no characters is no record; outside quotes a CR not followed by LF
// is dropped (stray_cr); a field that opens with a quote runs to the next quote
// that is not doubled ("" inside it is one quote, each CRLF or lone CR inside it
// is read as LF); what follows its closing quote, up to the next comma or line
// break, is appended as it stands (quote_junk, when the field ends); a quote that
// never closes is a literal character and the text after it is read again as
// unquoted (unterminated_quote); a quote inside an unquoted field is a literal
// character; fields stay strings, never trimmed or converted; columns is the first
// record when header is true, else null; rows holds the records after it, each
// padded with "" (short_row, with fields: its field count) or cut (long_row, with
// extra: the cut fields) to the first record's width; each error is
// {code, line, row}, in the order met, line the 1-based line its record starts
// on (counting every LF, CRLF and lone CR inside quotes) and row its record's
// index in rows (null for the header).
//
// Speed comes from two things. First, a whole-line fast path: a record whose
// line holds no quote and no stray CR is sliced out and split on commas in one
// go. Second, everywhere else fields are found with indexOf on the delimiters
// and sliced out, so the common unquoted field costs a few short native scans
// and one slice instead of a per-character loop with string concatenation. The
// hot scan is inlined in run() so the reading position and line stay plain
// locals; the two helpers below are standalone functions used only on the rare
// quote_junk / unterminated_quote paths.
//
// Pure: no clock, no randomness, no locale, nothing kept from one call to the
// next. Standard library only, deterministic, no network.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

// Scratch for scanUnquoted's result, so no object is built per call.
const SU = { value: '', ended: END, added: 0, pos: 0, line: 1 };

// Reads unquoted characters onto `init` from `pos` up to the next comma or line
// break: a CR not followed by LF is dropped (stray_cr). All state arrives as
// arguments; the result lands in SU (the field, how it ended, how many
// characters were kept after `init`, and the position and line to continue from).
// Used only on the quote_junk and unterminated_quote paths, which are rare;
// the common unquoted field is scanned inline in run().
function scanUnquoted(text, len, pos, line, init, recordLine, recordRow, errors) {
  let start = pos;
  let parts = null;
  let added = 0;
  for (;;) {
    const comma = text.indexOf(',', pos);
    const lf = text.indexOf('\n', pos);
    let end = len;
    let kind = END;
    if (comma !== -1 && comma < end) {
      end = comma;
      kind = COMMA;
    }
    if (lf !== -1 && lf < end) {
      end = lf;
      kind = LINE_BREAK;
    }
    // A CR inside [pos, end): the only way one hides from the two scans.
    let r = -1;
    for (let i = pos; i < end; i++) {
      if (text.charCodeAt(i) === 13) {
        r = i;
        break;
      }
    }
    if (r !== -1) {
      if (text.charCodeAt(r + 1) === 10) {
        // CRLF: the record ends here.
        SU.value = parts === null ? init + text.slice(start, r) : parts.join('') + text.slice(start, r);
        SU.added = added + (r - start);
        SU.pos = r + 2;
        SU.line = line + 1;
        SU.ended = LINE_BREAK;
        return SU;
      }
      // A lone CR: dropped, and the field goes on.
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (parts === null) parts = [init];
      parts.push(text.slice(start, r));
      added += r - start;
      pos = r + 1;
      start = pos;
      continue;
    }
    SU.value = parts === null ? init + text.slice(start, end) : parts.join('') + text.slice(start, end);
    SU.added = added + (end - start);
    if (kind === COMMA) {
      SU.pos = end + 1;
      SU.line = line;
      SU.ended = COMMA;
    } else if (kind === LINE_BREAK) {
      SU.pos = end + 1;
      SU.line = line + 1;
      SU.ended = LINE_BREAK;
    } else {
      SU.pos = len;
      SU.line = line;
      SU.ended = END;
    }
    return SU;
  }
}

// Scratch for finishQuoted's result.
const FQ = { value: '', line: 1 };

// A quoted field's raw inner text with its line breaks turned into LF, and the
// line advanced past every LF, CRLF and lone CR inside it.
function finishQuoted(raw, line) {
  if (raw.indexOf('\r') === -1 && raw.indexOf('\n') === -1) {
    FQ.value = raw;
    FQ.line = line;
    return FQ;
  }
  let out = '';
  let last = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (c === 13) {
      out += raw.slice(last, i) + '\n';
      line += 1;
      if (raw.charCodeAt(i + 1) === 10) i += 1;
      last = i + 1;
    } else if (c === 10) {
      line += 1;
    }
  }
  FQ.value = out + raw.slice(last);
  FQ.line = line;
  return FQ;
}

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (len > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes
  // (null: the header). Set fresh at each record.
  let recordLine = 1;
  let recordRow = null;

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: the whole record is one unquoted line. That holds when no
    // quote opens before the line break and no CR sits inside the line except
    // the CR of a CRLF ending it.
    const nl = text.indexOf('\n', pos);
    const lineEnd = nl === -1 ? len : nl;
    const q = text.indexOf('"', pos);
    if (q === -1 || q >= lineEnd) {
      const cr = text.indexOf('\r', pos);
      if (cr === -1 || cr >= lineEnd || (nl !== -1 && cr === nl - 1)) {
        const end = nl !== -1 && cr === nl - 1 ? nl - 1 : lineEnd;
        const fields = text.slice(pos, end).split(',');
        pos = nl === -1 ? len : nl + 1;
        line += 1;
        if (width < 0) width = fields.length;
        if (header && columns === null) {
          columns = fields;
        } else {
          if (fields.length < width) {
            errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
            while (fields.length < width) fields.push('');
          } else if (fields.length > width) {
            errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
          }
          rows.push(fields);
        }
        continue;
      }
    }

    // General path: at least one field is quoted, or a stray CR hides inside.
    const fields = [];
    let lastQuoted = false;
    let ended = END;
    while (true) {
      let value;
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        const openLine = line;
        let scan = pos + 1;
        let segStart = pos + 1;
        let segs = null;
        let closedAt = -1;
        for (;;) {
          const qq = text.indexOf('"', scan);
          if (qq === -1) break;
          if (text.charCodeAt(qq + 1) === 34) {
            if (segs === null) segs = [];
            segs.push(text.slice(segStart, qq));
            scan = qq + 2;
            segStart = qq + 2;
            continue;
          }
          closedAt = qq;
          break;
        }
        if (closedAt === -1) {
          // The quote never closes: it is a literal character, and the text
          // after it is read again as unquoted.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          const r = scanUnquoted(text, len, open + 1, openLine, '"', recordLine, recordRow, errors);
          value = r.value;
          ended = r.ended;
          pos = r.pos;
          line = r.line;
        } else {
          let raw;
          if (segs === null) {
            raw = text.slice(segStart, closedAt);
          } else {
            segs.push(text.slice(segStart, closedAt));
            raw = segs.join('"');
          }
          const f = finishQuoted(raw, line);
          value = f.value;
          line = f.line;
          pos = closedAt + 1;
          if (pos >= len) {
            ended = END;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = COMMA;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              ended = LINE_BREAK;
            } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              ended = LINE_BREAK;
            } else {
              // What follows the closing quote is appended as it stands, up to
              // the next comma or line break.
              const r = scanUnquoted(text, len, pos, line, value, recordLine, recordRow, errors);
              value = r.value;
              ended = r.ended;
              pos = r.pos;
              line = r.line;
              if (r.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
            }
          }
        }
      } else {
        // Unquoted field, scanned inline: the next comma or line break ends
        // it, and a lone CR inside it is dropped (stray_cr).
        lastQuoted = false;
        let start = pos;
        let parts = null;
        for (;;) {
          const comma = text.indexOf(',', pos);
          const lf = text.indexOf('\n', pos);
          let end = len;
          let kind = END;
          if (comma !== -1 && comma < end) {
            end = comma;
            kind = COMMA;
          }
          if (lf !== -1 && lf < end) {
            end = lf;
            kind = LINE_BREAK;
          }
          // A CR inside [pos, end): the only way one hides from the two scans.
          let r = -1;
          for (let i = pos; i < end; i++) {
            if (text.charCodeAt(i) === 13) {
              r = i;
              break;
            }
          }
          if (r !== -1) {
            if (text.charCodeAt(r + 1) === 10) {
              // CRLF: the record ends here.
              value = parts === null ? text.slice(start, r) : parts.join('') + text.slice(start, r);
              pos = r + 2;
              line += 1;
              ended = LINE_BREAK;
              break;
            }
            // A lone CR: dropped, and the field goes on.
            errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
            if (parts === null) parts = [];
            parts.push(text.slice(start, r));
            pos = r + 1;
            start = pos;
            continue;
          }
          value = parts === null ? text.slice(start, end) : parts.join('') + text.slice(start, end);
          if (kind === COMMA) {
            pos = end + 1;
            ended = COMMA;
          } else if (kind === LINE_BREAK) {
            pos = end + 1;
            line += 1;
            ended = LINE_BREAK;
          } else {
            pos = len;
            ended = END;
          }
          break;
        }
      }
      fields.push(value);
      if (ended !== COMMA) break;
    }

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
    } else {
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
    }
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
