window.NotesHighlight = (function () {
  // Tiny hand-written highlighters for the two languages the code blocks need
  // (SQL and JSON). Each returns an HTML string whose text content is exactly
  // the input text, so it can be stacked behind a transparent <textarea>.

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function span(cls, text) {
    return '<span class="hl-' + cls + '">' + escapeHtml(text) + '</span>';
  }

  // Runs `re` (must be global) over `text`; `classify(match)` returns a class
  // name or null (leave unstyled). Unmatched stretches are just escaped.
  function scan(text, re, classify) {
    var out = '';
    var last = 0;
    var m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      if (m[0] === '') {
        re.lastIndex += 1;
        continue;
      }
      out += escapeHtml(text.slice(last, m.index));
      var cls = classify(m, text);
      out += cls ? span(cls, m[0]) : escapeHtml(m[0]);
      last = m.index + m[0].length;
    }
    return out + escapeHtml(text.slice(last));
  }

  var JSON_RE = /"(?:[^"\\\n]|\\.)*"?|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;

  function highlightJson(text) {
    return scan(text, JSON_RE, function (m, src) {
      var tok = m[0];
      if (tok.charAt(0) === '"') {
        var after = src.slice(m.index + tok.length).match(/^\s*:/);
        return after ? 'key' : 'string';
      }
      if (/^(true|false|null)$/.test(tok)) {
        return 'literal';
      }
      return 'number';
    });
  }

  function toSet(words) {
    var set = {};
    words.split(' ').forEach(function (w) { set[w] = true; });
    return set;
  }

  var SQL_KEYWORDS = toSet(
    'SELECT FROM WHERE JOIN INNER LEFT RIGHT FULL OUTER CROSS ON AND OR NOT IN IS NULL LIKE BETWEEN EXISTS AS ' +
    'GROUP BY ORDER HAVING DISTINCT TOP UNION ALL INSERT INTO VALUES UPDATE SET DELETE CREATE ALTER DROP TABLE ' +
    'INDEX VIEW PROCEDURE FUNCTION DATABASE ADD COLUMN PRIMARY KEY FOREIGN REFERENCES DEFAULT CONSTRAINT UNIQUE ' +
    'CHECK CASE WHEN THEN ELSE END WITH OVER PARTITION ASC DESC LIMIT OFFSET FETCH NEXT ROWS ONLY DECLARE BEGIN ' +
    'IF WHILE RETURN EXEC EXECUTE GO USE TRUNCATE MERGE USING MATCHED OUTPUT NOLOCK INT BIGINT SMALLINT TINYINT ' +
    'VARCHAR NVARCHAR CHAR NCHAR DATETIME DATETIME2 DATE TIME BIT DECIMAL NUMERIC FLOAT REAL TEXT IDENTITY TRAN ' +
    'TRANSACTION COMMIT ROLLBACK TRY CATCH GRANT REVOKE ESCAPE ANY SOME EXCEPT INTERSECT CAST CONVERT'
  );

  var SQL_FUNCTIONS = toSet(
    'COUNT SUM AVG MIN MAX COALESCE ISNULL NULLIF LEN SUBSTRING REPLACE GETDATE DATEADD DATEDIFF UPPER LOWER ' +
    'TRIM LTRIM RTRIM CONCAT ROUND ROW_NUMBER RANK DENSE_RANK FORMAT'
  );

  // Order matters: comments and strings must win over the word/number rules.
  var SQL_RE = /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*(?:'|$)|"[^"\n]*"?|\[[^\]\n]*\]?|`[^`\n]*`?|@@?[A-Za-z_][A-Za-z0-9_]*|\b\d+(?:\.\d+)?\b|[A-Za-z_][A-Za-z0-9_]*/g;

  function highlightSql(text) {
    return scan(text, SQL_RE, function (m) {
      var tok = m[0];
      var c = tok.charAt(0);
      if (c === '-' || (c === '/' && tok.charAt(1) === '*')) {
        return 'comment';
      }
      if (c === "'") {
        return 'string';
      }
      if (c === '"' || c === '[' || c === '`') {
        return 'ident';
      }
      if (c === '@') {
        return 'var';
      }
      if (/^\d/.test(tok)) {
        return 'number';
      }
      var upper = tok.toUpperCase();
      if (SQL_KEYWORDS[upper]) {
        return 'kw';
      }
      if (SQL_FUNCTIONS[upper]) {
        return 'fn';
      }
      return null;
    });
  }

  var LANGUAGES = {
    json: highlightJson,
    sql: highlightSql,
  };

  function supports(lang) {
    return Object.prototype.hasOwnProperty.call(LANGUAGES, lang);
  }

  function highlight(lang, text) {
    return supports(lang) ? LANGUAGES[lang](text) : null;
  }

  return { supports: supports, highlight: highlight };
})();
