window.NotesEditor = (function () {
  var container = null;
  var blocks = [];
  var onChange = null;
  var onImageUpload = null;
  var imageBaseDir = '';
  var idCounter = 0;
  var openDropdown = null;
  var floatingToolbar = null;
  var inlineButtonEls = {};
  var history = [];
  var historyIndex = -1;
  var lastSnapshotTime = 0;
  var HISTORY_LIMIT = 100;
  var COALESCE_MS = 600;

  var searchBar = null;
  var searchQueryInput = null;
  var searchReplaceInput = null;
  var searchCountEl = null;
  var searchReplaceRow = null;
  var searchCaseBtn = null;
  var searchRegexBtn = null;
  var searchMatches = [];
  var searchCurrentIndex = -1;
  var searchUseCase = false;
  var searchUseRegex = false;

  var linkCard = null;
  var linkCardUrlEl = null;
  var linkCardTargetEl = null;
  var linkCardHideTimer = null;
  var linkCardShowTimer = null;
  var linkCardPendingLinkEl = null;
  var LINK_CARD_HOVER_DELAY_MS = 500;
  var LINK_CARD_HIDE_DELAY_MS = 500;
  var linkOpenModifierActive = false;

  var lastFocusedBlockId = null;

  var FORMAT_OPTIONS = [
    { label: '標題 1', type: 'heading', level: 1 },
    { label: '標題 2', type: 'heading', level: 2 },
    { label: '標題 3', type: 'heading', level: 3 },
    { label: '引用', type: 'quote', level: 0 },
    { label: '編號清單', type: 'ordered_item', level: 0 },
    { label: '待辦清單', type: 'checklist_item', level: 0 },
    { label: '一般文字', type: 'list_item', level: 0 },
    { label: '表格', type: 'table', level: 0 },
    { label: '插入圖片', type: 'image', level: 0 },
    { label: '程式碼', type: 'code_block', level: 0 },
    { label: '提示框', type: 'callout', level: 0 },
  ];

  var ICON_LINK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"/></svg>';
  var ICON_MARK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';
  var ICON_CLEAR = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13l-6 6H7l-4-4 9-9 6 6-1 1z"/><path d="M9 20h10"/></svg>';
  var ICON_BULLET_LIST = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>';
  var ICON_LINK_OPEN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/><path d="M15 3h6v6"/><path d="M10 14 21 3"/></svg>';
  var ICON_LINK_EDIT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  var CALLOUT_KIND_CONFIG = {
    note: {
      label: '備註',
      color: '#0969da',
      bg: '#ddf4ff',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><circle cx="12" cy="7.5" r="0.9" fill="currentColor" stroke="none"/></svg>',
    },
    tip: {
      label: '提示',
      color: '#1a7f37',
      bg: '#dafbe1',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 .95 1 1.6V16h5v-.5c0-.65.4-1.15 1-1.6A6 6 0 0 0 12 3z"/></svg>',
    },
    important: {
      label: '重要',
      color: '#8250df',
      bg: '#fbefff',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10v4a1 1 0 0 0 1 1h2l4 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M16 9a3 3 0 0 1 0 6"/><path d="M18.5 6.5a7 7 0 0 1 0 11"/></svg>',
    },
    warning: {
      label: '警告',
      color: '#9a6700',
      bg: '#fff8c5',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4 3 20h18L12 4z"/><line x1="12" y1="10" x2="12" y2="14.5"/><circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none"/></svg>',
    },
    caution: {
      label: '注意',
      color: '#cf222e',
      bg: '#ffebe9',
      icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5z"/><line x1="12" y1="8" x2="12" y2="13"/><circle cx="12" cy="16" r="0.9" fill="currentColor" stroke="none"/></svg>',
    },
  };

  var INLINE_BUTTONS = [
    { label: 'B', cmd: 'bold', title: '粗體', style: 'font-weight:700;' },
    { label: 'I', cmd: 'italic', title: '斜體', style: 'font-style:italic;' },
    { label: 'S', cmd: 'strikeThrough', title: '刪除線', style: 'text-decoration:line-through;' },
    { icon: ICON_MARK, cmd: 'mark', title: '醒目提示', style: '' },
    { label: '</>', cmd: 'code', title: '行內程式碼', style: 'font-family:monospace;' },
    { label: 'H1', cmd: 'heading1', title: '標題 1', style: 'font-weight:700;' },
    { label: 'H2', cmd: 'heading2', title: '標題 2', style: 'font-weight:700;' },
    { label: 'H3', cmd: 'heading3', title: '標題 3', style: 'font-weight:700;' },
    { label: '"', cmd: 'quote', title: '引用', style: 'font-weight:700;' },
    { icon: ICON_BULLET_LIST, cmd: 'bulletList', title: '項目符號清單', style: '' },
    { icon: ICON_CLEAR, cmd: 'clear', title: '清除格式', style: '' },
    { icon: ICON_LINK, cmd: 'link', title: '連結', style: '' },
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
    onImageUpload = (callbacks && callbacks.onImageUpload) || null;
    document.addEventListener('click', function () {
      closeOpenDropdown();
    });
    document.addEventListener('selectionchange', handleSelectionChange);
    document.addEventListener('focusin', function (e) {
      if (!container || !container.contains(e.target)) {
        return;
      }
      var row = e.target.closest('[data-id]');
      if (row) {
        lastFocusedBlockId = row.dataset.id;
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Control' || e.key === 'Meta') {
        setLinkOpenModifierActive(true);
      }
    });
    document.addEventListener('keyup', function (e) {
      if (e.key === 'Control' || e.key === 'Meta') {
        setLinkOpenModifierActive(false);
      }
    });
    window.addEventListener('blur', function () {
      setLinkOpenModifierActive(false);
    });
    document.addEventListener('keydown', function (e) {
      if (container.hidden) {
        return;
      }
      var isCtrl = e.ctrlKey || e.metaKey;
      var key = e.key.toLowerCase();
      if (isCtrl && !e.altKey && key === 'f') {
        e.preventDefault();
        openSearchBar();
        return;
      }
      if (e.key === 'Escape' && linkCard && !linkCard.hidden) {
        hideLinkCard();
      }
      var active = document.activeElement;
      var withinSearchBar = searchBar && !searchBar.hidden && searchBar.contains(active);
      if (active && active !== document.body && !container.contains(active) && !withinSearchBar) {
        return;
      }
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

    container.addEventListener('paste', function (e) {
      var textEl = findBlockTextAncestor(document.activeElement);
      if (!textEl || !container.contains(textEl)) {
        return;
      }
      var rowEl = textEl.closest('[data-id]');
      var block = rowEl && findBlock(blocks, rowEl.dataset.id);
      if (!block) {
        return;
      }

      var items = (e.clipboardData && e.clipboardData.items) || [];
      var imageItem = null;
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf('image/') === 0) {
          imageItem = items[i];
          break;
        }
      }
      if (imageItem && onImageUpload) {
        e.preventDefault();
        var file = imageItem.getAsFile();
        if (!file) {
          return;
        }
        onImageUpload(file).then(function (result) {
          insertImageBlockAfter(block, result.filename);
        }).catch(function (err) {
          window.alert('圖片上傳失敗：' + err.message);
        });
        return;
      }

      var text = e.clipboardData && e.clipboardData.getData('text/plain');
      if (!text || text.indexOf('\n') === -1) {
        return;
      }
      var parsedBlocks = window.NotesMarkdown.parseMarkdownToBlocks(text);
      if (!parsedBlocks.length) {
        return;
      }
      e.preventDefault();
      pasteBlocksAt(block, parsedBlocks);
    });

    container.addEventListener('dragover', function (e) {
      if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') !== -1) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }
    });
    container.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length || !onImageUpload) {
        return;
      }
      var imageFile = null;
      for (var i = 0; i < files.length; i++) {
        if (files[i].type && files[i].type.indexOf('image/') === 0) {
          imageFile = files[i];
          break;
        }
      }
      if (!imageFile) {
        return;
      }
      e.preventDefault();
      onImageUpload(imageFile).then(function (result) {
        appendImageBlock(result.filename);
      }).catch(function (err) {
        window.alert('圖片上傳失敗：' + err.message);
      });
    });

    container.addEventListener('click', function (e) {
      if (!(e.ctrlKey || e.metaKey)) {
        return;
      }
      var link = e.target.closest && e.target.closest('a');
      if (link && findBlockTextAncestor(link)) {
        e.preventDefault();
        window.open(link.getAttribute('href') || '', '_blank', 'noopener');
      }
    });

    container.addEventListener('mouseover', function (e) {
      var link = e.target.closest && e.target.closest('a');
      if (link && findBlockTextAncestor(link)) {
        scheduleShowLinkCard(link);
      }
    });
    container.addEventListener('mouseout', function (e) {
      var link = e.target.closest && e.target.closest('a');
      if (!link) {
        return;
      }
      var related = e.relatedTarget;
      if (linkCard && related && linkCard.contains(related)) {
        return;
      }
      if (related && link.contains(related)) {
        return;
      }
      cancelShowLinkCard();
      scheduleHideLinkCard();
    });
  }

  function setFromPlainBlocks(plainBlocks) {
    blocks = (plainBlocks && plainBlocks.length)
      ? plainBlocks
      : [{ type: 'list_item', text: '', level: 0, children: [], checked: false }];
    assignIds(blocks);
    render();
  }

  function load(newBlocks, baseDir) {
    imageBaseDir = baseDir || '';
    closeSearchBar();
    hideLinkCard();
    lastFocusedBlockId = null;
    setFromPlainBlocks(newBlocks);
    resetHistory();
  }

  function loadFromMarkdownSource(text, cursorOffset) {
    var parsed = window.NotesMarkdown.parseMarkdownToBlocksWithLineMap(text || '');
    setFromPlainBlocks(parsed.blocks);
    pushHistory(true);
    if (cursorOffset != null) {
      var targetBlock = findBlockAtOffset(text || '', parsed.ranges, cursorOffset);
      if (targetBlock && targetBlock._id) {
        focusBlockSmart(targetBlock._id, false);
      }
    }
  }

  function findBlockAtOffset(text, ranges, offset) {
    var targetLine = text.slice(0, offset).split('\n').length - 1;
    var closest = null;
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      if (targetLine >= r.startLine && targetLine < r.endLine) {
        return r.block;
      }
      if (r.startLine <= targetLine) {
        closest = r.block;
      }
    }
    return closest || (ranges.length ? ranges[0].block : null);
  }

  // -- Undo / redo history -----------------------------------------------

  function snapshotBlocks() {
    return JSON.stringify(stripInternal(stripAutoTrailingParagraph(blocks)));
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
    var focusPath = lastFocusedBlockId ? findBlockIndexPath(blocks, lastFocusedBlockId) : null;
    var plain = JSON.parse(snapJson);
    blocks = plain.length ? plain : [{ type: 'list_item', text: '', level: 0, children: [], checked: false }];
    assignIds(blocks);
    render();
    onChange();
    if (focusPath) {
      var target = getBlockAtIndexPath(blocks, focusPath);
      if (target) {
        lastFocusedBlockId = target._id;
      }
    }
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
    return stripInternal(stripAutoTrailingParagraph(blocks));
  }

  function getMarkdownSource() {
    return window.NotesMarkdown.blocksToMarkdown(getBlocks());
  }

  function getMarkdownSourceWithCursor() {
    var forSerialize = stripAutoTrailingParagraph(blocks);
    var result = window.NotesMarkdown.blocksToMarkdownWithLineMap(forSerialize);
    var focusedId = getFocusedBlockId();
    var offset = null;
    if (focusedId && Object.prototype.hasOwnProperty.call(result.lineMap, focusedId)) {
      offset = lineIndexToCharOffset(result.text, result.lineMap[focusedId]);
    }
    return { text: result.text, offset: offset };
  }

  function getFocusedBlockId() {
    return lastFocusedBlockId;
  }

  function lineIndexToCharOffset(text, lineIndex) {
    var lines = text.split('\n');
    var offset = 0;
    for (var i = 0; i < lineIndex && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    return offset;
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
        src: b.src || '',
        lang: b.lang || '',
        calloutKind: b.calloutKind || 'note',
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

  function findBlockIndexPath(list, id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i]._id === id) {
        return [i];
      }
      var childPath = findBlockIndexPath(list[i].children || [], id);
      if (childPath) {
        return [i].concat(childPath);
      }
    }
    return null;
  }

  function getBlockAtIndexPath(list, path) {
    var node = null;
    var current = list;
    for (var i = 0; i < path.length; i++) {
      node = current[path[i]];
      if (!node) {
        return null;
      }
      current = node.children || [];
    }
    return node;
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
    ensureTrailingParagraph();
    openDropdown = null;
    container.innerHTML = '';
    container.appendChild(renderList(blocks));
  }

  function ensureTrailingParagraph() {
    if (!blocks.length) {
      return;
    }
    var last = blocks[blocks.length - 1];
    if (NON_TEXT_TYPES.indexOf(last.type) !== -1) {
      blocks.push({
        type: 'paragraph', text: '', level: 0, children: [], checked: false,
        rows: [], align: [], src: '', lang: '', _id: nextId(),
      });
    }
  }

  function stripAutoTrailingParagraph(list) {
    if (list.length < 2) {
      return list;
    }
    var last = list[list.length - 1];
    var prev = list[list.length - 2];
    var isEmptyParagraph = last.type === 'paragraph' && !last.text
      && (!last.children || last.children.length === 0);
    if (isEmptyParagraph && NON_TEXT_TYPES.indexOf(prev.type) !== -1) {
      return list.slice(0, -1);
    }
    return list;
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
    row.appendChild(createInsertBeforeButton(block));

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
          if (e.key === 'ArrowUp') {
            if (rowIndex > 0) {
              e.preventDefault();
              focusTableCell(block._id, rowIndex - 1, colIndex);
              return;
            }
            var ownerList = findParentList(blocks, block._id);
            var idx = ownerList.indexOf(block);
            e.preventDefault();
            if (idx === 0) {
              insertParagraphBefore(block, ownerList);
            } else {
              focusBlockSmart(ownerList[idx - 1]._id, true);
            }
            return;
          }
          if (e.key === 'ArrowDown') {
            if (rowIndex + 1 < block.rows.length) {
              e.preventDefault();
              focusTableCell(block._id, rowIndex + 1, colIndex);
              return;
            }
            var ownerListDown = findParentList(blocks, block._id);
            var next = ownerListDown[ownerListDown.indexOf(block) + 1];
            if (next) {
              e.preventDefault();
              focusBlockSmart(next._id, false);
            }
            return;
          }
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

  function renderImageBlock(block) {
    var group = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'block-row block-image-row';
    row.dataset.id = block._id;
    row.appendChild(createInsertBeforeButton(block));

    var wrap = document.createElement('div');
    wrap.className = 'block-image-wrap';

    var img = document.createElement('img');
    img.className = 'block-image';
    img.src = window.NotesApi.fileUrl(imageBaseDir ? imageBaseDir + '/' + block.src : block.src);
    img.alt = block.text || '';
    wrap.appendChild(img);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'block-image-delete';
    delBtn.title = '刪除圖片';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      removeBlock(block._id);
      commitChange(true);
    });
    wrap.appendChild(delBtn);

    row.appendChild(wrap);
    group.appendChild(row);
    return group;
  }

  var NON_TEXT_TYPES = ['image', 'table', 'code_block', 'callout'];

  function ensureFollowingParagraph(list, afterIdx) {
    var next = list[afterIdx + 1];
    if (next && NON_TEXT_TYPES.indexOf(next.type) === -1) {
      return next._id;
    }
    var newBlock = {
      type: 'paragraph', text: '', level: 0, children: [], checked: false,
      rows: [], align: [], src: '', lang: '', _id: nextId(),
    };
    list.splice(afterIdx + 1, 0, newBlock);
    return newBlock._id;
  }

  function insertParagraphBefore(block, list) {
    var newBlock = {
      type: 'paragraph', text: '', level: 0, children: [], checked: false,
      rows: [], align: [], src: '', lang: '', _id: nextId(),
    };
    list.splice(list.indexOf(block), 0, newBlock);
    render();
    focusBlock(newBlock._id, false);
    commitChange(true);
  }

  function createInsertBeforeButton(block) {
    var zone = document.createElement('button');
    zone.type = 'button';
    zone.className = 'block-insert-zone';
    zone.title = '在上方插入空白段落';

    var visual = document.createElement('span');
    visual.className = 'block-insert-before-btn';
    visual.textContent = '+';
    zone.appendChild(visual);

    zone.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    zone.addEventListener('click', function (e) {
      e.stopPropagation();
      var list = findParentList(blocks, block._id);
      if (list) {
        insertParagraphBefore(block, list);
      }
    });
    return zone;
  }

  function pasteBlocksAt(block, parsedBlocks) {
    assignIds(parsedBlocks);
    var list = findParentList(blocks, block._id);
    var idx = list.indexOf(block);
    var isEmpty = NON_TEXT_TYPES.indexOf(block.type) === -1
      && !block.text && (!block.children || !block.children.length);
    var insertAt = isEmpty ? idx : idx + 1;
    var removeCount = isEmpty ? 1 : 0;
    list.splice.apply(list, [insertAt, removeCount].concat(parsedBlocks));
    render();
    focusBlockSmart(parsedBlocks[parsedBlocks.length - 1]._id, true);
    commitChange(true);
  }

  function insertImageBlockAfter(block, filename) {
    var list = findParentList(blocks, block._id);
    if (!list) {
      return;
    }
    var idx = list.indexOf(block);
    var newBlock = {
      type: 'image', text: '', level: 0, children: [], checked: false,
      rows: [], align: [], src: filename, lang: '', _id: nextId(),
    };
    list.splice(idx + 1, 0, newBlock);
    var focusId = ensureFollowingParagraph(list, idx + 1);
    render();
    focusBlock(focusId, false);
    commitChange(true);
  }

  function appendImageBlock(filename) {
    var newBlock = {
      type: 'image', text: '', level: 0, children: [], checked: false,
      rows: [], align: [], src: filename, lang: '', _id: nextId(),
    };
    blocks.push(newBlock);
    var focusId = ensureFollowingParagraph(blocks, blocks.length - 1);
    render();
    focusBlock(focusId, false);
    commitChange(true);
  }

  function promptInsertImage(block) {
    if (!onImageUpload) {
      return;
    }
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/gif,image/webp';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) {
        return;
      }
      var previousText = block.text;
      onImageUpload(file).then(function (result) {
        block.type = 'image';
        block.level = 0;
        block.text = previousText || '';
        block.src = result.filename;
        var list = findParentList(blocks, block._id);
        var idx = list.indexOf(block);
        var focusId = ensureFollowingParagraph(list, idx);
        render();
        focusBlock(focusId, false);
        commitChange(true);
      }).catch(function (err) {
        window.alert('圖片上傳失敗：' + err.message);
      });
    });
    input.click();
  }

  function autoGrowTextarea(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }

  function focusCodeBlock(blockId, atEnd) {
    setTimeout(function () {
      var textarea = container.querySelector('[data-id="' + blockId + '"] .block-code-textarea');
      if (!textarea) {
        return;
      }
      textarea.focus();
      var pos = atEnd === false ? 0 : textarea.value.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }

  function focusBlockSmart(id, atEnd) {
    var target = findBlock(blocks, id);
    if (!target) {
      return;
    }
    if (target.type === 'table') {
      var lastRow = (target.rows ? target.rows.length : 1) - 1;
      focusTableCell(id, atEnd ? Math.max(lastRow, 0) : 0, 0);
      return;
    }
    if (target.type === 'code_block') {
      focusCodeBlock(id, atEnd);
      return;
    }
    focusBlock(id, atEnd);
  }

  var CODE_LANGUAGES = [
    { value: '', label: '純文字' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'python', label: 'Python' },
    { value: 'java', label: 'Java' },
    { value: 'csharp', label: 'C#' },
    { value: 'cpp', label: 'C++' },
    { value: 'c', label: 'C' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'php', label: 'PHP' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'sql', label: 'SQL' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'json', label: 'JSON' },
    { value: 'yaml', label: 'YAML' },
    { value: 'bash', label: 'Bash' },
    { value: 'powershell', label: 'PowerShell' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'xml', label: 'XML' },
  ];

  function renderCodeBlock(block) {
    var group = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'block-row block-code-row';
    row.dataset.id = block._id;
    row.appendChild(createInsertBeforeButton(block));

    var wrap = document.createElement('div');
    wrap.className = 'block-code-wrap';

    var currentLang = block.lang || '';
    var langOptions = CODE_LANGUAGES.some(function (l) { return l.value === currentLang; })
      ? CODE_LANGUAGES
      : CODE_LANGUAGES.concat([{ value: currentLang, label: currentLang }]);

    var langSelect = document.createElement('select');
    langSelect.className = 'block-code-lang';
    langSelect.title = '程式語言';
    langOptions.forEach(function (l) {
      var opt = document.createElement('option');
      opt.value = l.value;
      opt.textContent = l.label;
      langSelect.appendChild(opt);
    });
    langSelect.value = currentLang;
    langSelect.addEventListener('change', function () {
      block.lang = langSelect.value;
      commitChange(true);
    });
    wrap.appendChild(langSelect);

    var textarea = document.createElement('textarea');
    textarea.className = 'block-code-textarea';
    textarea.spellcheck = false;
    textarea.value = block.text || '';
    textarea.rows = 1;
    textarea.addEventListener('input', function () {
      block.text = textarea.value;
      autoGrowTextarea(textarea);
      commitChange(false);
    });
    textarea.addEventListener('keydown', function (e) {
      if (e.key === 'Backspace' && textarea.value === '') {
        e.preventDefault();
        removeBlock(block._id);
        commitChange(true);
        return;
      }
      if (e.key === 'ArrowUp') {
        var onFirstLine = textarea.value.slice(0, textarea.selectionStart).indexOf('\n') === -1;
        if (onFirstLine) {
          var ownerList = findParentList(blocks, block._id);
          var idx = ownerList.indexOf(block);
          e.preventDefault();
          if (idx === 0) {
            insertParagraphBefore(block, ownerList);
          } else {
            focusBlockSmart(ownerList[idx - 1]._id, true);
          }
        }
        return;
      }
      if (e.key === 'Enter') {
        var atEnd = textarea.selectionStart === textarea.value.length
          && textarea.selectionEnd === textarea.value.length;
        var trailingBlankLine = textarea.value === '' || /\n$/.test(textarea.value);
        if (atEnd && trailingBlankLine) {
          e.preventDefault();
          block.text = textarea.value.replace(/\n$/, '');
          var list = findParentList(blocks, block._id);
          var idx = list.indexOf(block);
          var focusId = ensureFollowingParagraph(list, idx);
          render();
          focusBlock(focusId, false);
          commitChange(true);
        }
      }
    });
    wrap.appendChild(textarea);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'block-code-delete';
    delBtn.title = '刪除程式碼區塊';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      removeBlock(block._id);
      commitChange(true);
    });
    wrap.appendChild(delBtn);

    row.appendChild(wrap);
    group.appendChild(row);

    setTimeout(function () {
      autoGrowTextarea(textarea);
    }, 0);

    return group;
  }

  function renderCalloutBlock(block) {
    if (!block.calloutKind || !CALLOUT_KIND_CONFIG[block.calloutKind]) {
      block.calloutKind = 'note';
    }

    var group = document.createElement('div');

    var row = document.createElement('div');
    row.className = 'block-row block-callout-row';
    row.dataset.id = block._id;
    row.appendChild(createInsertBeforeButton(block));

    var wrap = document.createElement('div');
    wrap.className = 'block-callout block-callout-' + block.calloutKind;

    var iconWrap = document.createElement('span');
    iconWrap.className = 'block-callout-icon';
    iconWrap.innerHTML = CALLOUT_KIND_CONFIG[block.calloutKind].icon;
    wrap.appendChild(iconWrap);

    var text = document.createElement('div');
    text.className = 'block-text block-callout-text';
    text.contentEditable = 'true';
    text.innerHTML = window.NotesMarkdown.inlineMarkdownToHtml(block.text);

    text.addEventListener('input', function () {
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(text);
      commitChange(false);
    });
    text.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        document.execCommand('insertLineBreak');
        block.text = window.NotesMarkdown.htmlToInlineMarkdown(text);
        commitChange(false);
        return;
      }
      if (e.key === 'Backspace' && text.textContent === '') {
        e.preventDefault();
        removeBlock(block._id);
        commitChange(true);
      }
    });
    wrap.appendChild(text);

    var kindSelect = document.createElement('select');
    kindSelect.className = 'block-callout-kind-select';
    kindSelect.title = '提示框類型';
    window.NotesMarkdown.CALLOUT_KINDS.forEach(function (kind) {
      var opt = document.createElement('option');
      opt.value = kind;
      opt.textContent = CALLOUT_KIND_CONFIG[kind].label;
      kindSelect.appendChild(opt);
    });
    kindSelect.value = block.calloutKind;
    kindSelect.addEventListener('change', function () {
      block.calloutKind = kindSelect.value;
      render();
      focusBlock(block._id, true);
      commitChange(true);
    });
    wrap.appendChild(kindSelect);

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'block-callout-delete';
    delBtn.title = '刪除提示框';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      removeBlock(block._id);
      commitChange(true);
    });
    wrap.appendChild(delBtn);

    row.appendChild(wrap);
    group.appendChild(row);
    return group;
  }

  function renderBlock(block, orderedIndex) {
    if (block.type === 'code_block') {
      return renderCodeBlock(block);
    }
    if (block.type === 'image') {
      return renderImageBlock(block);
    }
    if (block.type === 'table') {
      return renderTableBlock(block);
    }
    if (block.type === 'callout') {
      return renderCalloutBlock(block);
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
      if (opt.type === block.type && opt.level === block.level) {
        optBtn.classList.add('active');
      }
      optBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        closeOpenDropdown();
        if (opt.type === 'image') {
          promptInsertImage(block);
          return;
        }
        var previousText = block.text;
        block.type = opt.type;
        block.level = opt.level;
        if (opt.type === 'heading') {
          block.text = window.NotesMarkdown.stripFontSizeMarkup(block.text);
        }
        if (opt.type === 'table') {
          block.rows = [[previousText || '', ''], ['', '']];
          block.align = [null, null];
          render();
          focusTableCell(block._id, 0, 0);
        } else if (opt.type === 'code_block') {
          block.lang = block.lang || '';
          render();
          focusCodeBlock(block._id);
        } else {
          if (opt.type === 'callout') {
            block.calloutKind = block.calloutKind || 'note';
          }
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
    if (isCtrl && !e.altKey && key === 'k') {
      e.preventDefault();
      applyInlineCommand('link');
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
      autoLinkifyBeforeCaret(textEl);
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
        focusBlockSmart(prevId, true);
      }
    } else if (e.key === 'ArrowDown' && !e.shiftKey && !e.altKey) {
      var nextId = adjacentVisibleBlockId(block._id, 1);
      if (nextId) {
        e.preventDefault();
        block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
        focusBlockSmart(nextId, false);
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
    var continued = CONTINUABLE_TYPES.indexOf(block.type) !== -1;
    var newBlock = {
      type: continued ? block.type : 'paragraph', text: '', level: 0, children: [], checked: false, _id: nextId(),
    };
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

  var AUTO_LINK_URL_RE = /^(https?:\/\/|www\.)\S+$/i;

  // A bare URL typed as plain text, followed by Enter, becomes a real link
  // (matching the common convention in Slack/Notion/Google Docs). Only the
  // whitespace-delimited token immediately before the caret is considered, and
  // only when the caret sits in plain text (not already inside a link).
  function autoLinkifyBeforeCaret(textEl) {
    var sel = window.getSelection();
    if (!sel.rangeCount || !sel.isCollapsed) {
      return;
    }
    var range = sel.getRangeAt(0);
    var node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE || !textEl.contains(node)) {
      return;
    }
    if (findAncestorTag(node, 'A')) {
      return;
    }
    var offset = range.startOffset;
    var match = node.textContent.slice(0, offset).match(/(\S+)$/);
    if (!match || !AUTO_LINK_URL_RE.test(match[1])) {
      return;
    }
    var word = match[1];
    var wordRange = document.createRange();
    wordRange.setStart(node, offset - word.length);
    wordRange.setEnd(node, offset);
    var link = document.createElement('a');
    link.setAttribute('href', /^https?:\/\//i.test(word) ? word : 'https://' + word);
    wordRange.surroundContents(link);
    var newRange = document.createRange();
    newRange.setStartAfter(link);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);
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

  // Detects an existing link the way a user would expect "editing a link" to
  // work: not just a collapsed caret or a selection strictly inside the <a>,
  // but also a selection that was dragged across the link's boundary into
  // surrounding plain text (very easy to do by accident). Returns the first
  // link the range touches, or null if none.
  function findIntersectingLink(textEl, range) {
    var links = textEl.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      if (range.intersectsNode(links[i])) {
        return links[i];
      }
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

    INLINE_BUTTONS.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'inline-toolbar-btn';
      btn.style.cssText = b.style;
      if (b.icon) {
        btn.innerHTML = b.icon;
      } else {
        btn.textContent = b.label;
      }
      btn.title = b.title;
      inlineButtonEls[b.cmd] = btn;
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
    } else if (cmd === 'mark') {
      toggleInlineWrap('mark');
      syncAfterCommand(block, textEl);
    } else if (cmd === 'clear') {
      clearInlineFormatting(block, textEl, range);
    } else if (cmd === 'heading1' || cmd === 'heading2' || cmd === 'heading3') {
      var headingLevel = Number(cmd.slice(-1));
      if (block.type === 'heading' && block.level === headingLevel) {
        convertBlockType(block, textEl, 'list_item', 0);
      } else {
        convertBlockType(block, textEl, 'heading', headingLevel);
      }
    } else if (cmd === 'quote') {
      if (block.type === 'quote') {
        convertBlockType(block, textEl, 'list_item', 0);
      } else {
        convertBlockType(block, textEl, 'quote', 0);
      }
    } else if (cmd === 'bulletList') {
      convertBlockType(block, textEl, 'list_item', 0);
    } else if (cmd === 'link') {
      var existingLink = findIntersectingLink(textEl, range);
      if (existingLink) {
        editLinkUrl(existingLink);
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

  function convertBlockType(block, textEl, type, level) {
    var text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    if (type === 'heading') {
      text = window.NotesMarkdown.stripFontSizeMarkup(text);
    }
    block.text = text;
    block.type = type;
    block.level = level;
    render();
    focusBlock(block._id, true);
    commitChange(true);
    hideFloatingToolbar();
  }

  function clearInlineFormatting(block, textEl, range) {
    if (range.collapsed) {
      return;
    }
    var plainText = range.toString();
    range.deleteContents();
    var textNode = document.createTextNode(plainText);
    range.insertNode(textNode);
    var newRange = document.createRange();
    newRange.selectNodeContents(textNode);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(newRange);
    syncAfterCommand(block, textEl);
  }

  function handleSelectionChange() {
    var sel = window.getSelection();
    if (!sel.rangeCount) {
      hideFloatingToolbar();
      scheduleHideLinkCard();
      return;
    }
    var range = sel.getRangeAt(0);
    if (sel.isCollapsed) {
      hideFloatingToolbar();
      var caretTextEl = findBlockTextAncestor(range.commonAncestorContainer);
      var caretLink = (caretTextEl && container && container.contains(caretTextEl))
        ? findAncestorTag(range.commonAncestorContainer, 'A')
        : null;
      if (caretLink) {
        showLinkCardForLink(caretLink);
      } else {
        scheduleHideLinkCard();
      }
      return;
    }
    cancelShowLinkCard();
    hideLinkCard();
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
    updateInlineToolbarActiveState(range);
  }

  function setInlineButtonActive(cmd, isActive) {
    var el = inlineButtonEls[cmd];
    if (!el) {
      return;
    }
    el.classList.toggle('inline-toolbar-btn-active', !!isActive);
  }

  function updateInlineToolbarActiveState(range) {
    var node = range.commonAncestorContainer;
    setInlineButtonActive('bold', document.queryCommandState('bold'));
    setInlineButtonActive('italic', document.queryCommandState('italic'));
    setInlineButtonActive('strikeThrough', document.queryCommandState('strikeThrough'));
    setInlineButtonActive('code', !!findAncestorTag(node, 'CODE'));
    setInlineButtonActive('mark', !!findAncestorTag(node, 'MARK'));
    setInlineButtonActive('link', !!findAncestorTag(node, 'A'));

    var textEl = findBlockTextAncestor(node);
    var block = null;
    if (textEl) {
      var rowEl = textEl.closest('[data-id]');
      block = rowEl && findBlock(blocks, rowEl.dataset.id);
    }
    setInlineButtonActive('heading1', !!block && block.type === 'heading' && block.level === 1);
    setInlineButtonActive('heading2', !!block && block.type === 'heading' && block.level === 2);
    setInlineButtonActive('heading3', !!block && block.type === 'heading' && block.level === 3);
    setInlineButtonActive('quote', !!block && block.type === 'quote');
    setInlineButtonActive('bulletList', !!block && block.type === 'list_item');
  }

  function hideFloatingToolbar() {
    if (floatingToolbar) {
      floatingToolbar.hidden = true;
    }
  }

  // -- Link hover card: open / edit / remove an existing link --------------

  function ensureLinkCard() {
    if (linkCard) {
      return linkCard;
    }
    linkCard = document.createElement('div');
    linkCard.className = 'link-card';
    linkCard.hidden = true;

    linkCardUrlEl = document.createElement('span');
    linkCardUrlEl.className = 'link-card-url';
    linkCard.appendChild(linkCardUrlEl);

    var openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.className = 'link-card-btn';
    openBtn.title = '在新分頁開啟';
    openBtn.innerHTML = ICON_LINK_OPEN;
    openBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    openBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (linkCardTargetEl) {
        window.open(linkCardTargetEl.getAttribute('href') || '', '_blank', 'noopener');
      }
    });
    linkCard.appendChild(openBtn);

    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'link-card-btn';
    editBtn.title = '編輯網址';
    editBtn.innerHTML = ICON_LINK_EDIT;
    editBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    editBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      editLinkCardTarget();
    });
    linkCard.appendChild(editBtn);

    var removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'link-card-btn link-card-btn-remove';
    removeBtn.title = '移除連結';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('mousedown', function (e) {
      e.preventDefault();
    });
    removeBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      removeLinkCardTarget();
    });
    linkCard.appendChild(removeBtn);

    linkCard.addEventListener('mouseenter', cancelHideLinkCard);
    linkCard.addEventListener('mouseleave', scheduleHideLinkCard);

    document.body.appendChild(linkCard);
    return linkCard;
  }

  function setLinkOpenModifierActive(active) {
    if (linkOpenModifierActive === active) {
      return;
    }
    linkOpenModifierActive = active;
    document.body.classList.toggle('link-open-modifier-active', active);
    if (active) {
      hideLinkCard();
    }
  }

  function showLinkCardForLink(linkEl) {
    if (!linkEl || !container || !container.contains(linkEl) || linkOpenModifierActive) {
      return;
    }
    var sel = window.getSelection();
    if (sel.rangeCount && !sel.isCollapsed) {
      return;
    }
    cancelHideLinkCard();
    var card = ensureLinkCard();
    if (linkCardTargetEl === linkEl && !card.hidden) {
      return;
    }
    linkCardTargetEl = linkEl;
    linkCardUrlEl.textContent = linkEl.getAttribute('href') || '';
    card.hidden = false;

    var rect = linkEl.getBoundingClientRect();
    var top = rect.top - card.offsetHeight - 8;
    if (top < 8) {
      top = rect.bottom + 8;
    }
    var left = Math.min(rect.left, window.innerWidth - card.offsetWidth - 8);
    card.style.top = Math.max(8, top) + 'px';
    card.style.left = Math.max(8, left) + 'px';
  }

  function scheduleHideLinkCard() {
    cancelHideLinkCard();
    linkCardHideTimer = setTimeout(hideLinkCard, LINK_CARD_HIDE_DELAY_MS);
  }

  function cancelHideLinkCard() {
    if (linkCardHideTimer) {
      clearTimeout(linkCardHideTimer);
      linkCardHideTimer = null;
    }
  }

  function scheduleShowLinkCard(linkEl) {
    if (linkCardPendingLinkEl === linkEl && linkCardShowTimer) {
      return;
    }
    cancelShowLinkCard();
    linkCardPendingLinkEl = linkEl;
    linkCardShowTimer = setTimeout(function () {
      linkCardShowTimer = null;
      linkCardPendingLinkEl = null;
      showLinkCardForLink(linkEl);
    }, LINK_CARD_HOVER_DELAY_MS);
  }

  function cancelShowLinkCard() {
    if (linkCardShowTimer) {
      clearTimeout(linkCardShowTimer);
      linkCardShowTimer = null;
    }
    linkCardPendingLinkEl = null;
  }

  function hideLinkCard() {
    cancelHideLinkCard();
    if (linkCard) {
      linkCard.hidden = true;
    }
    linkCardTargetEl = null;
  }

  function editLinkCardTarget() {
    if (linkCardTargetEl) {
      editLinkUrl(linkCardTargetEl);
    }
  }

  function editLinkUrl(link) {
    var textEl = findBlockTextAncestor(link);
    var rowEl = textEl && textEl.closest('[data-id]');
    var block = rowEl && findBlock(blocks, rowEl.dataset.id);
    if (!textEl || !block) {
      return;
    }
    var currentHref = link.getAttribute('href') || '';
    window.NotesModal.prompt('編輯連結網址', currentHref).then(function (url) {
      if (!url) {
        return;
      }
      link.setAttribute('href', url);
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
      commitChange(true);
      if (linkCardTargetEl === link) {
        linkCardUrlEl.textContent = url;
      }
    });
  }

  function removeLinkCardTarget() {
    var link = linkCardTargetEl;
    if (!link) {
      return;
    }
    var textEl = findBlockTextAncestor(link);
    var rowEl = textEl && textEl.closest('[data-id]');
    var block = rowEl && findBlock(blocks, rowEl.dataset.id);
    if (!textEl || !block) {
      return;
    }
    unwrapElement(link);
    textEl.normalize();
    block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    commitChange(true);
    hideLinkCard();
  }

  // -- Find & replace within the current note -----------------------------

  function ensureSearchBar() {
    if (searchBar) {
      return searchBar;
    }
    searchBar = document.createElement('div');
    searchBar.className = 'search-bar';
    searchBar.hidden = true;
    searchBar.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSearchBar();
      }
    });

    var row = document.createElement('div');
    row.className = 'search-row';

    searchQueryInput = document.createElement('input');
    searchQueryInput.type = 'text';
    searchQueryInput.className = 'search-input';
    searchQueryInput.placeholder = '搜尋';
    searchQueryInput.addEventListener('input', function () {
      runSearch();
    });
    searchQueryInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        gotoSearchMatch(searchCurrentIndex + (e.shiftKey ? -1 : 1));
      }
    });

    searchCaseBtn = document.createElement('button');
    searchCaseBtn.type = 'button';
    searchCaseBtn.className = 'search-toggle-btn';
    searchCaseBtn.title = '區分大小寫';
    searchCaseBtn.textContent = 'Aa';
    searchCaseBtn.addEventListener('click', function () {
      searchUseCase = !searchUseCase;
      searchCaseBtn.classList.toggle('search-toggle-active', searchUseCase);
      runSearch();
    });

    searchRegexBtn = document.createElement('button');
    searchRegexBtn.type = 'button';
    searchRegexBtn.className = 'search-toggle-btn';
    searchRegexBtn.title = '正規表示式';
    searchRegexBtn.textContent = '.*';
    searchRegexBtn.addEventListener('click', function () {
      searchUseRegex = !searchUseRegex;
      searchRegexBtn.classList.toggle('search-toggle-active', searchUseRegex);
      runSearch();
    });

    searchCountEl = document.createElement('span');
    searchCountEl.className = 'search-count';

    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'search-nav-btn';
    prevBtn.title = '上一個';
    prevBtn.textContent = '↑';
    prevBtn.addEventListener('click', function () {
      gotoSearchMatch(searchCurrentIndex - 1);
    });

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'search-nav-btn';
    nextBtn.title = '下一個';
    nextBtn.textContent = '↓';
    nextBtn.addEventListener('click', function () {
      gotoSearchMatch(searchCurrentIndex + 1);
    });

    var toggleReplaceBtn = document.createElement('button');
    toggleReplaceBtn.type = 'button';
    toggleReplaceBtn.className = 'search-toggle-btn';
    toggleReplaceBtn.title = '切換取代';
    toggleReplaceBtn.textContent = '⇄';
    toggleReplaceBtn.addEventListener('click', function () {
      searchReplaceRow.hidden = !searchReplaceRow.hidden;
      if (!searchReplaceRow.hidden) {
        searchReplaceInput.focus();
      }
    });

    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'search-toggle-btn';
    closeBtn.title = '關閉';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', function () {
      closeSearchBar();
    });

    row.appendChild(searchQueryInput);
    row.appendChild(searchCaseBtn);
    row.appendChild(searchRegexBtn);
    row.appendChild(searchCountEl);
    row.appendChild(prevBtn);
    row.appendChild(nextBtn);
    row.appendChild(toggleReplaceBtn);
    row.appendChild(closeBtn);

    searchReplaceRow = document.createElement('div');
    searchReplaceRow.className = 'search-replace-row';
    searchReplaceRow.hidden = true;

    searchReplaceInput = document.createElement('input');
    searchReplaceInput.type = 'text';
    searchReplaceInput.className = 'search-input';
    searchReplaceInput.placeholder = '取代為';
    searchReplaceInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        replaceCurrentMatch();
      }
    });

    var replaceBtn = document.createElement('button');
    replaceBtn.type = 'button';
    replaceBtn.className = 'search-replace-action-btn';
    replaceBtn.textContent = '取代';
    replaceBtn.addEventListener('click', function () {
      replaceCurrentMatch();
    });

    var replaceAllBtn = document.createElement('button');
    replaceAllBtn.type = 'button';
    replaceAllBtn.className = 'search-replace-action-btn';
    replaceAllBtn.textContent = '全部取代';
    replaceAllBtn.addEventListener('click', function () {
      replaceAllMatches();
    });

    searchReplaceRow.appendChild(searchReplaceInput);
    searchReplaceRow.appendChild(replaceBtn);
    searchReplaceRow.appendChild(replaceAllBtn);

    searchBar.appendChild(row);
    searchBar.appendChild(searchReplaceRow);

    document.body.appendChild(searchBar);
    return searchBar;
  }

  function openSearchBar() {
    ensureSearchBar();
    searchBar.hidden = false;
    searchQueryInput.focus();
    searchQueryInput.select();
    if (searchQueryInput.value) {
      runSearch();
    }
  }

  function closeSearchBar() {
    if (!searchBar) {
      return;
    }
    clearSearchHighlights();
    searchBar.hidden = true;
    searchMatches = [];
    searchCurrentIndex = -1;
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildSearchRegex(query) {
    var flags = 'g' + (searchUseCase ? '' : 'i');
    var pattern = searchUseRegex ? query : escapeRegExp(query);
    try {
      return new RegExp(pattern, flags);
    } catch (e) {
      return null;
    }
  }

  function findMatchesInText(text, regex) {
    var matches = [];
    regex.lastIndex = 0;
    var m;
    while ((m = regex.exec(text))) {
      matches.push({ start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) {
        regex.lastIndex += 1;
      }
    }
    return matches;
  }

  function clearSearchHighlights() {
    if (!container) {
      return;
    }
    var marks = container.querySelectorAll('span.search-match, span.search-match-current');
    var affectedTextEls = [];
    Array.prototype.forEach.call(marks, function (mark) {
      var textEl = mark.closest('.block-text');
      unwrapElement(mark);
      if (textEl && affectedTextEls.indexOf(textEl) === -1) {
        affectedTextEls.push(textEl);
      }
    });
    affectedTextEls.forEach(function (textEl) {
      textEl.normalize();
    });
    var codeCurrents = container.querySelectorAll('.block-code-textarea.search-current-code');
    Array.prototype.forEach.call(codeCurrents, function (ta) {
      ta.classList.remove('search-current-code');
    });
  }

  function rangeFromTextOffsets(root, start, end) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    var pos = 0;
    var range = document.createRange();
    var startSet = false;
    var node;
    while ((node = walker.nextNode())) {
      var len = node.textContent.length;
      if (!startSet && pos + len >= start) {
        range.setStart(node, start - pos);
        startSet = true;
      }
      if (startSet && pos + len >= end) {
        range.setEnd(node, end - pos);
        return range;
      }
      pos += len;
    }
    return null;
  }

  function highlightSearchMatches() {
    var byBlock = {};
    searchMatches.forEach(function (m, idx) {
      if (m.kind === 'code') {
        return;
      }
      byBlock[m.blockId] = byBlock[m.blockId] || [];
      byBlock[m.blockId].push(idx);
    });
    Object.keys(byBlock).forEach(function (blockId) {
      var rowEl = container.querySelector('[data-id="' + blockId + '"]');
      var textEl = rowEl && rowEl.querySelector('.block-text');
      if (!textEl) {
        return;
      }
      var idxs = byBlock[blockId].slice().sort(function (a, b) {
        return searchMatches[b].start - searchMatches[a].start;
      });
      idxs.forEach(function (idx) {
        var m = searchMatches[idx];
        var range = rangeFromTextOffsets(textEl, m.start, m.end);
        if (!range) {
          return;
        }
        var span = document.createElement('span');
        span.className = idx === searchCurrentIndex ? 'search-match-current' : 'search-match';
        try {
          range.surroundContents(span);
        } catch (e) {
          var contents = range.extractContents();
          span.appendChild(contents);
          range.insertNode(span);
        }
      });
    });
  }

  function updateSearchCountDisplay() {
    if (!searchCountEl) {
      return;
    }
    searchCountEl.textContent = searchMatches.length
      ? (searchCurrentIndex + 1) + '/' + searchMatches.length
      : '0/0';
  }

  function expandAncestorsForBlock(blockId) {
    var changed = false;
    var list = findParentList(blocks, blockId);
    while (list && list !== blocks) {
      var owner = findOwnerBlock(blocks, list);
      if (!owner) {
        break;
      }
      if (owner._collapsed) {
        owner._collapsed = false;
        changed = true;
      }
      list = findParentList(blocks, owner._id);
    }
    return changed;
  }

  function gotoSearchMatch(index) {
    if (!searchMatches.length) {
      return;
    }
    searchCurrentIndex = ((index % searchMatches.length) + searchMatches.length) % searchMatches.length;
    var match = searchMatches[searchCurrentIndex];
    if (expandAncestorsForBlock(match.blockId)) {
      render();
    }
    clearSearchHighlights();
    highlightSearchMatches();
    updateSearchCountDisplay();
    var rowEl = container.querySelector('[data-id="' + match.blockId + '"]');
    if (rowEl) {
      rowEl.scrollIntoView({ block: 'center' });
    }
    if (match.kind === 'code' && rowEl) {
      var textarea = rowEl.querySelector('.block-code-textarea');
      if (textarea) {
        textarea.classList.add('search-current-code');
        textarea.setSelectionRange(match.start, match.end);
      }
    }
  }

  function runSearch() {
    clearSearchHighlights();
    searchMatches = [];
    searchCurrentIndex = -1;

    var query = searchQueryInput ? searchQueryInput.value : '';
    if (searchQueryInput) {
      searchQueryInput.classList.remove('search-input-error');
    }
    if (!query || !container) {
      updateSearchCountDisplay();
      return;
    }

    var regex = buildSearchRegex(query);
    if (!regex) {
      searchQueryInput.classList.add('search-input-error');
      updateSearchCountDisplay();
      return;
    }

    var rows = container.querySelectorAll('[data-id]');
    Array.prototype.forEach.call(rows, function (rowEl) {
      var blockId = rowEl.dataset.id;
      var textEl = rowEl.querySelector('.block-text');
      if (textEl) {
        findMatchesInText(textEl.textContent, regex).forEach(function (m) {
          searchMatches.push({ blockId: blockId, start: m.start, end: m.end, kind: 'text' });
        });
      }
      var codeTextarea = rowEl.querySelector('.block-code-textarea');
      if (codeTextarea) {
        findMatchesInText(codeTextarea.value, regex).forEach(function (m) {
          searchMatches.push({ blockId: blockId, start: m.start, end: m.end, kind: 'code' });
        });
      }
    });

    if (!searchMatches.length) {
      updateSearchCountDisplay();
      return;
    }
    gotoSearchMatch(0);
  }

  function replaceCurrentMatch() {
    if (searchCurrentIndex < 0 || !searchMatches.length) {
      return;
    }
    var replacement = searchReplaceInput ? searchReplaceInput.value : '';
    var match = searchMatches[searchCurrentIndex];
    clearSearchHighlights();
    var rowEl = container.querySelector('[data-id="' + match.blockId + '"]');
    var block = findBlock(blocks, match.blockId);
    if (!rowEl || !block) {
      return;
    }
    if (match.kind === 'code') {
      var textarea = rowEl.querySelector('.block-code-textarea');
      if (!textarea) {
        return;
      }
      var value = textarea.value;
      textarea.value = value.slice(0, match.start) + replacement + value.slice(match.end);
      block.text = textarea.value;
      autoGrowTextarea(textarea);
    } else {
      var textEl = rowEl.querySelector('.block-text');
      if (!textEl) {
        return;
      }
      var range = rangeFromTextOffsets(textEl, match.start, match.end);
      if (!range) {
        return;
      }
      range.deleteContents();
      if (replacement) {
        range.insertNode(document.createTextNode(replacement));
      }
      textEl.normalize();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    }
    commitChange(true);
    runSearch();
  }

  function replaceAllMatches() {
    if (!searchMatches.length) {
      return;
    }
    var replacement = searchReplaceInput ? searchReplaceInput.value : '';
    clearSearchHighlights();

    var byBlock = {};
    searchMatches.forEach(function (m) {
      byBlock[m.blockId] = byBlock[m.blockId] || [];
      byBlock[m.blockId].push(m);
    });

    Object.keys(byBlock).forEach(function (blockId) {
      var rowEl = container.querySelector('[data-id="' + blockId + '"]');
      var block = findBlock(blocks, blockId);
      if (!rowEl || !block) {
        return;
      }
      var ms = byBlock[blockId].slice().sort(function (a, b) {
        return b.start - a.start;
      });
      if (ms[0].kind === 'code') {
        var textarea = rowEl.querySelector('.block-code-textarea');
        if (!textarea) {
          return;
        }
        var value = textarea.value;
        ms.forEach(function (m) {
          value = value.slice(0, m.start) + replacement + value.slice(m.end);
        });
        textarea.value = value;
        block.text = value;
        autoGrowTextarea(textarea);
        return;
      }
      var textEl = rowEl.querySelector('.block-text');
      if (!textEl) {
        return;
      }
      ms.forEach(function (m) {
        var range = rangeFromTextOffsets(textEl, m.start, m.end);
        if (!range) {
          return;
        }
        range.deleteContents();
        if (replacement) {
          range.insertNode(document.createTextNode(replacement));
        }
      });
      textEl.normalize();
      block.text = window.NotesMarkdown.htmlToInlineMarkdown(textEl);
    });

    commitChange(true);
    runSearch();
  }

  return {
    init: init,
    load: load,
    getBlocks: getBlocks,
    getMarkdownSource: getMarkdownSource,
    getMarkdownSourceWithCursor: getMarkdownSourceWithCursor,
    loadFromMarkdownSource: loadFromMarkdownSource,
  };
})();
