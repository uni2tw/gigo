(function () {
  var currentNode = null;
  var activeParentPath = '';
  var saveTimer = null;
  var saveStatusEl = null;
  var lastKnownUpdatedAt = null;
  var hasUnsavedChanges = false;
  var staleCheckTimer = null;
  var viewMode = 'block';
  var blockEditorEl = null;
  var sourceEditorEl = null;
  var toggleSourceBtn = null;
  var copySourceBtn = null;
  var copyFeedbackTimer = null;
  var noteTitleEl = null;
  // The old version currently shown read-only ({ id, label, created_at }), or null.
  var previewing = null;
  var versionsBtn = null;
  var versionsPanel = null;
  var versionBanner = null;

  function setButtonLabel(btn, text) {
    btn.querySelector('.btn-label').textContent = text;
  }

  var MIRROR_STYLE_PROPS = [
    'boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
    'fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'tabSize',
  ];

  // Textareas only auto-scroll to reveal the caret once the browser has already
  // laid the element out at least once; on the very first reveal (hidden -> visible
  // in the same tick as a full value replacement) that heuristic silently no-ops and
  // leaves scrollTop wherever the value assignment put it (the end). Rather than
  // depend on that heuristic at all, measure the target offset's pixel height with an
  // off-screen mirror that copies the textarea's wrapping-relevant styles, then set
  // scrollTop directly.
  function scrollTextareaToOffset(textarea, offset) {
    var style = window.getComputedStyle(textarea);
    var mirror = document.createElement('div');
    MIRROR_STYLE_PROPS.forEach(function (prop) {
      mirror.style[prop] = style[prop];
    });
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.height = 'auto';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.textContent = textarea.value.slice(0, offset);
    document.body.appendChild(mirror);
    var targetHeight = mirror.scrollHeight;
    document.body.removeChild(mirror);

    var maxScrollTop = Math.max(0, textarea.scrollHeight - textarea.clientHeight);
    var target = targetHeight - textarea.clientHeight / 2;
    textarea.scrollTop = Math.max(0, Math.min(target, maxScrollTop));
  }

  function parentDirOf(path) {
    var parts = path.split('/');
    parts.pop();
    return parts.join('/');
  }

  function formatRelativeTime(epochSeconds) {
    if (!epochSeconds) {
      return '';
    }
    var diffSec = Math.floor((Date.now() - epochSeconds * 1000) / 1000);
    if (diffSec < 60) {
      return '剛剛更新';
    }
    var diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return '更新於 ' + diffMin + ' 分鐘前';
    }
    var diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) {
      return '更新於 ' + diffHour + ' 小時前';
    }
    var diffDay = Math.floor(diffHour / 24);
    if (diffDay < 30) {
      return '更新於 ' + diffDay + ' 天前';
    }
    var diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) {
      return '更新於 ' + diffMonth + ' 個月前';
    }
    return '更新於 ' + Math.floor(diffDay / 365) + ' 年前';
  }

  function findNodeByPath(nodes, path) {
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].path === path) {
        return nodes[i];
      }
      var found = findNodeByPath(nodes[i].children || [], path);
      if (found) {
        return found;
      }
    }
    return null;
  }

  function pathToHash(path) {
    return '#' + path.split('/').map(encodeURIComponent).join('/');
  }

  function hashToPath() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) {
      return null;
    }
    return hash.slice(1).split('/').map(decodeURIComponent).join('/');
  }

  function setHashForPath(path) {
    var target = pathToHash(path);
    if (window.location.hash !== target) {
      history.replaceState(null, '', target);
    }
  }

  function clearHash() {
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function reloadTree() {
    return window.NotesApi.getTree().then(function (data) {
      window.NotesTree.setTree(data.tree);
      return data.tree;
    }).catch(function (err) {
      window.alert('讀取樹狀結構失敗：' + err.message);
    });
  }

  function restoreFromHash(tree) {
    var path = hashToPath();
    if (!path || !tree) {
      return;
    }
    var node = findNodeByPath(tree, path);
    if (node && node.type === 'note') {
      window.NotesTree.revealPath(node.path);
      selectNode(node);
    }
  }

  function selectNode(node) {
    leavePreviewState();
    closeVersionsPanel();
    currentNode = node;
    activeParentPath = parentDirOf(node.path);
    window.NotesTree.setSelected(node.path);
    setHashForPath(node.path);
    document.getElementById('editor-empty').hidden = true;
    document.getElementById('editor-content').hidden = false;
    document.getElementById('note-title').textContent = node.name;
    resetViewMode();
    setStatus('載入中…');

    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    hasUnsavedChanges = false;

    return window.NotesApi.getNote(node.path).then(function (data) {
      window.NotesEditor.load(data.blocks, parentDirOf(node.path));
      lastKnownUpdatedAt = data.updated_at;
      setStatus(formatRelativeTime(data.updated_at));
    }).catch(function (err) {
      setStatus('載入失敗：' + err.message);
    });
  }

  function reloadCurrentNode() {
    if (!currentNode) {
      return;
    }
    selectNode(currentNode);
  }

  function resetViewMode() {
    viewMode = 'block';
    blockEditorEl.hidden = false;
    sourceEditorEl.hidden = true;
    sourceEditorEl.value = '';
    setButtonLabel(toggleSourceBtn, '檢視原始碼');
  }

  function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'source') {
      var info = window.NotesEditor.getMarkdownSourceWithCursor();
      sourceEditorEl.value = info.text;
      blockEditorEl.hidden = true;
      sourceEditorEl.hidden = false;
      setButtonLabel(toggleSourceBtn, '切換為區塊編輯');
      var targetOffset = info.offset != null ? info.offset : 0;
      sourceEditorEl.focus();
      sourceEditorEl.setSelectionRange(targetOffset, targetOffset);
      scrollTextareaToOffset(sourceEditorEl, targetOffset);
    } else {
      var cursorOffset = sourceEditorEl.selectionStart;
      window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value, cursorOffset);
      blockEditorEl.hidden = false;
      sourceEditorEl.hidden = true;
      setButtonLabel(toggleSourceBtn, '檢視原始碼');
    }
  }

  function toggleViewMode() {
    setViewMode(viewMode === 'block' ? 'source' : 'block');
  }

  function getCurrentMarkdownSource() {
    if (viewMode === 'source') {
      return sourceEditorEl.value;
    }
    return window.NotesEditor.getMarkdownSource();
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(textarea);
    return ok ? Promise.resolve() : Promise.reject(new Error('複製失敗'));
  }

  function copyCurrentSource() {
    if (!currentNode) {
      return;
    }
    copyToClipboard(getCurrentMarkdownSource()).then(function () {
      if (copyFeedbackTimer) {
        clearTimeout(copyFeedbackTimer);
      }
      setButtonLabel(copySourceBtn, '已複製！');
      copyFeedbackTimer = setTimeout(function () {
        setButtonLabel(copySourceBtn, '複製原始碼');
      }, 1500);
    }).catch(function () {
      window.alert('複製失敗，請手動選取原始碼內容複製。');
    });
  }

  function setStatus(text) {
    if (saveStatusEl) {
      saveStatusEl.textContent = text;
    }
  }

  var conflictModalOpen = false;

  function notifyConflict(statusText, modalMessage) {
    setStatus(statusText);
    if (conflictModalOpen) {
      return;
    }
    conflictModalOpen = true;
    window.NotesModal.notify(modalMessage, '重新載入').then(function () {
      conflictModalOpen = false;
      reloadCurrentNode();
    });
  }

  function performSave() {
    saveTimer = null;
    if (viewMode === 'source') {
      window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
    }
    var blocks = window.NotesEditor.getBlocks();
    var savingNode = currentNode;
    var savingExpectedUpdatedAt = lastKnownUpdatedAt;
    return window.NotesApi.saveNote(savingNode.path, blocks, savingExpectedUpdatedAt).then(function (result) {
      if (currentNode === savingNode) {
        hasUnsavedChanges = false;
        lastKnownUpdatedAt = result.updated_at;
        setStatus('已儲存 ' + new Date().toLocaleTimeString());
      }
    }).catch(function (err) {
      if (currentNode === savingNode) {
        if (err.status === 409) {
          notifyConflict('儲存失敗，此筆記已被其他分頁更新', '此筆記已被其他分頁更新，你的變更尚未儲存。');
        } else {
          setStatus('儲存失敗，內容尚未儲存：' + err.message);
        }
      }
      throw err;
    });
  }

  function scheduleSave() {
    if (!currentNode || previewing) {
      return;
    }
    hasUnsavedChanges = true;
    setStatus('編輯中…');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(function () {
      performSave().catch(function () {});
    }, 800);
  }

  // Saves pending edits right now (resolves at once when there are none).
  function flushSave() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!currentNode || !hasUnsavedChanges) {
      return Promise.resolve();
    }
    return performSave();
  }

  function checkForRemoteUpdate() {
    if (!currentNode || hasUnsavedChanges || previewing) {
      return;
    }
    var checkedNode = currentNode;
    window.NotesApi.getNoteMeta(checkedNode.path).then(function (meta) {
      if (currentNode === checkedNode && !hasUnsavedChanges && meta.updated_at !== lastKnownUpdatedAt) {
        notifyConflict('此筆記已被其他分頁更新', '此筆記已被其他分頁更新。');
      }
    }).catch(function () {
      // Ignore transient polling failures (e.g. note briefly unavailable); the
      // next periodic check or focus event will simply try again.
    });
  }

  function onFolderClicked(node) {
    activeParentPath = node.path;
    window.NotesTree.setSelected(node.path);
  }

  // Click on the tree's empty space: new folders / notes go to the top level.
  function onRootClicked() {
    activeParentPath = '';
    window.NotesTree.setSelected(currentNode ? currentNode.path : null);
  }

  function promptCreate(type) {
    var where = activeParentPath ? activeParentPath.replace(/\//g, ' / ') : '最上層';
    var message = (type === 'folder' ? '新資料夾名稱' : '新筆記名稱') + '（建立於：' + where + '）';
    window.NotesModal.prompt(message).then(function (name) {
      if (!name) {
        return;
      }
      window.NotesApi.createNode(activeParentPath, name, type).then(function () {
        reloadTree();
      }).catch(function (err) {
        window.alert(err.message);
      });
    });
  }

  function onNodeDeleted(path) {
    if (currentNode && (currentNode.path === path || currentNode.path.indexOf(path + '/') === 0)) {
      leavePreviewState();
      closeVersionsPanel();
      currentNode = null;
      document.getElementById('editor-empty').hidden = false;
      document.getElementById('editor-content').hidden = true;
      clearHash();
    }
    reloadTree();
  }

  function onNodeMoved(oldPath, newPath) {
    if (currentNode && currentNode.path === oldPath) {
      currentNode.path = newPath;
      currentNode.name = newPath.split('/').pop().replace(/\.md$/, '');
      setHashForPath(newPath);
      if (noteTitleEl) {
        noteTitleEl.textContent = currentNode.name;
      }
    }
    window.NotesTree.setSelected(newPath);
    reloadTree();
  }

  // -- Versions ---------------------------------------------------------

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function formatVersionTime(epochSeconds) {
    var d = new Date(epochSeconds * 1000);
    return d.getFullYear() + '/' + pad2(d.getMonth() + 1) + '/' + pad2(d.getDate())
      + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function closeVersionsPanel() {
    if (versionsPanel) {
      versionsPanel.hidden = true;
    }
  }

  function toggleVersionsPanel() {
    if (!versionsPanel.hidden) {
      closeVersionsPanel();
      return;
    }
    versionsPanel.hidden = false;
    refreshVersionsPanel();
  }

  function refreshVersionsPanel() {
    if (!currentNode || versionsPanel.hidden) {
      return Promise.resolve();
    }
    var node = currentNode;
    return window.NotesApi.listVersions(node.path).then(function (data) {
      if (currentNode === node) {
        renderVersionsPanel(data.versions);
      }
    }).catch(function (err) {
      versionsPanel.textContent = '載入版本失敗：' + err.message;
    });
  }

  function makeButton(text, onClick, className) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = text;
    if (className) {
      btn.className = className;
    }
    btn.addEventListener('click', onClick);
    return btn;
  }

  function renderVersionsPanel(list) {
    versionsPanel.innerHTML = '';
    var head = document.createElement('div');
    head.className = 'versions-head';
    var title = document.createElement('span');
    title.textContent = '版本（' + list.length + '）';
    head.appendChild(title);
    if (!previewing) {
      head.appendChild(makeButton('＋ 儲存目前為新版本', saveVersion));
    }
    versionsPanel.appendChild(head);

    if (!list.length) {
      var empty = document.createElement('div');
      empty.className = 'versions-empty';
      empty.textContent = '還沒有儲存過版本。按上方按鈕，把目前內容凍結成一個版本。';
      versionsPanel.appendChild(empty);
      return;
    }
    list.forEach(function (v) {
      var item = document.createElement('div');
      item.className = 'version-item' + (previewing && previewing.id === v.id ? ' is-active' : '');
      var info = document.createElement('div');
      info.className = 'version-info';
      var label = document.createElement('div');
      label.className = 'version-label';
      label.textContent = v.label || '(未命名)';
      label.title = v.label || '';
      if (v.kind === 'backup') {
        var badge = document.createElement('span');
        badge.className = 'version-badge';
        badge.textContent = '自動備份';
        label.appendChild(badge);
      }
      var time = document.createElement('div');
      time.className = 'version-time';
      time.textContent = formatVersionTime(v.created_at);
      info.appendChild(label);
      info.appendChild(time);
      item.appendChild(info);
      item.appendChild(makeButton('預覽', function () {
        previewVersion(v);
      }));
      item.appendChild(makeButton('刪除', function () {
        deleteVersion(v);
      }));
      versionsPanel.appendChild(item);
    });
  }

  function saveVersion() {
    if (!currentNode || previewing) {
      return;
    }
    var node = currentNode;
    var now = new Date();
    var defaultLabel = '版本 ' + pad2(now.getMonth() + 1) + '/' + pad2(now.getDate())
      + ' ' + pad2(now.getHours()) + ':' + pad2(now.getMinutes());
    window.NotesModal.prompt('版本名稱', defaultLabel).then(function (label) {
      if (!label || currentNode !== node || previewing) {
        return;
      }
      if (viewMode === 'source') {
        window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
      }
      // The editor's own content is sent so edits not yet autosaved are included.
      return window.NotesApi.createVersion(node.path, label, window.NotesEditor.getBlocks()).then(function () {
        setStatus('已儲存版本「' + label + '」');
        return refreshVersionsPanel();
      });
    }).catch(function (err) {
      window.alert('儲存版本失敗：' + err.message);
    });
  }

  function showPreviewBanner() {
    versionBanner.innerHTML = '';
    var text = document.createElement('span');
    text.className = 'version-banner-text';
    text.textContent = '正在預覽版本「' + (previewing.label || '未命名') + '」（'
      + formatVersionTime(previewing.created_at) + '）。唯讀，目前的筆記內容沒有被更動。';
    versionBanner.appendChild(text);
    versionBanner.appendChild(makeButton('還原到此版本', restorePreviewedVersion, 'primary'));
    versionBanner.appendChild(makeButton('回到目前內容', function () {
      reloadCurrentNode();
    }));
    versionBanner.hidden = false;
  }

  // Back to the normal editing UI (the caller reloads the note content).
  function leavePreviewState() {
    if (!previewing) {
      return;
    }
    previewing = null;
    window.NotesEditor.setReadOnly(false);
    versionBanner.hidden = true;
    versionBanner.innerHTML = '';
    toggleSourceBtn.disabled = false;
    noteTitleEl.contentEditable = 'true';
  }

  function previewVersion(v) {
    if (!currentNode) {
      return;
    }
    var node = currentNode;
    flushSave().then(function () {
      return window.NotesApi.getVersion(node.path, v.id);
    }).then(function (data) {
      if (currentNode !== node) {
        return;
      }
      resetViewMode();
      previewing = { id: data.id, label: data.label, created_at: data.created_at };
      toggleSourceBtn.disabled = true;
      noteTitleEl.contentEditable = 'false';
      window.NotesEditor.setReadOnly(true);
      window.NotesEditor.load(data.blocks, parentDirOf(node.path));
      showPreviewBanner();
      setStatus('預覽版本中（唯讀）');
      closeVersionsPanel();
    }).catch(function (err) {
      window.alert('無法預覽版本：' + err.message);
    });
  }

  function restorePreviewedVersion() {
    if (!currentNode || !previewing) {
      return;
    }
    var node = currentNode;
    var versionId = previewing.id;
    // Pending edits were flushed before the preview began, so the note on disk
    // is its current content; the server backs it up before overwriting.
    window.NotesApi.restoreVersion(node.path, versionId).then(function () {
      return selectNode(node);
    }).then(function () {
      setStatus('已還原到所選版本；還原前的內容已存成「自動備份」版本');
    }).catch(function (err) {
      window.alert('還原失敗：' + err.message);
    });
  }

  function deleteVersion(v) {
    var node = currentNode;
    window.NotesModal.confirm('確定刪除版本「' + (v.label || '未命名') + '」？此動作無法復原。').then(function (ok) {
      if (!ok || currentNode !== node) {
        return;
      }
      return window.NotesApi.deleteVersion(node.path, v.id).then(function () {
        if (previewing && previewing.id === v.id) {
          reloadCurrentNode();
        }
        return refreshVersionsPanel();
      });
    }).catch(function (err) {
      window.alert('刪除版本失敗：' + err.message);
    });
  }

  function commitTitleRename() {
    if (!currentNode || previewing) {
      return;
    }
    var newName = noteTitleEl.textContent.replace(/\s+/g, ' ').trim();
    if (!newName || newName === currentNode.name) {
      noteTitleEl.textContent = currentNode.name;
      return;
    }
    var parentDir = parentDirOf(currentNode.path);
    var newPath = (parentDir ? parentDir + '/' : '') + newName + '.md';
    var renamingNode = currentNode;
    window.NotesApi.updateNode(renamingNode.path, newPath).then(function () {
      onNodeMoved(renamingNode.path, newPath);
    }).catch(function (err) {
      window.alert(err.message);
      noteTitleEl.textContent = renamingNode.name;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    saveStatusEl = document.getElementById('save-status');
    blockEditorEl = document.getElementById('block-editor');
    sourceEditorEl = document.getElementById('source-editor');
    toggleSourceBtn = document.getElementById('btn-toggle-source');
    copySourceBtn = document.getElementById('btn-copy-source');
    noteTitleEl = document.getElementById('note-title');
    versionsBtn = document.getElementById('btn-versions');
    versionsPanel = document.getElementById('versions-panel');
    versionBanner = document.getElementById('version-banner');

    noteTitleEl.addEventListener('blur', commitTitleRename);
    noteTitleEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        noteTitleEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (currentNode) {
          noteTitleEl.textContent = currentNode.name;
        }
        noteTitleEl.blur();
      }
    });

    window.NotesTree.init(document.getElementById('tree-root'), {
      onSelect: selectNode,
      onFolderClick: onFolderClicked,
      onRootClick: onRootClicked,
    });
    window.NotesEditor.init(blockEditorEl, {
      onChange: scheduleSave,
      onImageUpload: function (file) {
        if (!currentNode) {
          return Promise.reject(new Error('尚未開啟任何筆記'));
        }
        return window.NotesApi.uploadImage(currentNode.path, file);
      },
    });

    document.getElementById('btn-new-folder').addEventListener('click', function () {
      promptCreate('folder');
    });
    document.getElementById('btn-new-note').addEventListener('click', function () {
      promptCreate('note');
    });
    toggleSourceBtn.addEventListener('click', toggleViewMode);
    copySourceBtn.addEventListener('click', copyCurrentSource);
    sourceEditorEl.addEventListener('input', scheduleSave);
    versionsBtn.addEventListener('click', toggleVersionsPanel);
    document.addEventListener('mousedown', function (e) {
      if (!versionsPanel.hidden && !versionsPanel.contains(e.target) && !versionsBtn.contains(e.target)) {
        closeVersionsPanel();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !versionsPanel.hidden) {
        closeVersionsPanel();
      }
    });

    staleCheckTimer = setInterval(checkForRemoteUpdate, 20000);
    window.addEventListener('focus', checkForRemoteUpdate);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) {
        checkForRemoteUpdate();
      }
    });

    reloadTree().then(function (tree) {
      restoreFromHash(tree);
    });
  });

  window.NotesApp = {
    reloadTree: reloadTree,
    onNodeDeleted: onNodeDeleted,
    onNodeMoved: onNodeMoved,
  };
})();
