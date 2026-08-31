window.NotesMarkdown = (function () {
  var INDENT_SIZE = 2;
  var HEADING_RE = /^(#{1,6})\s+(.*)$/;
  var QUOTE_RE = /^>\s?(.*)$/;
  var CHECKLIST_RE = /^( *)[-*]\s+\[([ xX])\]\s+(.*)$/;
  var ORDERED_RE = /^( *)(\d+)\.\s+(.*)$/;
  var LIST_RE = /^( *)([-*])\s+(.*)$/;
  var TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
  var TABLE_SEP_CELL_RE = /^:?-+:?$/;
  var IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;

  function repeatStr(s, n) {
    var out = '';
    for (var i = 0; i < n; i++) {
      out += s;
    }
    return out;
  }

  function repeatArray(value, n) {
    var out = [];
    for (var i = 0; i < n; i++) {
      out.push(value);
    }
    return out;
  }

  function splitTableRow(line) {
    var stripped = line.trim();
    if (stripped.charAt(0) === '|') {
      stripped = stripped.slice(1);
    }
    if (stripped.charAt(stripped.length - 1) === '|') {
      stripped = stripped.slice(0, -1);
    }
    return stripped.split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function isTableSeparatorRow(line) {
    if (!TABLE_ROW_RE.test(line)) {
      return false;
    }
    var cells = splitTableRow(line);
    return cells.length > 0 && cells.every(function (cell) {
      return TABLE_SEP_CELL_RE.test(cell);
    });
  }

  function parseTableAlign(sepCells) {
    return sepCells.map(function (cell) {
      var left = cell.charAt(0) === ':';
      var right = cell.charAt(cell.length - 1) === ':';
      if (left && right) {
        return 'center';
      }
      if (right) {
        return 'right';
      }
      if (left) {
        return 'left';
      }
      return null;
    });
  }

  function parseMarkdownToBlocks(text) {
    var blocks = [];
    var listStack = []; // [{depth, block}], current nesting chain
    var lines = text.split(/\r\n|\r|\n/);
    var i = 0;
    var n = lines.length;

    while (i < n) {
      var rawLine = lines[i];

      if (rawLine.replace(/\s/g, '') === '') {
        listStack = [];
        i += 1;
        continue;
      }

      if (TABLE_ROW_RE.test(rawLine) && i + 1 < n && isTableSeparatorRow(lines[i + 1])) {
        var rows = [splitTableRow(rawLine)];
        var align = parseTableAlign(splitTableRow(lines[i + 1]));
        i += 2;
        while (i < n && lines[i].replace(/\s/g, '') !== '' && TABLE_ROW_RE.test(lines[i])) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        blocks.push({ type: 'table', level: 0, text: '', children: [], checked: false, rows: rows, align: align });
        listStack = [];
        continue;
      }

      var imageMatch = IMAGE_RE.exec(rawLine.trim());
      if (imageMatch) {
        blocks.push({ type: 'image', level: 0, text: imageMatch[1], src: imageMatch[2], children: [], checked: false });
        listStack = [];
        i += 1;
        continue;
      }

      var headingMatch = HEADING_RE.exec(rawLine);
      if (headingMatch) {
        blocks.push({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2].trim(),
          children: [],
          checked: false,
        });
        listStack = [];
        i += 1;
        continue;
      }

      var quoteMatch = QUOTE_RE.exec(rawLine);
      if (quoteMatch) {
        blocks.push({ type: 'quote', level: 0, text: quoteMatch[1].trim(), children: [], checked: false });
        listStack = [];
        i += 1;
        continue;
      }

      var checklistMatch = CHECKLIST_RE.exec(rawLine);
      var orderedMatch = checklistMatch ? null : ORDERED_RE.exec(rawLine);
      var bulletMatch = (checklistMatch || orderedMatch) ? null : LIST_RE.exec(rawLine);

      if (checklistMatch || orderedMatch || bulletMatch) {
        var indent;
        var newBlock;
        if (checklistMatch) {
          indent = checklistMatch[1].length;
          newBlock = {
            type: 'checklist_item',
            level: 0,
            text: checklistMatch[3].trim(),
            children: [],
            checked: /x/i.test(checklistMatch[2]),
          };
        } else if (orderedMatch) {
          indent = orderedMatch[1].length;
          newBlock = { type: 'ordered_item', level: 0, text: orderedMatch[3].trim(), children: [], checked: false };
        } else {
          indent = bulletMatch[1].length;
          newBlock = { type: 'list_item', level: 0, text: bulletMatch[3].trim(), children: [], checked: false };
        }

        var depth = Math.floor(indent / INDENT_SIZE);
        listStack = listStack.filter(function (item) {
          return item.depth < depth;
        });
        if (listStack.length === 0) {
          blocks.push(newBlock);
        } else {
          listStack[listStack.length - 1].block.children.push(newBlock);
        }
        listStack.push({ depth: depth, block: newBlock });
        i += 1;
        continue;
      }

      blocks.push({ type: 'paragraph', level: 0, text: rawLine.trim(), children: [], checked: false });
      listStack = [];
      i += 1;
    }

    return blocks;
  }

  function formatTableRow(cells) {
    return '| ' + cells.join(' | ') + ' |';
  }

  function formatTableSeparator(align, colCount) {
    var parts = [];
    for (var i = 0; i < colCount; i++) {
      var a = align && align[i];
      if (a === 'center') {
        parts.push(':---:');
      } else if (a === 'right') {
        parts.push('---:');
      } else if (a === 'left') {
        parts.push(':---');
      } else {
        parts.push('---');
      }
    }
    return formatTableRow(parts);
  }

  function blocksToMarkdown(blocks) {
    var lines = [];

    function emit(list, depth) {
      var orderedCounter = 0;
      list.forEach(function (block) {
        if (block.type === 'ordered_item') {
          orderedCounter += 1;
        } else {
          orderedCounter = 0;
        }

        if (block.type === 'heading') {
          var level = Math.max(1, Math.min(6, block.level || 1));
          lines.push(repeatStr('#', level) + ' ' + block.text);
        } else if (block.type === 'quote') {
          lines.push('> ' + block.text);
        } else if (block.type === 'ordered_item') {
          lines.push(repeatStr(' ', depth * INDENT_SIZE) + orderedCounter + '. ' + block.text);
        } else if (block.type === 'checklist_item') {
          lines.push(repeatStr(' ', depth * INDENT_SIZE) + '- [' + (block.checked ? 'x' : ' ') + '] ' + block.text);
        } else if (block.type === 'list_item') {
          lines.push(repeatStr(' ', depth * INDENT_SIZE) + '- ' + block.text);
        } else if (block.type === 'image') {
          lines.push('![' + (block.text || '') + '](' + block.src + ')');
        } else if (block.type === 'table') {
          var rows = (block.rows && block.rows.length) ? block.rows : [['']];
          var colCount = Math.max.apply(null, rows.map(function (r) { return r.length; }));
          var header = rows[0].concat(repeatArray('', colCount - rows[0].length));
          lines.push(formatTableRow(header));
          lines.push(formatTableSeparator(block.align || [], colCount));
          rows.slice(1).forEach(function (r) {
            lines.push(formatTableRow(r.concat(repeatArray('', colCount - r.length))));
          });
        } else {
          lines.push(block.text);
        }

        if (block.children && block.children.length) {
          emit(block.children, depth + 1);
        }
      });
    }

    emit(blocks, 0);
    return lines.length ? lines.join('\n') + '\n' : '';
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var SIZE_SPAN_RE = /<span style="font-size:(\d+)px">([\s\S]*?)<\/span>/g;

  function inlineMarkdownToHtml(text) {
    if (!text) {
      return '';
    }

    var sizeSpans = [];
    var withoutSize = text.replace(SIZE_SPAN_RE, function (m, px, inner) {
      sizeSpans.push({ px: px, html: inlineMarkdownToHtml(inner) });
      return ' SIZESPAN' + (sizeSpans.length - 1) + ' ';
    });

    var codeSpans = [];
    var withoutCode = withoutSize.replace(/`([^`]+)`/g, function (m, p1) {
      codeSpans.push(p1);
      return ' CODE' + (codeSpans.length - 1) + ' ';
    });

    var html = escapeHtml(withoutCode);

    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, label, href) {
      return '<a href="' + escapeHtml(href) + '">' + label + '</a>';
    });
    html = html.replace(/\*\*\*([^*]+)\*\*\*/g, '<b><i>$1</i></b>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*(?!\*)/g, '$1<i>$2</i>');
    html = html.replace(/~~([^~]+)~~/g, '<s>$1</s>');

    html = html.replace(/ CODE(\d+) /g, function (m, idx) {
      return '<code>' + escapeHtml(codeSpans[Number(idx)]) + '</code>';
    });

    html = html.replace(/ SIZESPAN(\d+) /g, function (m, idx) {
      var s = sizeSpans[Number(idx)];
      return '<span style="font-size:' + s.px + 'px">' + s.html + '</span>';
    });

    return html;
  }

  var INLINE_WRAP_TAGS = { B: '**', STRONG: '**', I: '*', EM: '*', S: '~~', STRIKE: '~~', DEL: '~~' };

  function htmlToInlineMarkdown(rootNode) {
    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
      }
      var tag = node.tagName;
      if (tag === 'BR') {
        return '\n';
      }
      if (tag === 'CODE') {
        return '`' + node.textContent.replace(/`/g, "'") + '`';
      }
      if (tag === 'A') {
        var inner = Array.prototype.map.call(node.childNodes, walk).join('');
        return '[' + inner + '](' + (node.getAttribute('href') || '') + ')';
      }
      if (tag === 'SPAN' && node.style && node.style.fontSize) {
        var sizeInner = Array.prototype.map.call(node.childNodes, walk).join('');
        var px = parseInt(node.style.fontSize, 10) || 15;
        return '<span style="font-size:' + px + 'px">' + sizeInner + '</span>';
      }
      var innerContent = Array.prototype.map.call(node.childNodes, walk).join('');
      var wrap = INLINE_WRAP_TAGS[tag];
      if (wrap) {
        return wrap + innerContent + wrap;
      }
      return innerContent;
    }

    return Array.prototype.map.call(rootNode.childNodes, walk).join('');
  }

  return {
    parseMarkdownToBlocks: parseMarkdownToBlocks,
    blocksToMarkdown: blocksToMarkdown,
    inlineMarkdownToHtml: inlineMarkdownToHtml,
    htmlToInlineMarkdown: htmlToInlineMarkdown,
  };
})();
