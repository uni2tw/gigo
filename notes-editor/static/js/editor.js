window.NotesEditor = (function () {
  var container = null;
  var blocks = [];
  var onChange = null;
  var idCounter = 0;
  var openDropdown = null;
  var floatingToolbar = null;
  var history = [];
  var historyIndex = -1;
  var lastSnapshotTime = 0;
  var HISTORY_LIMIT = 100;
  var COALESCE_MS = 600;

  var FORMAT_OPTIONS = [
    { label: '標題 1', type: 'heading', level: 1 },
    { label: '標題 2', type: 'heading', level: 2 },
    { label: '標題 3', type: 'heading', level: 3 },
    { label: '引用', type: 'quote', level: 0 },
    { label: '編號清單', type: 'ordered_item', level: 0 },
    { label: '待辦清單', type: 'checklist_item', level: 0 },
    { label: '一般文字', type: 'list_item', level: 0 },
    { label: '表格', type: 'table', level: 0 },
  ];

  var INLINE_BUTTONS = [
    { label: 'B', cmd: 'bold', title: '粗體', style: 'font-weight:700;' },
    { label: 'I', cmd: 'italic', title: '斜體', style: 'font-style:italic;' },
    { label: 'S', cmd: 'strikeThrough', title: '刪除線', style: 'text-decoration:line-through;' },
    { label: '</>', cmd: 'code', title: '行內程式碼', style: 'font-family:monospace;' },
    { label: '🔗', cmd: 'link', title: '連結', style: '' },
  ];

  var FONT_SIZE_OPTIONS = [
    { label: '小', px: 12 },
    { label: '一般', px: null },
    { label: '大', px: 20 },
    { label: '特大', px: 26 },
  ];

  function nextId() {
    idCounter += 1;
    return 'b' + idCounter;
  }

  function assignIds(list) {
    list.forEach(function (b) {
      b._id = nextId();
      b.children = b.children || [];
      assignIds(b.children);
    });
  }

  function init(containerEl, callbacks) {
    container = containerEl;
    onChange = (callbacks && callbacks.onChange) || function () {};
    document.addEventListener('click', function () {
      closeOpenDropdown();
    });
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('keydown', function (e) {
      if (container.hidden) {
        return;
      }
      var active = document.activeElement;
      if (active && active !== document.body && !container.contains(active)) {
        return;
      }
      var isCtrl = e.ctrlKey || e.metaKey;
      var key = e.key.toLowerCase();
      if (isCtrl && !e.altKey && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      if (isCtrl && !e.altKey && ((key === 'z' && e.shiftKey) || key === 'y')) {
        e.preventDefault();
        redo();
      }
    });
  }

  function setFromPlainBlocks(plainBlocks) {
    blocks = (plainBlocks && plainBlocks.length)
      ? plainBlocks
      : [{ type: 'list_item', text: '', level: 0, children: [], checked: false }];
    assignIds(blocks);
    render();
  }

  function load(newBlocks) {
    setFromPlainBlocks(newBlocks);
    resetHistory();
  }

  function loadFromMarkdownSource(text) {
    setFromPlainBlocks(window.NotesMarkdown.parseMarkdownToBlocks(text || ''));
    pushHistory(true);
  }

  // -- Undo / redo history -----------------------------------------------

  function snapshotBlocks() {
    return JSON.stringify(stripInternal(blocks));
  }

  function resetHistory() {
    history = [snapshotBlocks()];
    historyIndex = 0;
    lastSnapshotTime = Date.now();
  }

  function pushHistory(forceNewEntry) {
    var snap = snapshotBlocks();
    if (historyIndex >= 0 && history[historyIndex] === snap) {
      return;
    }
    var now = Date.now();
    if (!forceNewEntry && historyIndex >= 0 && (now - lastSnapshotTime) < COALESCE_MS) {
      history[historyIndex] = snap;
    } else {
      history = history.slice(0, historyIndex + 1);
      history.push(snap);
      historyIndex = history.length - 1;
      if (history.length > HISTORY_LIMIT) {
        history.shift();
        historyIndex -= 1;
      }
    }
    lastSnapshotTime = now;
  }

  function commitChange(forceNewEntry) {
    pushHistory(forceNewEntry);
    onChange();
  }

  function restoreSnapshot(snapJson) {
    var plain = JSON.parse(snapJson);
    blocks = plain.length ? plain : [{ type: 'list_item', text: '', level: 0, children: [], checked: false }];
    assignIds(blocks);
    render();
    onChange();
  }

  function undo() {
    if (historyIndex <= 0) {
      return;
    }
    historyIndex -= 1;
    restoreSnapshot(history[historyIndex]);
  }

  function redo() {
    if (historyIndex >= history.length - 1) {
      return;
    }
    historyIndex += 1;
    restoreSnapshot(history[historyIndex]);
  }

  function getBlocks() {
    return stripInternal(blocks);
  }

  function getMarkdownSource() {
    return window.NotesMarkdown.blocksToMarkdown(getBlocks());
  }

  function stripInternal(list) {
    return list.map(function (b) {
      return {
        type: b.type,
        text: b.text,
        level: b.level || 0,
        checked: !!b.checked,
        rows: b.rows || [],
        align: b.align || [],
        children: stripInternal(b.children || []),
      };
    });
  }

  function findParentList(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i]._id === id) {
        return list;
      }
      var found = findParentList(list[i].children, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findBlock(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i]._id === id) {
        return list[i];
      }
      var found = findBlock(list[i].children, id);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function findOwnerBlock(list, childList) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].children === childList) {
        return list[i];
      }
      var found = findOwnerBlock(list[i].children, childList);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function closeOpenDropdown() {
    if (openDropdown) {
      openDropdown.hidden = true;
      openDropdown = null;
    }
  }

  function render() {
    openDropdown = null;
    container.innerHTML = '';
    container.appendChild(renderList(blocks));
  }

  function renderList(list) {
    var wrapper = document.createElement('div');
    var orderedCounter = 0;
    list.forEach(function (block) {
      if (block.type === 'ordered_item') {
        orderedCounter += 1;
      } else {
        orderedCounter = 0;
      }
      wrapper.appendChild(renderBlock(block, orderedCounter));
    });
    return wrapper;
  }

  function addTableRow(block) {
    var colCount = block.rows[0] ? block.rows[0].length : 1;
    var newRow = [];
    for (var i = 0; i < colCount; i++) {
      newRow.push('');
    }
    block.rows.push(newRow);
    render();
    focusTableCell(block._id, block.rows.length - 1, 0);
    commitChange(true);
  }

  function removeTableRow(block, rowIndex) {
    if (rowIndex <= 0 || rowIndex >= block.rows.length) {
      return;
    }
    block.rows.splice(rowIndex, 1);
    render();
    commitChange(true);
  }

  function addTableColumn(block) {
    block.rows.forEach(function (r) {
      r.push('');
    });
    block.align = block.align || [];
    block.align.push(null);
    render();
    focusTableCell(block._id, 0, block.rows[0].length - 1);
    commitChange(true);
  }

  function removeTableColumn(block, colIndex) {
    if (!block.rows[0] || block.rows[0].length <= 1) {
      return;
    }
    block.rows.forEach(function (r) {
      r.splice(colIndex, 1);
    });
    if (block.align) {
      block.align.splice(colIndex, 1);
    }
    render();
    commitChange(true);
  }

  function focusTableCell(blockId, rowIndex, colIndex) {
    setTimeout(function () {
      var rowEl = container.querySelector('[data-id="' + blockId + '"]');
      if (!rowEl) {
        return;
      }
      var trs = rowEl.querySelectorAll('tbody > tr');
      var tr = trs[rowIndex];
      if (!tr) {
        return;
      }
      var cell = tr.querySelector('[data-col="' + colIndex + '"]');
      if (!cell) {
        return;
      }
      cell.focus();
      var range = document.createRange();
      range.selectNodeContents(cell);
      range.collapse(false);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  function renderTableBlock(block) {
    var group = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'block-row block-table-row';
    row.dataset.id = block._id;

    var table = document.createElement('table');
    table.className = 'block-table';
    var tbody = document.createElement('tbody');
    var colCount = block.rows[0] ? block.rows[0].length : 0;

    (block.rows || []).forEach(function (rowCells, rowIndex) {
      var tr = document.createElement('tr');

      var cornerCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      cornerCell.className = 'block-table-control-cell';
      if (rowIndex > 0) {
        var delRowBtn = document.createElement('button');
        delRowBtn.type = 'button';
        delRowBtn.className = 'block-table-del-row';
        delRowBtn.title = '刪除這一列';
        delRowBtn.textContent = '×';
        delRowBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          removeTableRow(block, rowIndex);
        });
        cornerCell.appendChild(delRowBtn);
      }
      tr.appendChild(cornerCell);

      rowCells.forEach(function (cellText, colIndex) {
        var cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
        var align = block.align && block.align[colIndex];
        if (align) {
          cell.style.textAlign = align;
        }

        var text = document.createElement('span');
        text.className = 'block-table-cell-text';
        text.contentEditable = 'true';
        text.dataset.col = String(colIndex);
        text.innerHTML = window.NotesMarkdown.inlineMarkdownToHtml(cellText);
        text.addEventListener('input', function () {
          block.rows[rowIndex][colIndex] = window.NotesMarkdown.htmlToInlineMarkdown(text);
          commitChange(false);
        });
        text.addEventListener('keydown', function (e) {
          if (e.key !== 'Tab') {
            return;
          }
          e.preventDefault();
          var totalCols = block.rows[rowIndex].length;
          if (!e.shiftKey) {
            if (colIndex + 1 < totalCols) {
              focusTableCell(block._id, rowIndex, colIndex + 1);
            } else if (rowIndex + 1 < block.rows.length) {
              focusTableCell(block._id, rowIndex + 1, 0);
            } else {
              addTableRow(block);
            }
          } else if (colIndex - 1 >= 0) {
            focusTableCell(block._id, rowIndex, colIndex - 1);
          } else if (rowIndex - 1 >= 0) {
            focusTableCell(block._id, rowIndex - 1, totalCols - 1);
          }
        });
        cell.appendChild(text);

        if (rowIndex === 0) {
          var delColBtn = document.createElement('button');
          delColBtn.type = 'button';
          delColBtn.className = 'block-table-del-col';
          delColBtn.title = '刪除這一欄';
          delColBtn.textContent = '×';
          delColBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            removeTableColumn(block, colIndex);
          });
          cell.appendChild(delColBtn);
        }

        tr.appendChild(cell);
      });

      if (rowIndex === 0) {
        var addColCell = document.createElement('th');
        addColCell.className = 'block-table-control-cell';
        var addColBtn = document.createElement('button');
        addColBtn.type = 'button';
        addColBtn.className = 'block-table-add-col';
        addColBtn.title = '新增一欄';
        addColBtn.textContent = '+';
        addColBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          addTableColumn(block);
        });
        addColCell.appendChild(addColBtn);
        tr.appendChild(addColCell);
      }

      tbody.appendChild(tr);
    });

    var addRowTr = document.createElement('tr');
    var addRowCell = document.createElement('td');
    addRowCell.className = 'block-table-control-cell block-table-add-row-cell';
    addRowCell.colSpan = colCount + 2;
    var addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'block-table-add-row';
    addRowBtn.title = '新增一列';
    addRowBtn.textContent = '+ 新增列';
    addRowBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      addTableRow(block);
    });
    addRowCell.appendChild(addRowBtn);
    addRowTr.appendChild(addRowCell);
    tbody.appendChild(addRowTr);

    table.appendChild(tbody);
    row.appendChild(table);
    group.appendChild(row);
    return group;
  }

  function renderBlock(block, orderedIndex) {
    if (block.type === 'table') {
      return renderTableBlock(block);
    }

    var group = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'block-row' + (block.type === 'quote' ? ' block-quote' : '');
    row.dataset.id = block._id;

    var toggle = document.createElement('span');
    toggle.className = 'block-collapse-toggle';
    if (block.children && block.children.length) {
      toggle.textContent = block._collapsed ? '▸' : '▾';
      toggle.addEventListener('click', function () {
        block._collapsed = !block._collapsed;
        render();
      });
    } else {
      toggle.textContent = '';
    }

    var formatMenu = renderFormatMenu(block);
    var marker = renderMarker(block, orderedIndex);

    var text = document.createElement('div');
    text.className = 'block-text' + (block.type === 'checklist_item' && block.checked ? ' checked-text' : '');
    text.contentEditable = 'true';
    text.innerHTML = window.NotesMarkdown.inlineMarkdownToHtml(block.text);
    if (block.type === 'heading') {
      text.dataset.headingLevel = String(block.level || 1);
    }

    text.addEventListener('input', function () {
      handleInput(block, text);
    });
    text.addEventListener('keydown', function (e) {
      handleKeydown(e, block, text);
    });

    row.appendChild(formatMenu);
    row.appendChild(toggle);
    if (marker) {
      row.appendChild(marker);
    }
    row.appendChild(text);
    group.appendChild(row);

    if (block.children && block.children.length) {
      var childrenWrap = document.createElement('div');
      childrenWrap.className = 'block-children' + (block._collapsed ? ' collapsed' : '');
      childrenWrap.appendChild(renderList(block.children));
      group.appendChild(childrenWrap);
    }

    return group;
  }

  function renderMarker(block, orderedIndex) {
    if (block.type === 'checklist_item') {
      var checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'block-checkbox';
      checkbox.checked = !!block.checked;
      checkbox.addEventListener('click', function (e) {
        e.stopPropagation();
        block.checked = checkbox.checked;
        commitChange(true);
        render();
      });
      return checkbox;
    }

    if (block.type !== 'list_item' && block.type !== 'ordered_item') {
      return null;
    }

    var marker = document.createElement('span');
    marker.className = 'block-bullet';
    if (block.type === 'list_item') {
      marker.textContent = '•';
    } else {
      marker.className += ' block-bullet-ordered';
      marker.textContent = orderedIndex + '.';
    }
    return marker;
  }

  function renderFormatMenu(block) {
    var menu = document.createElement('div');
    menu.className = 'block-format-menu';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'block-format-trigger';
    trigger.title = '調整格式';
    trigger.textContent = 'Aa';

    var dropdown = document.createElement('div');
    dropdown.className = 'block-format-dropdown';
    dropdown.hidden = true;

    FORMAT_OPTIONS.forEach(function (opt) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.textContent = opt.label;
      optBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        var previousText = block.text;
        block.type = opt.type;
        block.level = opt.level;
        closeOpenDropdown();
        if (opt.type === 'table') {
          block.rows = [[previousText || '', ''], ['', '']];
          block.align = [null, null];
          render();
          focusTableCell(block._id, 0, 0);
        } else {
          render();
          focusBlock(block._id, true);
        }
        commitChange(true);
      });
      dropdown.appendChild(optBtn);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openDropdown === dropdown) {
        closeOpenDropdown();
        return;
      }
      closeOpenDropdown();
      dropdown.hidden = false;
      openDropdown = dropdown;
    });

    menu.appendChild(trigger);
    menu.appendChild(dropdown);
    return menu;
  }

  function handleInput(block, textEl) {
    var raw = textEl.textContent;
    var headingMatch = /^(#{1,6})\s+(.*)$/.exec(raw);
    if (headingMatch) {
      block.type = 'heading';
      block.level = headingMatch[1].length;
      block.text = headingMatch[2];
      render();
      focusBlock(block._id, true);
      commitChange(true);
      return;
    }
    block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    commitChange(false);
  }

  function handleKeydown(e, block, textEl) {
    var isCtrl = e.ctrlKey || e.metaKey;
    var key = e.key.toLowerCase();

    if (isCtrl && e.altKey && ['0', '1', '2', '3'].indexOf(e.key) !== -1) {
      e.preventDefault();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
      if (e.key === '0') {
        block.type = 'list_item';
        block.level = 0;
      } else {
        block.type = 'heading';
        block.level = Number(e.key);
      }
      render();
      focusBlock(block._id, true);
      commitChange(true);
      return;
    }
    if (isCtrl && !e.altKey && key === 'b') {
      e.preventDefault();
      applyInlineCommand('bold');
      return;
    }
    if (isCtrl && !e.altKey && key === 'i') {
      e.preventDefault();
      applyInlineCommand('italic');
      return;
    }
    if (isCtrl && e.shiftKey && key === 'x') {
      e.preventDefault();
      applyInlineCommand('strikeThrough');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (textEl.textContent === '' && CONTINUABLE_TYPES.indexOf(block.type) !== -1) {
        block.type = 'paragraph';
        block.checked = false;
        render();
        focusBlock(block._id, true);
        commitChange(true);
        return;
      }
      var split = splitAtCaret(textEl);
      if (split.atStart && !split.atEnd) {
        insertEmptySiblingBefore(block);
      } else {
        block.text = window.NotesMarkdown.htmlToInlineMarkdown(split.beforeNode);
        var afterText = window.NotesMarkdown.htmlToInlineMarkdown(split.afterNode);
        insertSiblingAfter(block, afterText);
      }
      commitChange(true);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
      if (e.shiftKey) {
        outdentBlock(block._id);
      } else {
        indentBlock(block._id);
      }
      commitChange(true);
    } else if (e.key === 'Backspace' && textEl.textContent === '') {
      e.preventDefault();
      removeBlock(block._id);
      commitChange(true);
    } else if (e.key === 'Backspace' && isCaretAtStart(textEl)) {
      e.preventDefault();
      if (mergeIntoPreviousBlock(block, textEl)) {
        commitChange(true);
      }
    } else if (e.key === 'ArrowUp' && e.ctrlKey) {
      e.preventDefault();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
      moveBlock(block._id, -1);
      commitChange(true);
    } else if (e.key === 'ArrowDown' && e.ctrlKey) {
      e.preventDefault();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
      moveBlock(block._id, 1);
      commitChange(true);
    } else if (e.key === 'ArrowUp' && !e.shiftKey && !e.altKey) {
      var prevId = adjacentVisibleBlockId(block._id, -1);
      if (prevId) {
        e.preventDefault();
        block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
        focusBlock(prevId, true);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey) {
      var nextId = adjacentVisibleBlockId(block._id, 1);
      if (nextId) {
        e.preventDefault();
        block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
        focusBlock(nextId, false);
      }
    }
  }

  function flattenVisibleBlocks(list, out) {
    list.forEach(function (b) {
      out.push(b);
      if (b.children && b.children.length && !b._collapsed) {
        flattenVisibleBlocks(b.children, out);
      }
    });
    return out;
  }

  function adjacentVisibleBlockId(id, delta) {
    var seq = flattenVisibleBlocks(blocks, []);
    var idx = -1;
    for (var i = 0; i < seq.length; i++) {
      if (seq[i]._id === id) {
        idx = i;
        break;
      }
    }
    var targetIdx = idx + delta;
    if (idx === -1 || targetIdx < 0 || targetIdx >= seq.length) {
      return null;
    }
    return seq[targetIdx]._id;
  }

  function splitAtCaret(textEl) {
    var sel = window.getSelection();
    if (!sel.rangeCount) {
      var wholeDiv = document.createElement('div');
      wholeDiv.innerHTML = textEl.innerHTML;
      return { beforeNode: wholeDiv, afterNode: document.createElement('div'), atStart: false, atEnd: true };
    }
    var range = sel.getRangeAt(0);
    if (!range.collapsed) {
      range.deleteContents();
    }

    var beforeRange = document.createRange();
    beforeRange.selectNodeContents(textEl);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    var afterRange = document.createRange();
    afterRange.selectNodeContents(textEl);
    afterRange.setStart(range.startContainer, range.startOffset);

    var beforeDiv = document.createElement('div');
    beforeDiv.appendChild(beforeRange.cloneContents());
    var afterDiv = document.createElement('div');
    afterDiv.appendChild(afterRange.cloneContents());

    return {
      beforeNode: beforeDiv,
      afterNode: afterDiv,
      atStart: beforeDiv.textContent.length === 0,
      atEnd: afterDiv.textContent.length === 0,
    };
  }

  function isCaretAtStart(textEl) {
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) {
      return false;
    }
    var range = sel.getRangeAt(0);
    if (!textEl.contains(range.startContainer)) {
      return false;
    }
    var probe = document.createRange();
    probe.selectNodeContents(textEl);
    probe.setEnd(range.startContainer, range.startOffset);
    return probe.toString().length === 0;
  }

  var CONTINUABLE_TYPES = ['list_item', 'ordered_item', 'checklist_item'];

  function insertSiblingAfter(block, initialText) {
    var list = findParentList(blocks, block._id);
    var idx = list.indexOf(block);
    var continued = CONTINUABLE_TYPES.indexOf(block.type) !== -1;
    var newBlock = {
      type: continued ? block.type : 'paragraph',
      text: initialText || '',
      level: 0,
      children: [],
      checked: false,
      _id: nextId(),
    };
    list.splice(idx + 1, 0, newBlock);
    render();
    focusBlock(newBlock._id, false);
  }

  function insertEmptySiblingBefore(block) {
    var list = findParentList(blocks, block._id);
    var idx = list.indexOf(block);
    var newBlock = { type: 'list_item', text: '', level: 0, children: [], checked: false, _id: nextId() };
    list.splice(idx, 0, newBlock);
    render();
    focusBlock(block._id, false);
  }

  function removeBlock(id) {
    var list = findParentList(blocks, id);
    if (!list) {
      return;
    }
    if (list === blocks && list.length <= 1) {
      return;
    }
    var block = findBlock(blocks, id);
    var idx = list.indexOf(block);

    list.splice(idx, 1);
    var orphans = block.children || [];
    for (var i = 0; i < orphans.length; i++) {
      list.splice(idx + i, 0, orphans[i]);
    }

    render();

    if (list.length > 0) {
      var focusIdx = Math.max(0, idx - 1);
      focusBlock(list[focusIdx]._id, true);
    } else {
      var ownerBlock = findOwnerBlock(blocks, list);
      if (ownerBlock) {
        focusBlock(ownerBlock._id, true);
      }
    }
  }

  function mergeIntoPreviousBlock(block, textEl) {
    var prevId = adjacentVisibleBlockId(block._id, -1);
    if (!prevId) {
      return false;
    }
    var prevBlock = findBlock(blocks, prevId);
    var list = findParentList(blocks, block._id);
    if (!prevBlock || !list || prevBlock.type === 'table') {
      return false;
    }

    var probe = document.createElement('div');
    probe.innerHTML = window.NotesMarkdown.inlineMarkdownToHtml(prevBlock.text || '');
    var joinOffset = probe.textContent.length;

    var currentText = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    prevBlock.text = (prevBlock.text || '') + currentText;

    var idx = list.indexOf(block);
    list.splice(idx, 1);
    var orphans = block.children || [];
    for (var i = 0; i < orphans.length; i++) {
      list.splice(idx + i, 0, orphans[i]);
    }

    render();
    focusBlockAtTextOffset(prevBlock._id, joinOffset);
    return true;
  }

  function focusBlockAtTextOffset(id, offset) {
    setTimeout(function () {
      var row = container.querySelector('[data-id="' + id + '"] .block-text');
      if (!row) {
        return;
      }
      row.focus();
      var walker = document.createTreeWalker(row, NodeFilter.SHOW_TEXT, null, false);
      var remaining = offset;
      var node = walker.nextNode();
      var range = document.createRange();
      var sel = window.getSelection();
      while (node) {
        if (remaining <= node.textContent.length) {
          range.setStart(node, remaining);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          return;
        }
        remaining -= node.textContent.length;
        node = walker.nextNode();
      }
      range.selectNodeContents(row);
      range.collapse(offset <= 0);
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  function indentBlock(id) {
    var list = findParentList(blocks, id);
    if (!list) {
      return;
    }
    var block = findBlock(blocks, id);
    var idx = list.indexOf(block);
    if (idx <= 0) {
      return;
    }
    var newParent = list[idx - 1];
    list.splice(idx, 1);
    newParent.children = newParent.children || [];
    newParent.children.push(block);
    render();
    focusBlock(id, true);
  }

  function outdentBlock(id) {
    var list = findParentList(blocks, id);
    if (!list || list === blocks) {
      return;
    }
    var block = findBlock(blocks, id);
    var ownerBlock = findOwnerBlock(blocks, list);
    if (!ownerBlock) {
      return;
    }
    var grandList = findParentList(blocks, ownerBlock._id);
    if (!grandList) {
      return;
    }

    var idx = list.indexOf(block);
    var ownerIdx = grandList.indexOf(ownerBlock);
    list.splice(idx, 1);
    grandList.splice(ownerIdx + 1, 0, block);
    render();
    focusBlock(id, true);
  }

  function moveBlock(id, delta) {
    var list = findParentList(blocks, id);
    var block = findBlock(blocks, id);
    var idx = list.indexOf(block);
    var target = idx + delta;
    if (target < 0 || target >= list.length) {
      return;
    }
    list.splice(idx, 1);
    list.splice(target, 0, block);
    render();
    focusBlock(id, true);
  }

  function focusBlock(id, atEnd) {
    setTimeout(function () {
      var row = container.querySelector('[data-id="' + id + '"] .block-text');
      if (!row) {
        return;
      }
      row.focus();
      var range = document.createRange();
      range.selectNodeContents(row);
      range.collapse(!atEnd);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }, 0);
  }

  // -- Inline formatting: floating selection toolbar --------------------

  function findBlockTextAncestor(node) {
    var el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && !(el.classList && el.classList.contains('block-text'))) {
      el = el.parentElement;
    }
    return el;
  }

  function findAncestorTag(node, tagName) {
    var el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el.classList && !el.classList.contains('block-text')) {
      if (el.tagName === tagName) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function unwrapElement(el) {
    var parent = el.parentNode;
    while (el.firstChild) {
      parent.insertBefore(el.firstChild, el);
    }
    parent.removeChild(el);
  }

  function toggleInlineWrap(tagName) {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      return;
    }
    var range = sel.getRangeAt(0);
    var upperTag = tagName.toUpperCase();
    var existing = findAncestorTag(range.commonAncestorContainer, upperTag);
    if (existing) {
      unwrapElement(existing);
      return;
    }
    var wrapper = document.createElement(tagName);
    try {
      range.surroundContents(wrapper);
    } catch (e) {
      var contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
    }
    var newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);
  }

  function ensureFloatingToolbar() {
    if (floatingToolbar) {
      return floatingToolbar;
    }
    floatingToolbar = document.createElement('div');
    floatingToolbar.className = 'inline-toolbar';
    floatingToolbar.hidden = true;

    floatingToolbar.appendChild(renderFontSizePicker());

    INLINE_BUTTONS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-toolbar-btn';
      btn.style.cssText = b.style;
      btn.textContent = b.label;
      btn.title = b.title;
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        applyInlineCommand(b.cmd);
      });
      floatingToolbar.appendChild(btn);
    });

    document.body.appendChild(floatingToolbar);
    return floatingToolbar;
  }

  function renderFontSizePicker() {
    var wrapper = document.createElement('div');
    wrapper.className = 'inline-size-picker';

    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'inline-toolbar-btn';
    trigger.title = '文字大小';
    trigger.textContent = 'A';
    trigger.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });

    var dropdown = document.createElement('div');
    dropdown.className = 'inline-size-dropdown';
    dropdown.hidden = true;

    FONT_SIZE_OPTIONS.forEach(function (opt) {
      var optBtn = document.createElement('button');
      optBtn.type = 'button';
      optBtn.textContent = opt.label;
      optBtn.addEventListener('mousedown', function (e) {
        e.preventDefault();
      });
      optBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOpenDropdown();
        applyFontSize(opt.px);
      });
      dropdown.appendChild(optBtn);
    });

    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (openDropdown === dropdown) {
        closeOpenDropdown();
        return;
      }
      closeOpenDropdown();
      dropdown.hidden = false;
      openDropdown = dropdown;
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(dropdown);
    return wrapper;
  }

  function findAncestorFontSizeSpan(node) {
    var el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    while (el && el.classList && !el.classList.contains('block-text')) {
      if (el.tagName === 'SPAN' && el.style && el.style.fontSize) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  function applyFontSize(px) {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      return;
    }
    var range = sel.getRangeAt(0);
    var textEl = findBlockTextAncestor(range.commonAncestorContainer);
    if (!textEl || !container.contains(textEl)) {
      return;
    }
    var blockId = textEl.closest('[data-id]').dataset.id;
    var block = findBlock(blocks, blockId);
    if (!block) {
      return;
    }

    if (!px) {
      var existing = findAncestorFontSizeSpan(range.commonAncestorContainer);
      if (existing) {
        unwrapElement(existing);
      }
      syncAfterCommand(block, textEl);
      return;
    }

    var wrapper = document.createElement('span');
    wrapper.style.fontSize = px + 'px';
    try {
      range.surroundContents(wrapper);
    } catch (e) {
      var contents = range.extractContents();
      wrapper.appendChild(contents);
      range.insertNode(wrapper);
    }
    var newRange = document.createRange();
    newRange.selectNodeContents(wrapper);
    sel.removeAllRanges();
    sel.addRange(newRange);

    syncAfterCommand(block, textEl);
  }

  function applyInlineCommand(cmd) {
    var sel = window.getSelection();
    if (!sel.rangeCount) {
      return;
    }
    var range = sel.getRangeAt(0);
    var textEl = findBlockTextAncestor(range.commonAncestorContainer);
    if (!textEl || !container.contains(textEl)) {
      return;
    }
    var blockId = textEl.closest('[data-id]').dataset.id;
    var block = findBlock(blocks, blockId);
    if (!block) {
      return;
    }

    if (cmd === 'bold' || cmd === 'italic' || cmd === 'strikeThrough') {
      document.execCommand(cmd, false, null);
      syncAfterCommand(block, textEl);
    } else if (cmd === 'code') {
      toggleInlineWrap('code');
      syncAfterCommand(block, textEl);
    } else if (cmd === 'link') {
      var existingLink = findAncestorTag(range.commonAncestorContainer, 'A');
      if (existingLink) {
        document.execCommand('unlink', false, null);
        syncAfterCommand(block, textEl);
        return;
      }
      var savedRange = range.cloneRange();
      window.NotesModal.prompt('輸入連結網址', 'https://').then(function (url) {
        if (!url) {
          return;
        }
        var s = window.getSelection();
        s.removeAllRanges();
        s.addRange(savedRange);
        document.execCommand('createLink', false, url);
        syncAfterCommand(block, textEl);
      });
    }
  }

  function syncAfterCommand(block, textEl) {
    block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    commitChange(true);
    hideFloatingToolbar();
  }

  function handleSelectionChange() {
    var sel = window.getSelection();
    if (!sel.rangeCount || sel.isCollapsed) {
      hideFloatingToolbar();
      return;
    }
    var range = sel.getRangeAt(0);
    var textEl = findBlockTextAncestor(range.commonAncestorContainer);
    if (!textEl || !container || !container.contains(textEl)) {
      hideFloatingToolbar();
      return;
    }
    showFloatingToolbarAt(range);
  }

  function showFloatingToolbarAt(range) {
    var toolbar = ensureFloatingToolbar();
    var rect = range.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      hideFloatingToolbar();
      return;
    }
    toolbar.hidden = false;
    var top = rect.top - toolbar.offsetHeight - 8;
    var left = rect.left + (rect.width / 2) - (toolbar.offsetWidth / 2);
    toolbar.style.top = Math.max(8, top) + 'px';
    toolbar.style.left = Math.max(8, left) + 'px';
  }

  function hideFloatingToolbar() {
    if (floatingToolbar) {
      floatingToolbar.hidden = true;
    }
  }

  return {
    init: init,
    load: load,
    getBlocks: getBlocks,
    getMarkdownSource: getMarkdownSource,
    loadFromMarkdownSource: loadFromMarkdownSource,
  };
})();
