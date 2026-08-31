(function () {
  var currentNode = null;
  var activeParentPath = '';
  var saveTimer = null;
  var saveStatusEl = null;
  var viewMode = 'block';
  var blockEditorEl = null;
  var sourceEditorEl = null;
  var toggleSourceBtn = null;
  var copySourceBtn = null;
  var copyFeedbackTimer = null;
  var noteTitleEl = null;

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
    currentNode = node;
    activeParentPath = parentDirOf(node.path);
    window.NotesTree.setSelected(node.path);
    setHashForPath(node.path);
    document.getElementById('editor-empty').hidden = true;
    document.getElementById('editor-content').hidden = false;
    document.getElementById('note-title').textContent = node.name;
    resetViewMode();
    setStatus('載入中…');

    window.NotesApi.getNote(node.path).then(function (data) {
      window.NotesEditor.load(data.blocks, parentDirOf(node.path));
      setStatus(formatRelativeTime(data.updated_at));
    }).catch(function (err) {
      setStatus('載入失敗：' + err.message);
    });
  }

  function resetViewMode() {
    viewMode = 'block';
    blockEditorEl.hidden = false;
    sourceEditorEl.hidden = true;
    sourceEditorEl.value = '';
    toggleSourceBtn.textContent = '檢視原始碼';
  }

  function setViewMode(mode) {
    viewMode = mode;
    if (mode === 'source') {
      sourceEditorEl.value = window.NotesEditor.getMarkdownSource();
      blockEditorEl.hidden = true;
      sourceEditorEl.hidden = false;
      toggleSourceBtn.textContent = '切換為區塊編輯';
    } else {
      window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
      blockEditorEl.hidden = false;
      sourceEditorEl.hidden = true;
      toggleSourceBtn.textContent = '檢視原始碼';
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
      copySourceBtn.textContent = '已複製！';
      copyFeedbackTimer = setTimeout(function () {
        copySourceBtn.textContent = '複製原始碼';
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

  function scheduleSave() {
    if (!currentNode) {
      return;
    }
    setStatus('編輯中…');
    if (saveTimer) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(function () {
      if (viewMode === 'source') {
        window.NotesEditor.loadFromMarkdownSource(sourceEditorEl.value);
      }
      var blocks = window.NotesEditor.getBlocks();
      var savingNode = currentNode;
      window.NotesApi.saveNote(savingNode.path, blocks).then(function () {
        if (currentNode === savingNode) {
          setStatus('已儲存 ' + new Date().toLocaleTimeString());
        }
      }).catch(function (err) {
        if (currentNode === savingNode) {
          setStatus('儲存失敗，內容尚未儲存：' + err.message);
        }
      });
    }, 800);
  }

  function onFolderClicked(node) {
    activeParentPath = node.path;
    window.NotesTree.setSelected(node.path);
  }

  function promptCreate(type) {
    window.NotesModal.prompt(type === 'folder' ? '新資料夾名稱' : '新筆記名稱').then(function (name) {
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

  function commitTitleRename() {
    if (!currentNode) {
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
